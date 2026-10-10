import { randomBytes } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ResilientThrottlerStorage } from '../../src/common/throttling/resilient-throttler.storage.js';

/**
 * Runs against a real Redis (or Memurai) when one answers on REDIS_TEST_URL,
 * using database 14 and random key names so a shared server is never disturbed.
 * When none is reachable the suite is reported as skipped, not passed.
 */
const url = process.env['REDIS_TEST_URL'] ?? 'redis://127.0.0.1:6379/14';

async function reachable(): Promise<boolean> {
  const probe = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    connectTimeout: 1000,
    retryStrategy: () => null,
  });
  probe.on('error', () => undefined);
  try {
    await probe.connect();
    return (await probe.ping()) === 'PONG';
  } catch {
    return false;
  } finally {
    probe.disconnect();
  }
}

const available = await reachable();
const id = (): string => randomBytes(6).toString('hex');

describe.skipIf(!available)('rate limit storage on Redis', () => {
  let redis: Redis;
  const used: string[] = [];

  beforeAll(() => {
    redis = new Redis(url, { maxRetriesPerRequest: 1 });
  });
  afterAll(async () => {
    // Only the keys this suite created, by exact name.
    for (const k of used) await redis.del(`blocks:rl:default:${k}`, `blocks:rl:default:${k}:block`);
    redis.disconnect();
  });

  const key = (): string => {
    const k = id();
    used.push(k);
    return k;
  };

  it('counts hits and reports the time left', async () => {
    const storage = new ResilientThrottlerStorage(redis);
    const k = key();
    const a = await storage.increment(k, 10_000, 5, 0, 'default');
    const b = await storage.increment(k, 10_000, 5, 0, 'default');
    expect(a.totalHits).toBe(1);
    expect(b.totalHits).toBe(2);
    expect(b.isBlocked).toBe(false);
    expect(b.timeToExpire).toBeGreaterThan(0);
    expect(b.timeToExpire).toBeLessThanOrEqual(10);
  });

  it('expires the window', async () => {
    const storage = new ResilientThrottlerStorage(redis);
    const k = key();
    await storage.increment(k, 300, 5, 0, 'default');
    await new Promise((r) => setTimeout(r, 450));
    const again = await storage.increment(k, 300, 5, 0, 'default');
    expect(again.totalHits).toBe(1);
  });

  it('counts exactly under concurrent load, from several clients', async () => {
    const clients = [redis, new Redis(url), new Redis(url)];
    try {
      const storages = clients.map((c) => new ResilientThrottlerStorage(c));
      const k = key();
      const results = await Promise.all(
        Array.from({ length: 150 }, (_, i) =>
          storages[i % 3]!.increment(k, 20_000, 1000, 0, 'default'),
        ),
      );
      expect(Math.max(...results.map((r) => r.totalHits))).toBe(150);
      expect(new Set(results.map((r) => r.totalHits)).size).toBe(150);
    } finally {
      clients.slice(1).forEach((c) => c.disconnect());
    }
  });

  it('blocks a caller who exceeds the limit, for the block duration', async () => {
    const storage = new ResilientThrottlerStorage(redis);
    const k = key();
    for (let i = 0; i < 3; i++) await storage.increment(k, 10_000, 3, 5_000, 'default');
    const over = await storage.increment(k, 10_000, 3, 5_000, 'default');
    expect(over.isBlocked).toBe(true);
    expect(over.timeToBlockExpire).toBeGreaterThan(0);
    const still = await storage.increment(k, 10_000, 3, 5_000, 'default');
    expect(still.isBlocked).toBe(true);
  });

  it('keeps separate counters for separate callers', async () => {
    const storage = new ResilientThrottlerStorage(redis);
    const a = key();
    const b = key();
    await storage.increment(a, 10_000, 5, 0, 'default');
    await storage.increment(a, 10_000, 5, 0, 'default');
    expect((await storage.increment(b, 10_000, 5, 0, 'default')).totalHits).toBe(1);
  });
});

describe('rate limit storage without Redis', () => {
  it('still limits, per instance, when no Redis is configured', async () => {
    const storage = new ResilientThrottlerStorage(null);
    const k = id();
    await storage.increment(k, 10_000, 3, 0, 'default');
    await storage.increment(k, 10_000, 3, 0, 'default');
    const third = await storage.increment(k, 10_000, 3, 0, 'default');
    expect(third.totalHits).toBe(3);
  });

  it('falls back to local counters when Redis fails, instead of failing the request', async () => {
    const dead = new Redis('redis://127.0.0.1:1', {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    dead.on('error', () => undefined);
    const storage = new ResilientThrottlerStorage(dead);
    const k = id();
    const first = await storage.increment(k, 10_000, 3, 0, 'default');
    const second = await storage.increment(k, 10_000, 3, 0, 'default');
    expect(first.totalHits).toBe(1);
    expect(second.totalHits).toBe(2);
    dead.disconnect();
  });
});
