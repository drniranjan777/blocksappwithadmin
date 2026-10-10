import { Inject, Injectable } from '@nestjs/common';
import { hmacHex, randomDigits, safeEqual } from '../common/crypto/tokens.js';
import { maskEmail, maskPhone } from '../common/crypto/mask.js';
import { Errors } from '../common/errors/app-error.js';
import { uuidv7 } from '../common/ids.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../database/prisma.service.js';
import type { OtpChallenge, OtpChannel, OtpPurpose } from '../generated/prisma/client.js';
import { NotificationService } from '../notifications/notification.service.js';
import type { CodeTemplate } from '../notifications/templates.js';

export interface IssuedChallenge {
  id: string;
  channel: OtpChannel;
  destinationMasked: string;
  expiresAt: Date;
  /** The earliest time "send a new code" is allowed. */
  resendAvailableAt: Date;
}

const RESEND_COOLDOWN_MS = 30_000;
const MAX_RESENDS = 3;
const MAX_PER_DESTINATION_PER_HOUR = 5;
const MAX_PER_USER_PER_HOUR = 10;
const HOUR = 3_600_000;

const TEMPLATE_FOR: Record<OtpPurpose, CodeTemplate> = {
  EMAIL_VERIFY: 'otp_verify_contact',
  PHONE_VERIFY: 'otp_verify_contact',
  PASSWORD_RESET: 'otp_password_reset',
  LOGIN_2FA: 'otp_login',
  TWO_FACTOR_SETUP: 'otp_two_factor_setup',
  CONTACT_CHANGE: 'otp_contact_change',
  ACCOUNT_RECOVERY: 'otp_password_reset',
  ACCOUNT_DELETION: 'otp_account_deletion',
  STEP_UP: 'otp_step_up',
};

/**
 * One-time codes sent to an e-mail address or phone number.
 *
 * Design points:
 *  - the code is 6 random digits (CSPRNG), stored only as an HMAC bound to the
 *    challenge id, with a short life and a small attempt budget;
 *  - an attempt is *claimed* in the database before the code is compared, so
 *    parallel guesses cannot exceed the budget;
 *  - a code can be used once;
 *  - sending is rate-limited per destination and per account, so the endpoint
 *    cannot be used to flood a stranger's phone;
 *  - for an address with no account, a **decoy** challenge is created that
 *    behaves identically but sends nothing, so neither the response nor the
 *    timing says whether an account exists.
 */
@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private hashDestination(destination: string): string {
    return hmacHex(this.env.OTP_HMAC_SECRET, `dest:${destination}`);
  }

  private hashCode(challengeId: string, code: string): string {
    return hmacHex(this.env.OTP_HMAC_SECRET, `code:${challengeId}:${code}`);
  }

  private ttlMs(): number {
    return this.env.OTP_TTL_MINUTES * 60_000;
  }

  /** The numbers behind one-time codes, published so an app shows the real ones. */
  publicPolicy() {
    return {
      length: 6,
      expiresMinutes: this.env.OTP_TTL_MINUTES,
      maxAttempts: this.env.OTP_MAX_ATTEMPTS,
      resendCooldownSeconds: RESEND_COOLDOWN_MS / 1000,
      maxResends: MAX_RESENDS,
    };
  }

  private shape(
    c: Pick<OtpChallenge, 'id' | 'channel' | 'destinationMasked' | 'expiresAt'>,
  ): IssuedChallenge {
    const lastIssued = c.expiresAt.getTime() - this.ttlMs();
    return {
      id: c.id,
      channel: c.channel,
      destinationMasked: c.destinationMasked,
      expiresAt: c.expiresAt,
      resendAvailableAt: new Date(lastIssued + RESEND_COOLDOWN_MS),
    };
  }

  async issue(input: {
    userId?: string | undefined;
    purpose: OtpPurpose;
    channel: OtpChannel;
    /** The e-mail address or E.164 number the code goes to. */
    destination: string;
    ip?: string | undefined;
    /** Contact change: what the code confirms. */
    pendingValue?: string | undefined;
    /** False creates a decoy: nothing is sent. */
    deliver?: boolean;
  }): Promise<IssuedChallenge> {
    const destinationHash = this.hashDestination(input.destination);
    const since = new Date(Date.now() - HOUR);

    const [forDestination, forUser] = await Promise.all([
      this.prisma.otpChallenge.count({ where: { destinationHash, createdAt: { gt: since } } }),
      input.userId
        ? this.prisma.otpChallenge.count({
            where: { userId: input.userId, createdAt: { gt: since } },
          })
        : Promise.resolve(0),
    ]);
    if (forDestination >= MAX_PER_DESTINATION_PER_HOUR || forUser >= MAX_PER_USER_PER_HOUR) {
      throw Errors.rateLimited(3600);
    }

    const id = uuidv7();
    const code = randomDigits(6);
    const masked =
      input.channel === 'EMAIL' ? maskEmail(input.destination) : maskPhone(input.destination);
    const challenge = await this.prisma.otpChallenge.create({
      data: {
        id,
        userId: input.userId ?? null,
        purpose: input.purpose,
        channel: input.channel,
        destinationMasked: masked,
        destinationHash,
        codeHash: this.hashCode(id, code),
        maxAttempts: this.env.OTP_MAX_ATTEMPTS,
        ip: input.ip ?? null,
        pendingValue: input.pendingValue ?? null,
        expiresAt: new Date(Date.now() + this.ttlMs()),
      },
    });

    if (input.deliver !== false) {
      await this.notifications.sendCode({
        userId: input.userId,
        channel: input.channel,
        to: input.destination,
        template: TEMPLATE_FOR[input.purpose],
        code,
      });
    }
    return this.shape(challenge);
  }

  /**
   * The first half of checking a code, without comparing anything: validates the
   * challenge and *claims one attempt* from its budget. The claim is atomic, so
   * parallel guesses cannot exceed the budget. Authenticator and backup codes
   * (which are checked elsewhere) use it too, so every second factor shares one
   * set of attempts per sign-in.
   */
  async claimAttempt(input: {
    challengeId: string;
    purposes: OtpPurpose[];
    userId?: string | undefined;
  }): Promise<OtpChallenge> {
    const c = await this.prisma.otpChallenge.findUnique({ where: { id: input.challengeId } });
    // An unknown, foreign or already-used challenge looks like a first wrong guess.
    if (
      !c ||
      !input.purposes.includes(c.purpose) ||
      (input.userId && c.userId !== input.userId) ||
      c.verifiedAt ||
      c.consumedAt
    ) {
      throw Errors.otpInvalid(this.env.OTP_MAX_ATTEMPTS - 1);
    }
    if (c.expiresAt <= new Date()) throw Errors.otpExpired();

    const claimed = await this.prisma.otpChallenge.updateMany({
      where: { id: c.id, attempts: { lt: c.maxAttempts }, verifiedAt: null, consumedAt: null },
      data: { attempts: { increment: 1 } },
    });
    if (claimed.count === 0) throw Errors.otpLocked();
    return c;
  }

  /** Whether `code` is the code issued for this challenge (constant time). */
  matches(challenge: OtpChallenge, code: string): boolean {
    return safeEqual(challenge.codeHash, this.hashCode(challenge.id, code));
  }

  /** Counts a wrong guess against the budget and says what is left. */
  failure(c: OtpChallenge): never {
    const left = c.maxAttempts - (c.attempts + 1);
    throw left <= 0 ? Errors.otpLocked() : Errors.otpInvalid(left);
  }

  /** Ends a challenge once its second factor has been proven (by any method). */
  async complete(challengeId: string, keepOpen = false): Promise<void> {
    const now = new Date();
    await this.prisma.otpChallenge.update({
      where: { id: challengeId },
      data: { verifiedAt: now, ...(keepOpen ? {} : { consumedAt: now, pendingValue: null }) },
    });
  }

  /**
   * Checks a code. Throws a specific, safe error (invalid / expired / locked)
   * and otherwise returns the challenge, now marked verified.
   *
   * `consume: false` leaves it verified-but-unused for flows that need a second
   * step (password reset: verify the code, then set the password).
   */
  async verify(input: {
    challengeId: string;
    code: string;
    purposes: OtpPurpose[];
    /** When given, the challenge must belong to this user. */
    userId?: string | undefined;
    consume?: boolean;
  }): Promise<OtpChallenge> {
    const c = await this.claimAttempt(input);
    if (!safeEqual(c.codeHash, this.hashCode(c.id, input.code))) this.failure(c);
    await this.complete(c.id, input.consume === false);
    return c;
  }

  /** Marks a verified challenge as used, once. Returns false if it already was. */
  async consume(challengeId: string): Promise<boolean> {
    const res = await this.prisma.otpChallenge.updateMany({
      where: { id: challengeId, verifiedAt: { not: null }, consumedAt: null },
      data: { consumedAt: new Date(), pendingValue: null },
    });
    return res.count === 1;
  }

  /** A new code for an existing challenge, subject to the cooldown and a cap. */
  async resend(challengeId: string, purposes: OtpPurpose[], ip?: string): Promise<IssuedChallenge> {
    const c = await this.prisma.otpChallenge.findUnique({ where: { id: challengeId } });
    if (!c || !purposes.includes(c.purpose) || c.verifiedAt || c.consumedAt) {
      // Nothing to resend, but say so in the same shape a real answer would take.
      throw Errors.rateLimited(RESEND_COOLDOWN_MS / 1000);
    }
    const lastIssued = c.expiresAt.getTime() - this.ttlMs();
    const wait = lastIssued + RESEND_COOLDOWN_MS - Date.now();
    if (wait > 0) throw Errors.rateLimited(Math.ceil(wait / 1000));
    if (c.resendCount >= MAX_RESENDS) throw Errors.rateLimited(3600);

    const destination = await this.destinationOf(c);
    const code = randomDigits(6);
    const updated = await this.prisma.otpChallenge.update({
      where: { id: c.id },
      data: {
        codeHash: this.hashCode(c.id, code),
        attempts: 0,
        resendCount: { increment: 1 },
        expiresAt: new Date(Date.now() + this.ttlMs()),
        ...(ip ? { ip } : {}),
      },
    });
    if (destination) {
      await this.notifications.sendCode({
        userId: c.userId ?? undefined,
        channel: c.channel,
        to: destination,
        template: TEMPLATE_FOR[c.purpose],
        code,
      });
    }
    return this.shape(updated);
  }

  /** Where a challenge's code goes: the new value for a contact change, else the account's own. */
  private async destinationOf(c: OtpChallenge): Promise<string | undefined> {
    if (c.purpose === 'CONTACT_CHANGE') return c.pendingValue ?? undefined;
    if (!c.userId) return undefined; // a decoy
    const user = await this.prisma.user.findUnique({
      where: { id: c.userId },
      select: { email: true, phone: true },
    });
    return (c.channel === 'EMAIL' ? user?.email : user?.phone) ?? undefined;
  }

  /** Housekeeping: codes are useless after they expire. Run by the worker. */
  async purgeExpired(): Promise<number> {
    const res = await this.prisma.otpChallenge.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 24 * HOUR) } },
    });
    return res.count;
  }
}
