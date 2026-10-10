import { Inject, Injectable } from '@nestjs/common';
import { PasswordHasher } from '../common/crypto/password.js';
import { hmacHex } from '../common/crypto/tokens.js';
import { Errors } from '../common/errors/app-error.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../database/prisma.service.js';
import type { User } from '../generated/prisma/client.js';
import { LoginAttemptStore } from './login-attempts.js';

/**
 * "Enter your password to continue" for a person who is already signed in:
 * changing the password, turning off two-step verification, changing an e-mail
 * address, deleting the account.
 *
 * These are exactly what an attacker holding a stolen access token wants to do,
 * and the one thing standing in their way is the password. So wrong guesses are
 * counted **per account**, not just per IP (an IP limit is trivially spread over
 * many addresses), and the account's re-check pauses after a few mistakes. The
 * pause is separate from the sign-in pause: the real owner can still sign in
 * with their password; it is the stolen session that is stopped.
 */
@Injectable()
export class ReauthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly attempts: LoginAttemptStore,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async requirePassword(userId: string, password: string): Promise<User> {
    const key = hmacHex(this.env.OTP_HMAC_SECRET, `reauth:${userId}`);
    const state = await this.attempts.get(key);
    if (state.lockedUntil && state.lockedUntil > new Date())
      throw Errors.accountLocked(state.lockedUntil);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw Errors.unauthenticated();

    if (!(await this.hasher.verify(user.passwordHash, password))) {
      const after = await this.attempts.fail(
        key,
        this.env.AUTH_MAX_FAILED_LOGINS,
        this.env.AUTH_LOCK_MINUTES * 60_000,
      );
      if (after.lockedUntil) throw Errors.accountLocked(after.lockedUntil, true);
      throw Errors.invalidCredentials(
        Math.max(this.env.AUTH_MAX_FAILED_LOGINS - after.failures, 0),
      );
    }
    await this.attempts.reset(key);
    return user;
  }
}
