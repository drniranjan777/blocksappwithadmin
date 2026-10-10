import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { OtpService } from '../auth/otp.service.js';
import { TwoFactorService } from '../auth/two-factor.service.js';
import { UserSessionService } from '../auth/user-session.service.js';
import { ReauthService } from '../auth/reauth.service.js';
import { maskIp } from '../common/crypto/mask.js';
import { Errors } from '../common/errors/app-error.js';
import { Page, clampLimit, decodeCursor } from '../common/pagination/cursor.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma, SecurityEvent, SecurityEventType } from '../generated/prisma/client.js';
import { toVerification } from '../auth/auth.types.js';
import { SecurityEventService } from './security-events.service.js';
import type { RequestInfo } from '../auth/user-session.service.js';

const cursorSchema = z.object({ t: z.string(), id: z.string() });

const KIND_TYPES: Record<string, SecurityEventType[]> = {
  successful: ['LOGIN_SUCCESS', 'NEW_DEVICE_LOGIN'],
  failed: ['LOGIN_FAILED', 'LOGIN_BLOCKED', 'ACCOUNT_LOCKED'],
  suspicious: ['SUSPICIOUS_LOGIN', 'REFRESH_TOKEN_REUSE'],
};

const SEVERITY_ORDER = { INFO: 0, WARNING: 1, CRITICAL: 2 } as const;

export function toEventView(e: SecurityEvent) {
  return {
    id: e.id,
    type: e.type,
    severity: e.severity,
    ip: e.ip ? maskIp(e.ip) : null,
    deviceLabel: e.deviceLabel,
    locationLabel: e.locationLabel,
    riskScore: e.riskScore,
    createdAt: e.createdAt.toISOString(),
    acknowledged: !!e.acknowledgedAt,
  };
}

/** What a person can see and do about the security of their own account. */
@Injectable()
export class SecurityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: UserSessionService,
    private readonly events: SecurityEventService,
    private readonly twoFactor: TwoFactorService,
    private readonly otp: OtpService,
    private readonly reauth: ReauthService,
  ) {}

  // ------------------------------------------------------- login activity --

  async listEvents(
    userId: string,
    q: {
      cursor?: string | undefined;
      limit?: number | undefined;
      kind?: string | undefined;
      minSeverity?: 'INFO' | 'WARNING' | 'CRITICAL' | undefined;
      unacknowledged?: boolean | undefined;
    },
  ) {
    const limit = clampLimit(q.limit);
    const after = decodeCursor(q.cursor, cursorSchema);
    const where: Prisma.SecurityEventWhereInput = {
      userId,
      ...(q.kind && KIND_TYPES[q.kind] ? { type: { in: KIND_TYPES[q.kind] } } : {}),
      ...(q.minSeverity
        ? {
            severity: {
              in: (Object.keys(SEVERITY_ORDER) as (keyof typeof SEVERITY_ORDER)[]).filter(
                (s) =>
                  SEVERITY_ORDER[s] >= SEVERITY_ORDER[q.minSeverity as keyof typeof SEVERITY_ORDER],
              ),
            },
          }
        : {}),
      ...(q.unacknowledged ? { acknowledgedAt: null } : {}),
      ...(after
        ? {
            OR: [
              { createdAt: { lt: new Date(after.t) } },
              { createdAt: new Date(after.t), id: { lt: after.id } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.securityEvent.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.createdAt.toISOString(), id: r.id }),
      toEventView,
    );
  }

  async getEvent(userId: string, id: string) {
    const e = await this.prisma.securityEvent.findFirst({ where: { id, userId } });
    if (!e) throw Errors.notFound('Event');
    return toEventView(e);
  }

  async acknowledge(userId: string, id: string) {
    const res = await this.prisma.securityEvent.updateMany({
      where: { id, userId, acknowledgedAt: null },
      data: { acknowledgedAt: new Date() },
    });
    if (res.count === 0) return this.getEvent(userId, id); // already done, or not theirs (404 above)
    return this.getEvent(userId, id);
  }

  // ----------------------------------------------------------- preferences --

  async getPreferences(userId: string) {
    const s = await this.prisma.userSettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    return {
      securityAlertEmail: s.securityAlertEmail,
      securityAlertPush: s.securityAlertPush,
      loginAlerts: s.loginAlerts,
    };
  }

  async setPreferences(
    userId: string,
    p: {
      securityAlertEmail?: boolean | undefined;
      securityAlertPush?: boolean | undefined;
      loginAlerts?: boolean | undefined;
    },
  ) {
    const data = {
      ...(p.securityAlertEmail === undefined ? {} : { securityAlertEmail: p.securityAlertEmail }),
      ...(p.securityAlertPush === undefined ? {} : { securityAlertPush: p.securityAlertPush }),
      ...(p.loginAlerts === undefined ? {} : { loginAlerts: p.loginAlerts }),
    };
    await this.prisma.userSettings.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
    return this.getPreferences(userId);
  }

  /** The security e-mails and alerts that were sent to this account. Never the content, only that they were. */
  async sentAlerts(userId: string) {
    const rows = await this.prisma.notificationDelivery.findMany({
      where: { userId, template: { startsWith: 'security_' } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((d) => ({
      id: d.id,
      channel: d.channel,
      // Which alert it was (`security_password_changed`, ...), so an app can label it in any language.
      template: d.template,
      subject: d.subject,
      to: d.toMasked,
      status: d.status,
      sentAt: (d.sentAt ?? d.createdAt).toISOString(),
    }));
  }

  // ---------------------------------------------------------- secure account --

  /** "This wasn't me": sign other devices out and tell the owner what to do next. */
  async secureAccount(
    userId: string,
    currentSessionId: string,
    includeThisDevice: boolean,
    ctx: RequestInfo,
  ) {
    const signedOut = includeThisDevice
      ? await this.sessions.revokeAll(userId, 'SECURITY')
      : await this.sessions.revokeOthers(userId, currentSessionId, 'SECURITY');
    await this.events.record({
      userId,
      type: 'ALL_SESSIONS_REVOKED',
      severity: 'CRITICAL',
      sessionId: currentSessionId,
      ip: ctx.ip,
      locationLabel: ctx.locationLabel,
      details: { signedOut, secureAccount: true },
      notify: { template: 'security_secure_account', vars: { time: new Date().toUTCString() } },
    });
    return { signedOut, nextStep: 'change_password' as const };
  }

  // ------------------------------------------------------------- two-factor --

  async twoFactorStatus(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { twoFactorEnabled: true, twoFactorMethod: true },
    });
    return {
      enabled: u.twoFactorEnabled,
      method: u.twoFactorMethod?.toLowerCase() ?? null,
      backupCodesLeft: u.twoFactorEnabled
        ? await this.twoFactor.backupCodesLeft('user', userId)
        : 0,
    };
  }

  async twoFactorSetup(
    userId: string,
    method: 'totp' | 'sms' | 'email',
    password: string,
    ctx: RequestInfo,
  ) {
    const user = await this.reauth.requirePassword(userId, password);
    if (user.twoFactorEnabled) throw Errors.conflict('Two-step verification is already on.');
    if (method === 'totp') {
      const label = user.email ?? user.phone ?? user.username;
      return { method, ...(await this.twoFactor.beginTotpSetup('user', userId, label)) };
    }
    const destination =
      method === 'email'
        ? user.emailVerifiedAt
          ? user.email
          : null
        : user.phoneVerifiedAt
          ? user.phone
          : null;
    if (!destination)
      throw Errors.precondition(
        `Verify your ${method === 'email' ? 'e-mail address' : 'phone number'} first.`,
      );
    const challenge = await this.otp.issue({
      userId,
      purpose: 'TWO_FACTOR_SETUP',
      channel: method === 'email' ? 'EMAIL' : 'SMS',
      destination,
      ip: ctx.ip,
    });
    return { method, verification: toVerification(challenge) };
  }

  async twoFactorConfirm(
    userId: string,
    input: { challengeId?: string | undefined; code: string },
    ctx: RequestInfo,
  ) {
    let backupCodes: string[];
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { twoFactorSecretEnc: true, twoFactorEnabled: true },
    });
    if (user.twoFactorEnabled) throw Errors.conflict('Two-step verification is already on.');

    if (input.challengeId) {
      const c = await this.otp.verify({
        challengeId: input.challengeId,
        code: input.code,
        purposes: ['TWO_FACTOR_SETUP'],
        userId,
      });
      backupCodes = await this.twoFactor.enableOtpMethod(
        userId,
        c.channel === 'EMAIL' ? 'EMAIL' : 'SMS',
      );
    } else {
      backupCodes = await this.twoFactor.confirmTotpSetup('user', userId, input.code);
    }
    await this.events.record({
      userId,
      type: 'TWO_FACTOR_ENABLED',
      severity: 'INFO',
      ip: ctx.ip,
      locationLabel: ctx.locationLabel,
      notify: { template: 'security_two_factor_enabled', vars: { time: new Date().toUTCString() } },
    });
    // The only time these are ever shown.
    return { enabled: true, backupCodes };
  }

  private async requirePassword(userId: string, password: string): Promise<void> {
    await this.reauth.requirePassword(userId, password);
  }

  async twoFactorDisable(userId: string, password: string, ctx: RequestInfo) {
    await this.requirePassword(userId, password);
    await this.twoFactor.disable('user', userId);
    await this.events.record({
      userId,
      type: 'TWO_FACTOR_DISABLED',
      severity: 'WARNING',
      ip: ctx.ip,
      locationLabel: ctx.locationLabel,
      notify: {
        template: 'security_two_factor_disabled',
        vars: { time: new Date().toUTCString() },
      },
    });
    return { enabled: false };
  }

  async regenerateBackupCodes(userId: string, password: string) {
    await this.requirePassword(userId, password);
    const status = await this.twoFactorStatus(userId);
    if (!status.enabled) throw Errors.precondition('Turn on two-step verification first.');
    return { backupCodes: await this.twoFactor.regenerateBackupCodes('user', userId) };
  }
}
