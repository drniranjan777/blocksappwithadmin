import { Inject, Injectable } from '@nestjs/common';
import { LoginAttemptStore } from '../../auth/login-attempts.js';
import { TokenService } from '../../auth/token.service.js';
import { TwoFactorService } from '../../auth/two-factor.service.js';
import {
  ADMIN_PASSWORD_POLICY,
  PasswordHasher,
  checkPassword,
} from '../../common/crypto/password.js';
import { hmacHex } from '../../common/crypto/tokens.js';
import { AppError, Errors } from '../../common/errors/app-error.js';
import type { AdminAuthContext } from '../../common/http/request.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { AdminUser } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { AdminPermissionsService } from '../rbac/admin-permissions.service.js';
import { AdminMailer } from '../users/admin-mailer.js';
import { AdminSessionService, type RequestMeta } from './admin-session.service.js';

export type AdminNextStep = 'password_change' | 'two_factor_setup' | 'two_factor' | null;

export interface AdminSummary {
  id: string;
  email: string;
  name: string;
  status: string;
  roles: Array<{ key: string; name: string }>;
  /** What this person may do. The console uses it to hide what they cannot; the server enforces it. */
  permissions: string[];
  twoFactorEnabled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
}

export interface AdminAuthResult {
  /** What is left before full access. `null` means the person is fully signed in. */
  nextStep: AdminNextStep;
  tokens: {
    accessToken: string;
    refreshToken: string;
    tokenType: 'Bearer';
    expiresIn: number;
    expiresAt: string;
  };
  admin: AdminSummary;
  /** Shown once, when two-step verification is turned on. */
  backupCodes?: string[];
}

/** The order in which a new account is brought up to full access. */
export function nextStepFor(
  admin: Pick<AdminUser, 'mustChangePassword' | 'twoFactorEnabled'>,
  mfaVerified: boolean,
): AdminNextStep {
  if (admin.mustChangePassword) return 'password_change';
  if (!admin.twoFactorEnabled) return 'two_factor_setup';
  if (!mfaVerified) return 'two_factor';
  return null;
}

/**
 * Staff sign-in. Compared with the app-user flow it differs deliberately:
 *
 *   - two-step verification is **mandatory**: there is no path to a privileged
 *     call without it, and an account that has none must set it up first;
 *   - a password someone else chose (the invitation) must be replaced before
 *     anything else is allowed;
 *   - there is no "remember this device", and no way to skip a step.
 *
 * Until the steps are done the tokens carry the `enrol` scope and the guard lets
 * through only the routes that finish the set-up. Wrong answers are as generic
 * as for app users, and lock-out counts what was typed, not just real accounts.
 */
@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly sessions: AdminSessionService,
    private readonly twoFactor: TwoFactorService,
    private readonly access: AdminPermissionsService,
    private readonly attempts: LoginAttemptStore,
    private readonly audit: AuditService,
    private readonly mailer: AdminMailer,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private key(kind: string, value: string): string {
    return hmacHex(this.env.OTP_HMAC_SECRET, `admin:${kind}:${value}`);
  }

  private lockMs(): number {
    return this.env.AUTH_LOCK_MINUTES * 60_000;
  }

  // ----------------------------------------------------------------- login --

  async login(
    input: { email: string; password: string },
    meta: RequestMeta,
  ): Promise<AdminAuthResult> {
    const email = input.email.trim().toLowerCase();
    const key = this.key('login', email);

    const state = await this.attempts.get(key);
    if (state.lockedUntil && state.lockedUntil > new Date())
      throw Errors.accountLocked(state.lockedUntil);

    const admin = await this.prisma.adminUser.findUnique({ where: { email } });
    const passwordOk = admin
      ? await this.hasher.verify(admin.passwordHash, input.password)
      : await this.hasher.verifyDummy(input.password);
    if (!admin || !passwordOk) return this.failLogin(key, admin, meta);

    const now = new Date();
    if (admin.lockedUntil && admin.lockedUntil > now) throw Errors.accountLocked(admin.lockedUntil);

    // From here the password was right. These refusals look the same as a wrong
    // password to the caller; the audit trail says what really happened.
    if (admin.status === 'DISABLED') {
      await this.denied(admin, 'admin.login.disabled', meta);
      throw Errors.invalidCredentials();
    }
    if (admin.status === 'INVITED' && (!admin.inviteExpiresAt || admin.inviteExpiresAt <= now)) {
      await this.denied(admin, 'admin.login.invite_expired', meta);
      throw Errors.invalidCredentials();
    }

    await this.attempts.reset(key);
    if (admin.failedLoginCount > 0 || admin.lockedUntil) {
      await this.prisma.adminUser.update({
        where: { id: admin.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    }
    const { session, refreshToken } = await this.sessions.create(admin.id, meta);
    return this.respond(admin.id, session.id, false, refreshToken);
  }

  private async failLogin(key: string, admin: AdminUser | null, meta: RequestMeta): Promise<never> {
    const state = await this.attempts.fail(key, this.env.AUTH_MAX_FAILED_LOGINS, this.lockMs());
    const remaining = Math.max(this.env.AUTH_MAX_FAILED_LOGINS - state.failures, 0);
    if (admin) {
      await this.prisma.adminUser.update({
        where: { id: admin.id },
        data: {
          failedLoginCount: { increment: 1 },
          ...(state.lockedUntil ? { lockedUntil: state.lockedUntil } : {}),
        },
      });
      await this.audit.record({
        actorType: 'ADMIN',
        actorId: admin.id,
        actorLabel: admin.name,
        action: state.lockedUntil ? 'admin.login.locked' : 'admin.login.failed',
        targetType: 'admin',
        targetId: admin.id,
        ip: meta.ip,
        userAgent: meta.userAgent,
        after: { attemptsRemaining: remaining },
      });
    }
    if (state.lockedUntil) throw Errors.accountLocked(state.lockedUntil, true);
    throw Errors.invalidCredentials(remaining);
  }

  private async denied(admin: AdminUser, action: string, meta: RequestMeta): Promise<void> {
    await this.audit.record({
      actorType: 'ADMIN',
      actorId: admin.id,
      actorLabel: admin.name,
      action,
      targetType: 'admin',
      targetId: admin.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  // ---------------------------------------------------------- second factor --

  /** The authenticator (or backup) code, after the password. Completes the sign-in. */
  async verifySecondFactor(
    ctx: AdminAuthContext,
    input: { method: 'totp' | 'backup_code'; code: string },
    meta: RequestMeta,
  ): Promise<AdminAuthResult> {
    if (ctx.nextStep !== 'two_factor') {
      if (ctx.nextStep) throw Errors.enrolmentRequired(ctx.nextStep);
      throw Errors.conflict('This sign-in is already verified.');
    }
    const key = this.key('mfa', ctx.adminId);
    await this.assertNotLocked(key);

    const ok =
      input.method === 'totp'
        ? await this.twoFactor.verifyTotp('admin', ctx.adminId, input.code)
        : await this.twoFactor.consumeBackupCode('admin', ctx.adminId, input.code);
    if (!ok) await this.failSecondFactor(key, ctx, meta);

    await this.attempts.reset(key);
    await this.sessions.markMfaVerified(ctx.sessionId);
    await this.finishSignIn(ctx, input.method, meta);
    return this.respond(ctx.adminId, ctx.sessionId, true);
  }

  private async assertNotLocked(key: string): Promise<void> {
    const state = await this.attempts.get(key);
    if (state.lockedUntil && state.lockedUntil > new Date())
      throw Errors.accountLocked(state.lockedUntil);
  }

  /** A wrong code counts; too many end the sign-in so the password must be entered again. */
  private async failSecondFactor(
    key: string,
    ctx: AdminAuthContext,
    meta: RequestMeta,
  ): Promise<never> {
    const state = await this.attempts.fail(key, this.env.AUTH_MAX_FAILED_LOGINS, this.lockMs());
    await this.audit.record({
      actorType: 'ADMIN',
      actorId: ctx.adminId,
      actorLabel: ctx.name,
      action: state.lockedUntil ? 'admin.two_factor.locked' : 'admin.two_factor.failed',
      targetType: 'admin',
      targetId: ctx.adminId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    if (state.lockedUntil) {
      await this.sessions.revoke(ctx.adminId, ctx.sessionId, 'SECURITY');
      throw Errors.accountLocked(state.lockedUntil, true);
    }
    throw Errors.otpInvalid(Math.max(this.env.AUTH_MAX_FAILED_LOGINS - state.failures, 0));
  }

  private async finishSignIn(
    ctx: AdminAuthContext,
    method: string,
    meta: RequestMeta,
  ): Promise<void> {
    await this.prisma.adminUser.update({
      where: { id: ctx.adminId },
      data: { lastLoginAt: new Date() },
    });
    await this.audit.record({
      actorType: 'ADMIN',
      actorId: ctx.adminId,
      actorLabel: ctx.name,
      action: 'admin.login',
      targetType: 'admin',
      targetId: ctx.adminId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      after: { method },
    });
  }

  // ------------------------------------------------------------- enrolment --

  async changePassword(
    ctx: AdminAuthContext,
    input: { currentPassword: string; newPassword: string },
    meta: RequestMeta,
  ): Promise<AdminAuthResult> {
    const key = this.key('pw', ctx.adminId);
    await this.assertNotLocked(key);

    const admin = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: ctx.adminId } });
    if (!(await this.hasher.verify(admin.passwordHash, input.currentPassword))) {
      const after = await this.attempts.fail(key, this.env.AUTH_MAX_FAILED_LOGINS, this.lockMs());
      if (after.lockedUntil) throw Errors.accountLocked(after.lockedUntil, true);
      throw Errors.invalidCredentials(
        Math.max(this.env.AUTH_MAX_FAILED_LOGINS - after.failures, 0),
      );
    }
    await this.attempts.reset(key);

    if (input.currentPassword === input.newPassword) {
      throw Errors.validation([{ field: 'newPassword', reasons: ['same_as_current'] }]);
    }
    const issues = checkPassword(input.newPassword, ADMIN_PASSWORD_POLICY, [
      admin.email,
      ...admin.name.split(/\s+/),
    ]);
    if (issues.length) throw Errors.validation([{ field: 'newPassword', reasons: issues }]);

    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { passwordHash: await this.hasher.hash(input.newPassword), mustChangePassword: false },
    });
    const ended = await this.sessions.revokeAll(admin.id, 'PASSWORD_CHANGED', ctx.sessionId);
    await this.audit.record({
      actorType: 'ADMIN',
      actorId: admin.id,
      actorLabel: admin.name,
      action: 'admin.password.changed',
      targetType: 'admin',
      targetId: admin.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      after: { otherSessionsEnded: ended },
    });
    void this.mailer.sendSecurityNotice({
      to: admin.email,
      name: admin.name,
      subject: 'Your BLOCKS admin password was changed',
      text: `Your admin console password was changed at ${new Date().toUTCString()}. All other devices were signed out.`,
    });
    return this.respond(admin.id, ctx.sessionId, true);
  }

  async beginTwoFactorSetup(
    ctx: AdminAuthContext,
  ): Promise<{ secret: string; otpauthUri: string }> {
    if (ctx.nextStep === 'password_change') throw Errors.enrolmentRequired('password_change');
    return this.twoFactor.beginTotpSetup('admin', ctx.adminId, ctx.email);
  }

  async confirmTwoFactorSetup(
    ctx: AdminAuthContext,
    code: string,
    meta: RequestMeta,
  ): Promise<AdminAuthResult> {
    if (ctx.nextStep === 'password_change') throw Errors.enrolmentRequired('password_change');
    const key = this.key('mfa', ctx.adminId);
    await this.assertNotLocked(key);
    let backupCodes: string[];
    try {
      backupCodes = await this.twoFactor.confirmTotpSetup('admin', ctx.adminId, code);
    } catch (error) {
      // A wrong first code counts against the same budget as a wrong sign-in code.
      if (error instanceof AppError && error.code === 'OTP_INVALID') {
        return this.failSecondFactor(key, ctx, meta);
      }
      throw error;
    }
    await this.attempts.reset(key);
    await this.prisma.adminUser.update({
      where: { id: ctx.adminId },
      data: { status: 'ACTIVE', inviteExpiresAt: null },
    });
    await this.sessions.markMfaVerified(ctx.sessionId);
    await this.audit.record({
      actorType: 'ADMIN',
      actorId: ctx.adminId,
      actorLabel: ctx.name,
      action: 'admin.two_factor.enrolled',
      targetType: 'admin',
      targetId: ctx.adminId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    await this.finishSignIn(ctx, 'totp_enrolment', meta);
    return { ...(await this.respond(ctx.adminId, ctx.sessionId, true)), backupCodes };
  }

  // ------------------------------------------------- refresh, sign-out, me --

  async refresh(refreshToken: string, meta: RequestMeta): Promise<AdminAuthResult> {
    const rotated = await this.sessions.rotate(refreshToken, meta);
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: rotated.session.adminId },
    });
    if (!admin || admin.status === 'DISABLED') {
      await this.sessions.revoke(rotated.session.adminId, rotated.session.id, 'ADMIN');
      throw Errors.sessionRevoked();
    }
    return this.respond(admin.id, rotated.session.id, false, rotated.refreshToken);
  }

  async logout(ctx: AdminAuthContext, meta: RequestMeta): Promise<void> {
    await this.sessions.revoke(ctx.adminId, ctx.sessionId, 'LOGOUT');
    await this.audit.record({
      actorType: 'ADMIN',
      actorId: ctx.adminId,
      actorLabel: ctx.name,
      action: 'admin.logout',
      targetType: 'admin',
      targetId: ctx.adminId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  async me(ctx: AdminAuthContext): Promise<{ nextStep: AdminNextStep; admin: AdminSummary }> {
    return { nextStep: ctx.nextStep, admin: await this.summary(ctx.adminId) };
  }

  // --------------------------------------------------------------- helpers --

  async summary(adminId: string): Promise<AdminSummary> {
    const admin = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    const access = await this.access.accessFor(adminId);
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      status: admin.status,
      roles: access.roles,
      permissions: [...access.permissions].sort(),
      twoFactorEnabled: admin.twoFactorEnabled,
      mustChangePassword: admin.mustChangePassword,
      lastLoginAt: admin.lastLoginAt?.toISOString() ?? null,
    };
  }

  /**
   * The answer to every step: where the person stands now, and tokens that match.
   * The scope is decided from the account's *current* state, never from what the
   * caller asked, so a step cannot be skipped by asking for a bigger token.
   */
  private async respond(
    adminId: string,
    sessionId: string,
    reissueRefresh: boolean,
    refreshToken?: string,
  ): Promise<AdminAuthResult> {
    const admin = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    const session = await this.prisma.adminSession.findUniqueOrThrow({ where: { id: sessionId } });
    const nextStep = nextStepFor(admin, !!session.mfaVerifiedAt);
    const access = await this.tokens.signAccess('admin', {
      subject: adminId,
      sessionId,
      methods: session.mfaVerifiedAt ? ['pwd', 'mfa'] : ['pwd'],
      scope: nextStep ? 'enrol' : 'full',
    });
    const refresh =
      refreshToken ?? (reissueRefresh ? await this.sessions.reissue(sessionId) : undefined);
    if (!refresh) throw Errors.internal();
    return {
      nextStep,
      tokens: {
        accessToken: access.token,
        refreshToken: refresh,
        tokenType: 'Bearer',
        expiresIn: access.expiresInSeconds,
        expiresAt: access.expiresAt.toISOString(),
      },
      admin: await this.summary(adminId),
    };
  }
}
