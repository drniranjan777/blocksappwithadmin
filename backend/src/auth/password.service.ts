import { Inject, Injectable } from '@nestjs/common';
import { hmacHex, randomToken, safeEqual } from '../common/crypto/tokens.js';
import {
  DEFAULT_PASSWORD_POLICY,
  PasswordHasher,
  type PasswordPolicy,
  checkPassword,
} from '../common/crypto/password.js';
import { Errors } from '../common/errors/app-error.js';
import { isUuid } from '../common/ids.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../database/prisma.service.js';
import { SecurityEventService } from '../security/security-events.service.js';
import { type VerificationChallenge, toVerification } from './auth.types.js';
import { type Identifier, parseIdentifier } from './identifier.js';
import { LoginAttemptStore, loginAttemptKey } from './login-attempts.js';
import { OtpService } from './otp.service.js';
import { ReauthService } from './reauth.service.js';
import { type RequestInfo, UserSessionService } from './user-session.service.js';

const RESET_TOKEN_MINUTES = 10;

/**
 * Forgot-password, reset and change.
 *
 * "Forgot password" answers the same way whether or not the account exists
 * (see `OtpService`: a decoy challenge is made for unknown identifiers), and
 * says where the code went only when the person typed that address themselves.
 */
@Injectable()
export class PasswordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly otp: OtpService,
    private readonly sessions: UserSessionService,
    private readonly events: SecurityEventService,
    private readonly attempts: LoginAttemptStore,
    private readonly reauth: ReauthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  policy(): PasswordPolicy {
    return DEFAULT_PASSWORD_POLICY;
  }

  /**
   * Every rule a person meets while signing in or recovering an account, in one
   * place: the password rules, how many wrong passwords pause sign-in (and for how
   * long), and how one-time codes behave. Nothing secret: it is what the person
   * is told anyway, so the app can show the real numbers instead of guessing.
   */
  securityPolicy() {
    return {
      password: this.policy(),
      signIn: {
        maxFailedAttempts: this.env.AUTH_MAX_FAILED_LOGINS,
        lockMinutes: this.env.AUTH_LOCK_MINUTES,
      },
      code: this.otp.publicPolicy(),
    };
  }

  private assertStrong(password: string, identifiers: string[]): void {
    const issues = checkPassword(password, this.policy(), identifiers);
    if (issues.length) throw Errors.validation([{ field: 'newPassword', reasons: issues }]);
  }

  // ------------------------------------------------------------- forgot --

  async forgot(identifierText: string, ctx: RequestInfo): Promise<VerificationChallenge> {
    // An unusable identifier gets the same generic failure as everywhere else.
    const identifier: Identifier = parseIdentifier(identifierText);
    const user = await this.prisma.user.findFirst({
      where:
        identifier.kind === 'email'
          ? { email: identifier.value, status: { not: 'DELETED' } }
          : identifier.kind === 'phone'
            ? { phone: identifier.value, status: { not: 'DELETED' } }
            : { username: identifier.value, status: { not: 'DELETED' } },
      select: { id: true, email: true, emailVerifiedAt: true, phone: true, phoneVerifiedAt: true },
    });

    // Where a real code would go: what was typed if it is a contact; otherwise the account's verified e-mail, then phone.
    let channel: 'EMAIL' | 'SMS';
    let destination: string | undefined;
    if (identifier.kind === 'email') {
      channel = 'EMAIL';
      destination = identifier.value;
    } else if (identifier.kind === 'phone') {
      channel = 'SMS';
      destination = identifier.value;
    } else if (user?.email && user.emailVerifiedAt) {
      channel = 'EMAIL';
      destination = user.email;
    } else {
      channel = 'SMS';
      destination = user?.phone ?? undefined;
    }

    // The address must belong to the account AND be verified, else nothing is sent.
    const verified =
      !!user &&
      (channel === 'EMAIL'
        ? user.email === destination && !!user.emailVerifiedAt
        : user.phone === destination && !!user.phoneVerifiedAt);

    const issued = await this.otp.issue({
      userId: verified ? user.id : undefined,
      purpose: 'PASSWORD_RESET',
      channel,
      // A username that matched nothing still needs *some* destination to hash.
      destination: destination ?? `unknown:${identifier.value}`,
      ip: ctx.ip,
      deliver: verified,
    });
    // For a username the destination is not echoed: revealing it would confirm the account.
    return toVerification(issued, identifier.kind !== 'username');
  }

  /**
   * Another code for a reset in progress. The answer never names the
   * destination: a real account and an invented one must look the same.
   */
  async resend(challengeId: string, ctx: RequestInfo): Promise<VerificationChallenge> {
    const issued = await this.otp.resend(challengeId, ['PASSWORD_RESET'], ctx.ip);
    return toVerification(issued, false);
  }

  /** Step two: the code is right. Returns a single-use token for the final step. */
  async verifyCode(
    challengeId: string,
    code: string,
  ): Promise<{ resetToken: string; expiresAt: string }> {
    const c = await this.otp.verify({
      challengeId,
      code,
      purposes: ['PASSWORD_RESET'],
      consume: false,
    });
    if (!c.userId) throw Errors.otpInvalid(this.env.OTP_MAX_ATTEMPTS - 1);

    const secret = randomToken(32);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_MINUTES * 60_000);
    // The code is spent. Its slot now holds the hash of the reset token.
    await this.prisma.otpChallenge.update({
      where: { id: c.id },
      data: { codeHash: hmacHex(this.env.OTP_HMAC_SECRET, `reset:${c.id}:${secret}`), expiresAt },
    });
    return { resetToken: `${c.id}.${secret}`, expiresAt: expiresAt.toISOString() };
  }

  /** Final step: set the new password, end every session, tell the owner. */
  async reset(resetToken: string, newPassword: string, ctx: RequestInfo): Promise<void> {
    const dot = resetToken.indexOf('.');
    const id = resetToken.slice(0, dot);
    const secret = resetToken.slice(dot + 1);
    if (dot !== 36 || !isUuid(id)) throw Errors.otpInvalid(0);

    const c = await this.prisma.otpChallenge.findUnique({ where: { id } });
    if (
      !c ||
      c.purpose !== 'PASSWORD_RESET' ||
      !c.userId ||
      !c.verifiedAt ||
      c.consumedAt ||
      !safeEqual(c.codeHash, hmacHex(this.env.OTP_HMAC_SECRET, `reset:${c.id}:${secret}`))
    ) {
      throw Errors.otpInvalid(0);
    }
    if (c.expiresAt <= new Date()) throw Errors.otpExpired();

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: c.userId },
      select: { id: true, username: true, email: true, phone: true },
    });
    // Check strength before spending the token, so a weak first choice can be corrected.
    this.assertStrong(newPassword, [user.username, user.email ?? '']);

    if (!(await this.otp.consume(c.id))) throw Errors.otpInvalid(0);

    const passwordHash = await this.hasher.hash(newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    });
    const revoked = await this.sessions.revokeAll(user.id, 'PASSWORD_RESET');
    // Clear the lock for every way this person might sign in.
    const spellings = [
      loginAttemptKey(this.env.OTP_HMAC_SECRET, 'username', user.username),
      ...(user.email ? [loginAttemptKey(this.env.OTP_HMAC_SECRET, 'email', user.email)] : []),
      ...(user.phone ? [loginAttemptKey(this.env.OTP_HMAC_SECRET, 'phone', user.phone)] : []),
    ];
    await Promise.all(spellings.map((key) => this.attempts.reset(key).catch(() => undefined)));
    await this.events.record({
      userId: user.id,
      type: 'PASSWORD_RESET',
      severity: 'WARNING',
      ip: ctx.ip,
      locationLabel: ctx.locationLabel,
      details: { sessionsEnded: revoked },
      notify: { template: 'security_password_changed', vars: { time: new Date().toUTCString() } },
    });
  }

  // ------------------------------------------------------------- change --

  async change(
    userId: string,
    sessionId: string,
    input: { currentPassword: string; newPassword: string; signOutOtherDevices: boolean },
    ctx: RequestInfo,
  ): Promise<{ otherSessionsEnded: number }> {
    // Someone with a stolen access token must not be able to guess the current password at leisure.
    const user = await this.reauth.requirePassword(userId, input.currentPassword);

    if (input.currentPassword === input.newPassword) {
      throw Errors.validation([{ field: 'newPassword', reasons: ['same_as_current'] }]);
    }
    this.assertStrong(input.newPassword, [user.username, user.email ?? '']);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await this.hasher.hash(input.newPassword),
        passwordChangedAt: new Date(),
      },
    });
    const ended = input.signOutOtherDevices
      ? await this.sessions.revokeOthers(userId, sessionId, 'PASSWORD_CHANGED')
      : 0;
    await this.events.record({
      userId,
      type: 'PASSWORD_CHANGED',
      severity: 'WARNING',
      sessionId,
      ip: ctx.ip,
      locationLabel: ctx.locationLabel,
      details: { otherSessionsEnded: ended },
      notify: { template: 'security_password_changed', vars: { time: new Date().toUTCString() } },
    });
    return { otherSessionsEnded: ended };
  }
}
