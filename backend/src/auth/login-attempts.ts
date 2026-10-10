import { Inject, Injectable, Logger } from '@nestjs/common';
import { hmacHex } from '../common/crypto/tokens.js';
import { REDIS, type RedisClient } from '../redis/redis.module.js';

export interface AttemptState {
  /** Wrong passwords counted so far in the current window. */
  failures: number;
  /** Set while sign-in for this identifier is paused. */
  lockedUntil?: Date;
}

const PREFIX = 'blocks:login:';

/**
 * The counter key for something typed into the sign-in box. One definition, used
 * by sign-in and by password reset (which must clear *every* spelling that could
 * be locked), so the two can never drift apart.
 */
export function loginAttemptKey(
  secret: string,
  kind: 'username' | 'email' | 'phone',
  value: string,
): string {
  return hmacHex(secret, `login:${kind}:${value}`);
}

/**
 * Counts wrong passwords **per identifier typed**, whether or not an account
 * exists for it.
 *
 * That is the point. If only real accounts were counted, "5 wrong passwords
 * pauses sign-in" would happen for real accounts and never for invented ones,
 * and anyone could use that to learn which usernames exist. Counting what was
 * typed makes both behave the same.
 *
 * Shared across instances through Redis, with per-process counters as the
 * fallback. For real accounts the lock is *also* written to the user row, so it
 * survives a Redis flush and is visible to support staff.
 */
@Injectable()
export class LoginAttemptStore {
  private readonly logger = new Logger('LoginAttempts');
  private readonly memory = new Map<
    string,
    { failures: number; windowEnds: number; lockedUntil?: number }
  >();
  private warned = 0;

  constructor(@Inject(REDIS) private readonly redis: RedisClient) {}

  async get(key: string): Promise<AttemptState> {
    if (this.redis) {
      try {
        const [n, lockTtl] = await Promise.all([
          this.redis.get(`${PREFIX}${key}:n`),
          this.redis.pttl(`${PREFIX}${key}:lock`),
        ]);
        return {
          failures: Number(n ?? 0),
          ...(lockTtl > 0 ? { lockedUntil: new Date(Date.now() + lockTtl) } : {}),
        };
      } catch (e) {
        this.degrade(e);
      }
    }
    const m = this.memory.get(key);
    if (!m) return { failures: 0 };
    const now = Date.now();
    return {
      failures: m.windowEnds > now ? m.failures : 0,
      ...(m.lockedUntil && m.lockedUntil > now ? { lockedUntil: new Date(m.lockedUntil) } : {}),
    };
  }

  /**
   * Records a wrong password. Returns the new failure count, and the lock if this
   * failure reached `maxFailures`. Taking the lock resets the counter, so when
   * it ends the person gets a fresh set of attempts.
   */
  async fail(
    key: string,
    maxFailures: number,
    lockMs: number,
    windowMs = 3_600_000,
  ): Promise<AttemptState> {
    if (this.redis) {
      try {
        const n = await this.redis.incr(`${PREFIX}${key}:n`);
        if (n === 1) await this.redis.pexpire(`${PREFIX}${key}:n`, windowMs);
        if (n >= maxFailures) {
          await this.redis.set(`${PREFIX}${key}:lock`, '1', 'PX', lockMs);
          await this.redis.del(`${PREFIX}${key}:n`);
          return { failures: n, lockedUntil: new Date(Date.now() + lockMs) };
        }
        return { failures: n };
      } catch (e) {
        this.degrade(e);
      }
    }
    const now = Date.now();
    const m = this.memory.get(key);
    const current = m && m.windowEnds > now ? m : { failures: 0, windowEnds: now + windowMs };
    current.failures += 1;
    if (current.failures >= maxFailures) {
      const lockedUntil = now + lockMs;
      this.memory.set(key, { failures: 0, windowEnds: now + windowMs, lockedUntil });
      return { failures: maxFailures, lockedUntil: new Date(lockedUntil) };
    }
    this.memory.set(key, { ...current, ...(m?.lockedUntil ? { lockedUntil: m.lockedUntil } : {}) });
    return { failures: current.failures };
  }

  async reset(key: string): Promise<void> {
    this.memory.delete(key);
    if (!this.redis) return;
    try {
      await this.redis.del(`${PREFIX}${key}:n`, `${PREFIX}${key}:lock`);
    } catch (e) {
      this.degrade(e);
    }
  }

  private degrade(error: unknown): void {
    if (Date.now() - this.warned > 60_000) {
      this.warned = Date.now();
      this.logger.warn(
        `Redis unavailable for sign-in counters; using this instance only: ${(error as Error).message}`,
      );
    }
  }
}
