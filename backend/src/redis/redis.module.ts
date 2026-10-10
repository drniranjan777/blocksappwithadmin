import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

/** The shared Redis client, or `null` when `REDIS_URL` is not set (development). */
export const REDIS = Symbol('REDIS');
export type RedisClient = Redis | null;

const logger = new Logger('Redis');

export function createRedis(url: string): Redis {
  const client = new Redis(url, {
    // A request fails fast instead of queueing while Redis is down: callers
    // (rate limiting, caches) have a fallback and must not hang the API.
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2_000,
    retryStrategy: (attempt) => Math.min(attempt * 200, 2_000),
  });
  let lastLogged = 0;
  client.on('error', (err: Error) => {
    // ioredis emits 'error' on every failed reconnect; log at most once a minute.
    if (Date.now() - lastLogged > 60_000) {
      lastLogged = Date.now();
      logger.warn(`Redis unavailable: ${err.message}`);
    }
  });
  return client;
}

@Injectable()
class RedisLifecycle implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: RedisClient) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis) await this.redis.quit().catch(() => undefined);
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ENV],
      useFactory: (env: Env): RedisClient => (env.REDIS_URL ? createRedis(env.REDIS_URL) : null),
    },
    RedisLifecycle,
  ],
  exports: [REDIS],
})
export class RedisModule {}
