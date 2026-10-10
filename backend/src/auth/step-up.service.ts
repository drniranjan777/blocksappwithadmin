import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Errors } from '../common/errors/app-error.js';
import { PrismaService } from '../database/prisma.service.js';
import type { OtpChannel, StepUpPurpose } from '../generated/prisma/client.js';
import { OtpService } from './otp.service.js';
import { ReauthService } from './reauth.service.js';

const PURPOSES: readonly StepUpPurpose[] = [
  'ADD_BANK_ACCOUNT',
  'CHANGE_BANK_ACCOUNT',
  'REMOVE_BANK_ACCOUNT',
  'REQUEST_PAYOUT',
  'UPDATE_TAX_INFO',
];
const TOKEN_TTL_MS = 5 * 60_000;

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/**
 * "Prove it is really you, right now" before something that moves or exposes money.
 *
 * Two proofs, both required, both fresh: the account password (counted against the account's
 * own re-check limiter, so a stolen session cannot guess it) and a one-time code sent to the
 * account's own verified e-mail or phone (so knowing the password alone is not enough). The
 * result is a token that works **once**, for **one named purpose**, for **five minutes**; the
 * sensitive endpoint consumes it. The token is stored only as a hash.
 *
 * A stolen access token therefore cannot add a bank account or request a payout without also
 * controlling the owner's inbox or phone and knowing their password.
 */
@Injectable()
export class StepUpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reauth: ReauthService,
    private readonly otp: OtpService,
  ) {}

  isPurpose(value: string): value is StepUpPurpose {
    return (PURPOSES as readonly string[]).includes(value);
  }

  /** Step one: check the password and send a code. */
  async begin(userId: string, purpose: StepUpPurpose, password: string, ip?: string) {
    const user = await this.reauth.requirePassword(userId, password);
    const channel: OtpChannel | null =
      user.email && user.emailVerifiedAt
        ? 'EMAIL'
        : user.phone && user.phoneVerifiedAt
          ? 'SMS'
          : null;
    const destination = channel === 'EMAIL' ? user.email : channel === 'SMS' ? user.phone : null;
    if (!channel || !destination) {
      throw Errors.conflict(
        'Verify an e-mail address or phone number before doing this.',
        'VERIFICATION_REQUIRED',
      );
    }
    const challenge = await this.otp.issue({
      userId,
      purpose: 'STEP_UP',
      channel,
      destination,
      pendingValue: purpose,
      ip,
    });
    return { purpose, challenge };
  }

  async resend(userId: string, challengeId: string, ip?: string) {
    const c = await this.prisma.otpChallenge.findUnique({ where: { id: challengeId } });
    if (c?.userId !== userId) throw Errors.rateLimited(30); // same answer for a stranger's challenge
    return this.otp.resend(challengeId, ['STEP_UP'], ip);
  }

  /** Step two: check the code and hand back the single-use token. */
  async verify(userId: string, challengeId: string, code: string) {
    const challenge = await this.otp.verify({
      challengeId,
      code,
      purposes: ['STEP_UP'],
      userId,
      consume: false,
    });
    const purpose = challenge.pendingValue;
    if (!purpose || !this.isPurpose(purpose) || !(await this.otp.consume(challenge.id))) {
      throw Errors.otpInvalid(0);
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    await this.prisma.stepUpToken.create({
      data: { userId, purpose, tokenHash: hashToken(token), expiresAt },
    });
    return { stepUpToken: token, purpose, expiresAt };
  }

  /**
   * Spends a token. Atomic: of two requests carrying the same token, exactly one succeeds. A
   * missing, expired, used, foreign or wrong-purpose token is the same answer.
   */
  async consume(userId: string, purpose: StepUpPurpose, token: string | undefined): Promise<void> {
    if (!token) throw Errors.stepUpRequired(purpose);
    const res = await this.prisma.stepUpToken.updateMany({
      where: {
        userId,
        purpose,
        tokenHash: hashToken(token),
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });
    if (res.count !== 1) throw Errors.stepUpRequired(purpose);
  }
}
