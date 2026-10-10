import { Inject, Injectable } from '@nestjs/common';
import { randomToken } from '../common/crypto/tokens.js';
import { maskEmail, maskPhone } from '../common/crypto/mask.js';
import { Errors } from '../common/errors/app-error.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { OtpService } from '../auth/otp.service.js';
import { type VerificationChallenge, toVerification } from '../auth/auth.types.js';
import { normalizeEmail, normalizePhone } from '../auth/identifier.js';
import { ReauthService } from '../auth/reauth.service.js';
import { UserSessionService, type RequestInfo } from '../auth/user-session.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { SecurityEventService } from '../security/security-events.service.js';

const DAY = 86_400_000;

/** Contact details and the account-deletion workflow. */
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reauth: ReauthService,
    private readonly otp: OtpService,
    private readonly sessions: UserSessionService,
    private readonly events: SecurityEventService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private requirePassword(userId: string, password: string) {
    return this.reauth.requirePassword(userId, password);
  }

  // -------------------------------------------------------------- contacts --

  async contacts(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return {
      email: u.email ? { value: maskEmail(u.email), verified: !!u.emailVerifiedAt } : null,
      phone: u.phone ? { value: maskPhone(u.phone), verified: !!u.phoneVerifiedAt } : null,
    };
  }

  /** Send a code to the account's own unverified contact. */
  async startVerify(
    userId: string,
    kind: 'email' | 'phone',
    ctx: RequestInfo,
  ): Promise<VerificationChallenge> {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const destination = kind === 'email' ? u.email : u.phone;
    if (!destination) throw Errors.precondition(`There is no ${kind} on this account.`);
    if (kind === 'email' ? u.emailVerifiedAt : u.phoneVerifiedAt)
      throw Errors.conflict('Already verified.');
    const c = await this.otp.issue({
      userId,
      purpose: kind === 'email' ? 'EMAIL_VERIFY' : 'PHONE_VERIFY',
      channel: kind === 'email' ? 'EMAIL' : 'SMS',
      destination,
      ip: ctx.ip,
    });
    return toVerification(c);
  }

  async confirmVerify(userId: string, challengeId: string, code: string) {
    const c = await this.otp.verify({
      challengeId,
      code,
      purposes: ['EMAIL_VERIFY', 'PHONE_VERIFY'],
      userId,
    });
    await this.prisma.user.update({
      where: { id: userId },
      data:
        c.purpose === 'EMAIL_VERIFY'
          ? { emailVerifiedAt: new Date() }
          : { phoneVerifiedAt: new Date() },
    });
    return this.contacts(userId);
  }

  /**
   * Starts changing the e-mail or phone. Needs the password, and a code sent to
   * the *new* address. If that address belongs to someone else the answer is
   * identical (a decoy challenge), so this cannot be used to look people up.
   */
  async startChange(
    userId: string,
    input: { kind: 'email' | 'phone'; newValue: string; password: string },
    ctx: RequestInfo,
  ): Promise<VerificationChallenge> {
    await this.requirePassword(userId, input.password);
    const value =
      input.kind === 'email' ? normalizeEmail(input.newValue) : normalizePhone(input.newValue);
    if (!value) throw Errors.validation([{ field: 'newValue', reasons: ['invalid'] }]);

    const taken = await this.prisma.user.findFirst({
      where: input.kind === 'email' ? { email: value } : { phone: value },
      select: { id: true },
    });
    const channel = input.kind === 'email' ? 'EMAIL' : 'SMS';
    const c = await this.otp.issue({
      userId,
      purpose: 'CONTACT_CHANGE',
      channel,
      destination: value,
      ip: ctx.ip,
      pendingValue: taken ? undefined : value,
      // Someone else has it: nothing is sent, and nothing will ever verify.
      deliver: !taken,
    });
    return toVerification(c);
  }

  async confirmChange(userId: string, challengeId: string, code: string, ctx: RequestInfo) {
    const c = await this.otp.claimAttempt({ challengeId, purposes: ['CONTACT_CHANGE'], userId });
    if (!c.pendingValue || !this.otp.matches(c, code)) return this.otp.failure(c);
    await this.otp.complete(c.id);

    const before = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const isEmail = c.channel === 'EMAIL';
    // Warn the *old* address first: if this was an attacker, that is where the owner will see it.
    await this.events.record({
      userId,
      type: isEmail ? 'EMAIL_CHANGED' : 'PHONE_CHANGED',
      severity: 'WARNING',
      ip: ctx.ip,
      locationLabel: ctx.locationLabel,
      notify: {
        template: 'security_contact_changed',
        vars: { kind: isEmail ? 'e-mail address' : 'phone number', time: new Date().toUTCString() },
      },
    });
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: isEmail
          ? { email: c.pendingValue, emailVerifiedAt: new Date() }
          : { phone: c.pendingValue, phoneVerifiedAt: new Date() },
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') return this.otp.failure(c); // taken in the meantime
      throw e;
    }
    void before;
    return this.contacts(userId);
  }

  // -------------------------------------------------------------- deletion --

  async deletionStatus(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return {
      pending: u.status === 'PENDING_DELETION',
      requestedAt: u.deletionRequestedAt?.toISOString() ?? null,
      scheduledFor: u.deletionScheduledFor?.toISOString() ?? null,
      graceDays: this.env.ACCOUNT_DELETION_GRACE_DAYS,
    };
  }

  /**
   * Schedules deletion after a grace period. The person can still sign in during
   * it (their status reads `PENDING_DELETION`, so the app can offer "Keep my
   * account"); only an explicit `cancelDeletion` stops it, so signing in to look
   * around never undoes the decision by accident.
   */
  async requestDeletion(userId: string, sessionId: string, password: string, ctx: RequestInfo) {
    const user = await this.requirePassword(userId, password);
    if (user.status === 'PENDING_DELETION') return this.deletionStatus(userId);
    const now = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: 'PENDING_DELETION',
        statusReason: 'user_requested_deletion',
        statusChangedAt: now,
        deletionRequestedAt: now,
        deletionScheduledFor: new Date(now.getTime() + this.env.ACCOUNT_DELETION_GRACE_DAYS * DAY),
      },
    });
    await this.sessions.revokeOthers(userId, sessionId, 'ACCOUNT_DELETED');
    const scheduled = new Date(now.getTime() + this.env.ACCOUNT_DELETION_GRACE_DAYS * DAY);
    await this.events.record({
      userId,
      type: 'ACCOUNT_DELETION_REQUESTED',
      severity: 'CRITICAL',
      ip: ctx.ip,
      locationLabel: ctx.locationLabel,
      notify: { template: 'security_deletion_scheduled', vars: { date: scheduled.toDateString() } },
    });
    return this.deletionStatus(userId);
  }

  async cancelDeletion(userId: string, ctx: RequestInfo) {
    const res = await this.prisma.user.updateMany({
      where: { id: userId, status: 'PENDING_DELETION' },
      data: {
        status: 'ACTIVE',
        statusReason: null,
        statusChangedAt: new Date(),
        deletionRequestedAt: null,
        deletionScheduledFor: null,
      },
    });
    if (res.count === 1) {
      await this.events.record({
        userId,
        type: 'ACCOUNT_DELETION_CANCELLED',
        severity: 'INFO',
        ip: ctx.ip,
        locationLabel: ctx.locationLabel,
        notify: { template: 'security_deletion_cancelled' },
      });
    }
    return this.deletionStatus(userId);
  }

  /**
   * Erases accounts whose grace period has ended. The user row is kept, stripped
   * of everything personal, because money and audit records point at it and must
   * survive (see docs/database-schema.md). Run by the worker.
   */
  async eraseDue(limit = 25): Promise<number> {
    const due = await this.prisma.user.findMany({
      where: { status: 'PENDING_DELETION', deletionScheduledFor: { lte: new Date() } },
      select: { id: true },
      take: limit,
    });
    for (const { id } of due) await this.anonymise(id);
    return due.length;
  }

  private async anonymise(userId: string): Promise<void> {
    const tag = userId.replace(/-/g, '').slice(-12);
    await this.sessions.revokeAll(userId, 'ACCOUNT_DELETED');
    await this.prisma.$transaction([
      this.prisma.pushDevice.deleteMany({ where: { userId } }),
      this.prisma.otpChallenge.deleteMany({ where: { userId } }),
      this.prisma.stepUpToken.deleteMany({ where: { userId } }),
      this.prisma.notification.deleteMany({ where: { userId } }),
      this.prisma.profile.updateMany({
        where: { userId },
        data: {
          displayName: 'Deleted user',
          bio: null,
          websiteUrl: null,
          avatarMediaId: null,
          state: null,
          district: null,
          city: null,
          dateOfBirth: null,
          gender: null,
          isPrivate: true,
        },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          username: `deleted_${tag}`,
          email: null,
          phone: null,
          // No password can ever match this.
          passwordHash: `erased:${randomToken(16)}`,
          twoFactorEnabled: false,
          twoFactorSecretEnc: null,
          twoFactorBackupHashes: [],
          status: 'DELETED',
          deletedAt: new Date(),
          deletionScheduledFor: null,
        },
      }),
    ]);
  }
}
