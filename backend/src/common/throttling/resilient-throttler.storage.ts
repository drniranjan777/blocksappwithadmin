import { Inject, Injectable, Logger } from '@nestjs/common';
import { ThrottlerStorageService, type ThrottlerStorage } from '@nestjs/throttler';

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;
import { REDIS, type RedisClient } from '../../redis/redis.module.js';

/**
 * Rate-limit counters shared by every API instance through Redis, falling back
 * to per-process counters if Redis is unreachable.
 *
 * Failing *open* (still limiting, just per instance) is a deliberate choice:
 * refusing every request because the cache is down would turn a Redis outage
 * into a full outage, while per-instance limits still blunt abuse. The
 * degradation is logged so it is noticed.
 *
 * The increment, the first-hit expiry and the block are done in one Lua script,
 * so concurrent requests cannot race between "count" and "expire".
 */
const SCRIPT = `
local block = redis.call('PTTL', KEYS[2])
if block > 0 then
  local current = tonumber(redis.call('GET', KEYS[1]) or '0')
  return {current, redis.call('PTTL', KEYS[1]), 1, block}
end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if hits > tonumber(ARGV[2]) and tonumber(ARGV[3]) > 0 then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return {hits, ttl, 1, tonumber(ARGV[3])}
end
return {hits, ttl, 0, 0}
`;

const PREFIX = 'blocks:rl:';

@Injectable()
export class ResilientThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger('RateLimit');
  private readonly fallback = new ThrottlerStorageService();
  private lastWarning = 0;

  constructor(@Inject(REDIS) private readonly redis: RedisClient) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (!this.redis) return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
    const hitsKey = `${PREFIX}${throttlerName}:${key}`;
    try {
      const [hits, pttl, blocked, blockMs] = (await this.redis.eval(
        SCRIPT,
        2,
        hitsKey,
        `${hitsKey}:block`,
        ttl,
        limit,
        blockDuration,
      )) as [number, number, number, number];
      return {
        totalHits: hits,
        timeToExpire: Math.max(0, Math.ceil(pttl / 1000)),
        isBlocked: blocked === 1,
        timeToBlockExpire: Math.max(0, Math.ceil(blockMs / 1000)),
      };
    } catch (error) {
      if (Date.now() - this.lastWarning > 60_000) {
        this.lastWarning = Date.now();
        this.logger.warn(
          `Redis rate limiting failed, using per-instance counters: ${(error as Error).message}`,
        );
      }
      return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
    }
  }
}
