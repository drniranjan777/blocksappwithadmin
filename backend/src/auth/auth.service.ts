import { Inject, Injectable } from '@nestjs/common';
import { PasswordHasher, checkPassword } from '../common/crypto/password.js';
import { maskEmail, maskPhone } from '../common/crypto/mask.js';
import { Errors, type FieldIssue } from '../common/errors/app-error.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma, User } from '../generated/prisma/client.js';
import { NotificationService } from '../notifications/notification.service.js';
import { SecurityEventService, deviceLabelOf } from '../security/security-events.service.js';
import type {
  ChallengeRefDto,
  LoginDto,
  LoginVerifyDto,
  RegisterDto,
  VerifyContactDto,
} from './dto/auth.dto.js';
import {
  type Identifier,
  normalizeEmail,
  normalizePhone,
  normalizeUsername,
  parseIdentifier,
} from './identifier.js';
import { LoginAttemptStore, loginAttemptKey } from './login-attempts.js';
import {
  type LoginSignals,
  assessLogin,
  changedPasswordRecently,
  networkOf,
} from './login-risk.js';
import type {
  AuthResult,
  AuthTokens,
  LoginOutcome,
  MeResponse,
  VerificationChallenge,
} from './auth.types.js';
import { toVerification } from './auth.types.js';
import { OtpService, type IssuedChallenge } from './otp.service.js';
import { isReservedUsername } from './reserved-usernames.js';
import { TokenService } from './token.service.js';
import { TwoFactorService } from './two-factor.service.js';
import { type DeviceInfo, type RequestInfo, UserSessionService } from './user-session.service.js';

type UserWithProfile = Prisma.UserGetPayload<{ include: { profile: true; settings: true } }>;

const DAY = 86_400_000;
export const MIN_ACCOUNT_AGE_YEARS = 13;

export function toMe(u: UserWithProfile): MeResponse {
  return {
    id: u.id,
    username: u.username,
    displayName: u.profile?.displayName ?? u.username,
    email: u.email ? maskEmail(u.email) : null,
    emailVerified: !!u.emailVerifiedAt,
    phone: u.phone ? maskPhone(u.phone) : null,
    phoneVerified: !!u.phoneVerifiedAt,
    twoFactorEnabled: u.twoFactorEnabled,
    accountType: u.accountType,
    status: u.status,
    language: u.settings?.language ?? 'en',
    createdAt: u.createdAt.toISOString(),
  };
}

function ageOn(born: Date, today: Date): number {
  let years = today.getUTCFullYear() - born.getUTCFullYear();
  const hadBirthday =
    today.getUTCMonth() > born.getUTCMonth() ||
    (today.getUTCMonth() === born.getUTCMonth() && today.getUTCDate() >= born.getUTCDate());
  if (!hadBirthday) years--;
  return years;
}

/**
 * Registration, sign-in, token refresh and sign-out.
 *
 * Every public answer here is written to leak nothing about *which* accounts
 * exist: unknown and known identifiers fail identically, take comparable time
 * (a dummy password check), count against the same lock-out, and registration
 * with an address that is already taken looks like a normal registration.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly sessions: UserSessionService,
    private readonly otp: OtpService,
    private readonly twoFactor: TwoFactorService,
    private readonly events: SecurityEventService,
    private readonly notifications: NotificationService,
    private readonly attempts: LoginAttemptStore,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ------------------------------------------------------------ register --

  async register(
    dto: RegisterDto,
    ctx: RequestInfo,
  ): Promise<{ verification: VerificationChallenge }> {
    const issues: FieldIssue[] = [];
    const username = normalizeUsername(dto.username);
    if (!username) issues.push({ field: 'username', reasons: ['invalid_format'] });
    const email = dto.email === undefined ? undefined : normalizeEmail(dto.email);
    if (dto.email !== undefined && !email) issues.push({ field: 'email', reasons: ['invalid'] });
    const phone = dto.phone === undefined ? undefined : normalizePhone(dto.phone);
    if (dto.phone !== undefined && !phone) issues.push({ field: 'phone', reasons: ['invalid'] });
    if (!email && !phone && issues.length === 0) {
      issues.push({ field: 'email', reasons: ['email_or_phone_required'] });
    }
    const born = new Date(`${dto.dateOfBirth}T00:00:00Z`);
    if (Number.isNaN(born.getTime())) {
      issues.push({ field: 'dateOfBirth', reasons: ['invalid'] });
    } else if (ageOn(born, new Date()) < MIN_ACCOUNT_AGE_YEARS) {
      issues.push({ field: 'dateOfBirth', reasons: ['too_young'] });
    }
    const passwordIssues = checkPassword(dto.password, undefined, [username ?? '', email ?? '']);
    if (passwordIssues.length) issues.push({ field: 'password', reasons: passwordIssues });
    if (issues.length || !username) throw Errors.validation(issues);

    if (isReservedUsername(username))
      throw Errors.conflict('That username is not available.', 'USERNAME_TAKEN');

    // Hash first and always: whether the address is new must not change how long this takes.
    const passwordHash = await this.hasher.hash(dto.password);

    const usernameTaken = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (usernameTaken) throw Errors.conflict('That username is not available.', 'USERNAME_TAKEN');

    const channel = email ? 'EMAIL' : 'SMS';
    const destination = (email ?? phone) as string;
    const purpose = email ? 'EMAIL_VERIFY' : 'PHONE_VERIFY';

    const existing = await this.prisma.user.findFirst({
      where: { OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] },
      select: { id: true, email: true, emailVerifiedAt: true },
    });
    if (existing)
      return {
        verification: await this.registrationDecoy(
          existing,
          email,
          channel,
          destination,
          purpose,
          ctx,
        ),
      };

    let user: User;
    try {
      user = await this.prisma.user.create({
        data: {
          username,
          email: email ?? null,
          phone: phone ?? null,
          passwordHash,
          // Left empty: choosing a password at sign-up is not a *change* (see `changedPasswordRecently`).
          profile: {
            create: {
              displayName: dto.displayName.trim(),
              country: 'IN',
              state: dto.state ?? null,
              district: dto.district ?? null,
              dateOfBirth: born,
            },
          },
          settings: { create: { language: dto.language ?? 'en' } },
        },
      });
    } catch (error) {
      const e = error as { code?: string; meta?: { target?: unknown } };
      if (e.code !== 'P2002') throw error;
      // Lost a race. A taken username is public; a taken e-mail or phone is not.
      if (String(JSON.stringify(e.meta ?? {})).includes('username')) {
        throw Errors.conflict('That username is not available.', 'USERNAME_TAKEN');
      }
      const winner = await this.prisma.user.findFirst({
        where: { OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] },
        select: { id: true, email: true, emailVerifiedAt: true },
      });
      if (!winner) throw error;
      return {
        verification: await this.registrationDecoy(
          winner,
          email,
          channel,
          destination,
          purpose,
          ctx,
        ),
      };
    }

    const challenge = await this.otp.issue({
      userId: user.id,
      purpose,
      channel,
      destination,
      ip: ctx.ip,
    });
    return { verification: toVerification(challenge) };
  }

  /** The answer for "this e-mail/phone already has an account": identical in shape to a real one. */
  private async registrationDecoy(
    existing: { id: string; email: string | null; emailVerifiedAt: Date | null },
    email: string | undefined,
    channel: 'EMAIL' | 'SMS',
    destination: string,
    purpose: 'EMAIL_VERIFY' | 'PHONE_VERIFY',
    ctx: RequestInfo,
  ): Promise<VerificationChallenge> {
    if (email && existing.email === email && existing.emailVerifiedAt) {
      // Tell the real owner, privately, that someone tried.
      await this.notifications
        .notify({
          userId: existing.id,
          type: 'SECURITY_ALERT',
          template: 'security_account_exists',
          severity: 'INFO',
          dedupeKey: `exists:${Math.floor(Date.now() / DAY)}`,
        })
        .catch(() => undefined);
    }
    const decoy = await this.otp.issue({
      purpose,
      channel,
      destination,
      ip: ctx.ip,
      deliver: false,
    });
    return toVerification(decoy);
  }

  async verifyContact(dto: VerifyContactDto, ctx: RequestInfo): Promise<AuthResult> {
    const challenge = await this.otp.verify({
      challengeId: dto.challengeId,
      code: dto.code,
      purposes: ['EMAIL_VERIFY', 'PHONE_VERIFY'],
    });
    if (!challenge.userId) throw Errors.otpInvalid(this.env.OTP_MAX_ATTEMPTS - 1);
    const now = new Date();
    const user = await this.prisma.user.update({
      where: { id: challenge.userId },
      data:
        challenge.purpose === 'EMAIL_VERIFY' ? { emailVerifiedAt: now } : { phoneVerifiedAt: now },
      include: { profile: true, settings: true },
    });
    this.assertCanSignIn(user);
    return this.startSession(user, dto.device, ctx, ['otp'], undefined);
  }

  async resendVerification(dto: ChallengeRefDto, ctx: RequestInfo): Promise<VerificationChallenge> {
    // A new code goes only to the destination the challenge was made for, so asking
    // again (with the unguessable challenge id) can never redirect one. Password
    // resets have their own route: their answer must not say where the code went.
    const c = await this.otp.resend(
      dto.challengeId,
      ['EMAIL_VERIFY', 'PHONE_VERIFY', 'LOGIN_2FA', 'CONTACT_CHANGE', 'TWO_FACTOR_SETUP'],
      ctx.ip,
    );
    return toVerification(c);
  }

  // --------------------------------------------------------------- login --

  private attemptKey(id: Identifier): string {
    return loginAttemptKey(this.env.OTP_HMAC_SECRET, id.kind, id.value);
  }

  private findByIdentifier(id: Identifier): Promise<UserWithProfile | null> {
    const where =
      id.kind === 'email'
        ? { email: id.value }
        : id.kind === 'phone'
          ? { phone: id.value }
          : { username: id.value };
    return this.prisma.user.findUnique({ where, include: { profile: true, settings: true } });
  }

  private assertCanSignIn(user: Pick<User, 'status'>): void {
    if (user.status === 'SUSPENDED') throw Errors.accountSuspended();
    if (user.status === 'DELETED') throw Errors.invalidCredentials();
  }

  async login(dto: LoginDto, ctx: RequestInfo): Promise<LoginOutcome> {
    const identifier = parseIdentifier(dto.identifier);
    const key = this.attemptKey(identifier);
    const [attempts, found] = await Promise.all([
      this.attempts.get(key),
      this.findByIdentifier(identifier),
    ]);
    const user = found && found.status !== 'DELETED' ? found : null;

    const now = new Date();
    const lockedUntil = [attempts.lockedUntil, user?.lockedUntil ?? undefined]
      .filter((d): d is Date => !!d && d > now)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    if (lockedUntil) throw Errors.accountLocked(lockedUntil);

    const passwordOk = user
      ? await this.hasher.verify(user.passwordHash, dto.password)
      : await this.hasher.verifyDummy(dto.password);
    if (!user || !passwordOk) return this.failLogin(key, user, ctx, dto.device);

    this.assertCanSignIn(user);

    await this.attempts.reset(key);
    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    }
    if (this.hasher.needsRehash(user.passwordHash)) {
      void this.hasher
        .hash(dto.password)
        .then((passwordHash) =>
          this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
        )
        .catch(() => undefined);
    }

    // Prove they own a contact before anything else: an unverified account has nothing to protect yet.
    if (!user.emailVerifiedAt && !user.phoneVerifiedAt) {
      const challenge = await this.issueContactVerification(user, ctx);
      return {
        status: 'verification_required',
        reason: 'unverified_contact',
        verification: toVerification(challenge),
      };
    }

    const signals = await this.signalsFor(user, dto.device, ctx, attempts.failures);
    const risk = assessLogin(signals);

    if (user.twoFactorEnabled) return this.startTwoFactor(user, ctx);

    if (risk.decision === 'verify') {
      await this.events.record({
        userId: user.id,
        type: 'SUSPICIOUS_LOGIN',
        severity: 'WARNING',
        ip: ctx.ip,
        deviceLabel: deviceLabelOf(dto.device),
        locationLabel: ctx.locationLabel,
        riskScore: risk.score,
        details: { reasons: risk.reasons },
        notify: {
          template: 'security_suspicious_login',
          vars: {
            device: deviceLabelOf(dto.device) ?? 'an unrecognised device',
            ...(ctx.locationLabel ? { location: ctx.locationLabel } : {}),
            time: new Date().toUTCString(),
          },
        },
      });
      const challenge = await this.issueLoginChallenge(user, ctx);
      return {
        status: 'verification_required',
        reason: 'unusual_sign_in',
        verification: toVerification(challenge),
      };
    }

    return this.startSession(user, dto.device, ctx, ['pwd'], { signals, ...risk });
  }

  /** Counts the failure (for real and invented accounts alike) and answers. Never returns. */
  private async failLogin(
    key: string,
    user: UserWithProfile | null,
    ctx: RequestInfo,
    device: DeviceInfo | undefined,
  ): Promise<never> {
    const state = await this.attempts.fail(
      key,
      this.env.AUTH_MAX_FAILED_LOGINS,
      this.env.AUTH_LOCK_MINUTES * 60_000,
    );
    const remaining = Math.max(this.env.AUTH_MAX_FAILED_LOGINS - state.failures, 0);

    if (user) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: { increment: 1 },
          lastFailedLoginAt: new Date(),
          ...(state.lockedUntil ? { lockedUntil: state.lockedUntil } : {}),
        },
      });
      await this.events.record({
        userId: user.id,
        type: state.lockedUntil ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
        severity: state.lockedUntil ? 'WARNING' : 'INFO',
        ip: ctx.ip,
        deviceLabel: deviceLabelOf(device),
        locationLabel: ctx.locationLabel,
        riskScore: state.lockedUntil ? 70 : 20,
        details: { attemptsRemaining: remaining },
        ...(state.lockedUntil
          ? {
              notify: {
                template: 'security_account_locked' as const,
                vars: { minutes: this.env.AUTH_LOCK_MINUTES },
              },
            }
          : {}),
      });
    }
    if (state.lockedUntil) throw Errors.accountLocked(state.lockedUntil, true);
    throw Errors.invalidCredentials(remaining);
  }

  private async signalsFor(
    user: UserWithProfile,
    device: DeviceInfo | undefined,
    ctx: RequestInfo,
    recentFailures: number,
  ): Promise<LoginSignals> {
    const prior = await this.prisma.userSession.findMany({
      where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 90 * DAY) } },
      select: { deviceId: true, ip: true, locationLabel: true },
      take: 300,
    });
    const labelled = prior.filter((p) => p.locationLabel);
    return {
      hasHistory: prior.length > 0,
      knownDevice: !!device?.deviceId && prior.some((p) => p.deviceId === device.deviceId),
      knownNetwork:
        !!networkOf(ctx.ip) &&
        prior.some((p) => networkOf(p.ip ?? undefined) === networkOf(ctx.ip)),
      knownLocation:
        ctx.locationLabel && labelled.length
          ? labelled.some((p) => p.locationLabel === ctx.locationLabel)
          : undefined,
      recentFailures,
      accountRisk: user.riskLevel,
      passwordChangedRecently: changedPasswordRecently(user.passwordChangedAt),
    };
  }

  // ------------------------------------------------------- second factors --

  private contactFor(user: Pick<User, 'email' | 'emailVerifiedAt' | 'phone' | 'phoneVerifiedAt'>) {
    if (user.email && user.emailVerifiedAt)
      return { channel: 'EMAIL' as const, destination: user.email };
    if (user.phone && user.phoneVerifiedAt)
      return { channel: 'SMS' as const, destination: user.phone };
    return undefined;
  }

  private issueContactVerification(user: User, ctx: RequestInfo): Promise<IssuedChallenge> {
    return user.email
      ? this.otp.issue({
          userId: user.id,
          purpose: 'EMAIL_VERIFY',
          channel: 'EMAIL',
          destination: user.email,
          ip: ctx.ip,
        })
      : this.otp.issue({
          userId: user.id,
          purpose: 'PHONE_VERIFY',
          channel: 'SMS',
          destination: user.phone as string,
          ip: ctx.ip,
        });
  }

  private async issueLoginChallenge(user: User, ctx: RequestInfo): Promise<IssuedChallenge> {
    const contact = this.contactFor(user);
    if (!contact) throw Errors.precondition('Verify your e-mail or phone number first.');
    return this.otp.issue({
      userId: user.id,
      purpose: 'LOGIN_2FA',
      channel: contact.channel,
      destination: contact.destination,
      ip: ctx.ip,
    });
  }

  private async startTwoFactor(user: User, ctx: RequestInfo): Promise<LoginOutcome> {
    if (user.twoFactorMethod === 'TOTP') {
      // The ticket carries the attempt budget; no code is sent, the person's app makes it.
      const contact = this.contactFor(user);
      const ticket = await this.otp.issue({
        userId: user.id,
        purpose: 'LOGIN_2FA',
        channel: contact?.channel ?? 'EMAIL',
        destination: contact?.destination ?? user.id,
        ip: ctx.ip,
        pendingValue: 'totp',
        deliver: false,
      });
      return {
        status: 'two_factor_required',
        challengeId: ticket.id,
        methods: ['totp', 'backup_code'],
        destinationMasked: null,
      };
    }
    const ticket = await this.issueLoginChallenge(user, ctx);
    return {
      status: 'two_factor_required',
      challengeId: ticket.id,
      methods: ['otp', 'backup_code'],
      destinationMasked: ticket.destinationMasked,
    };
  }

  /** Finishes a sign-in that needed a second step (two-factor, or an unusual-sign-in check). */
  async completeLogin(dto: LoginVerifyDto, ctx: RequestInfo): Promise<AuthResult> {
    const c = await this.otp.claimAttempt({
      challengeId: dto.challengeId,
      purposes: ['LOGIN_2FA'],
    });
    if (!c.userId) return this.otp.failure(c);
    const user = await this.prisma.user.findUnique({
      where: { id: c.userId },
      include: { profile: true, settings: true },
    });
    if (!user) return this.otp.failure(c);

    let ok = false;
    let method = 'otp';
    if (dto.method === 'totp') {
      ok =
        c.pendingValue === 'totp' && (await this.twoFactor.verifyTotp('user', user.id, dto.code));
      method = 'totp';
    } else if (dto.method === 'backup_code') {
      ok = await this.twoFactor.consumeBackupCode('user', user.id, dto.code);
      method = 'backup_code';
    } else {
      ok = c.pendingValue !== 'totp' && (await this.otp.matches(c, dto.code));
    }
    if (!ok) return this.otp.failure(c);

    await this.otp.complete(c.id);
    this.assertCanSignIn(user);
    const signals = await this.signalsFor(user, dto.device, ctx, 0);
    return this.startSession(user, dto.device, ctx, ['pwd', method], {
      signals,
      ...assessLogin(signals),
    });
  }

  // ------------------------------------------------------------- sessions --

  private async startSession(
    user: UserWithProfile,
    device: DeviceInfo | undefined,
    ctx: RequestInfo,
    methods: string[],
    risk: (ReturnType<typeof assessLogin> & { signals: LoginSignals }) | undefined,
  ): Promise<AuthResult> {
    const { session, refreshToken } = await this.sessions.create({
      userId: user.id,
      device,
      request: ctx,
      mfaVerified: methods.some((m) => m !== 'pwd'),
    });
    const access = await this.tokens.signAccess('user', {
      subject: user.id,
      sessionId: session.id,
      methods,
      scope: 'full',
    });
    await this.prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });

    const newDevice = !!risk?.signals.hasHistory && !risk.signals.knownDevice;
    const label = deviceLabelOf(device);
    await this.events.record({
      userId: user.id,
      type: newDevice ? 'NEW_DEVICE_LOGIN' : 'LOGIN_SUCCESS',
      severity: 'INFO',
      sessionId: session.id,
      ip: ctx.ip,
      deviceLabel: label,
      locationLabel: ctx.locationLabel,
      riskScore: risk?.score ?? 0,
      ...(risk?.reasons.length ? { details: { reasons: risk.reasons } } : {}),
      ...(newDevice && (user.settings?.loginAlerts ?? true)
        ? {
            notify: {
              template: 'security_new_device' as const,
              vars: {
                device: label ?? 'a new device',
                ...(ctx.locationLabel ? { location: ctx.locationLabel } : {}),
                time: new Date().toUTCString(),
              },
            },
          }
        : {}),
    });

    return {
      status: 'authenticated',
      tokens: this.shapeTokens(access, refreshToken),
      user: toMe(user),
      newDevice,
    };
  }

  private shapeTokens(
    access: { token: string; expiresAt: Date; expiresInSeconds: number },
    refreshToken: string,
  ): AuthTokens {
    return {
      accessToken: access.token,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: access.expiresInSeconds,
      expiresAt: access.expiresAt.toISOString(),
    };
  }

  async refresh(refreshToken: string, ctx: RequestInfo): Promise<AuthTokens> {
    const rotated = await this.sessions.rotate(refreshToken, ctx);
    const user = await this.prisma.user.findUnique({
      where: { id: rotated.session.userId },
      select: { id: true, status: true },
    });
    if (!user || user.status === 'DELETED') {
      await this.sessions.revoke(rotated.session.userId, rotated.session.id, 'ACCOUNT_DELETED');
      throw Errors.sessionRevoked();
    }
    if (user.status === 'SUSPENDED') throw Errors.accountSuspended();
    const methods = rotated.session.mfaVerifiedAt ? ['pwd', 'mfa'] : ['pwd'];
    const access = await this.tokens.signAccess('user', {
      subject: user.id,
      sessionId: rotated.session.id,
      methods,
      scope: 'full',
    });
    return this.shapeTokens(access, rotated.refreshToken);
  }

  async logout(userId: string, sessionId: string): Promise<void> {
    await this.sessions.revoke(userId, sessionId, 'LOGOUT');
  }

  async me(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, settings: true },
    });
    if (!user) throw Errors.unauthenticated();
    return toMe(user);
  }
}
