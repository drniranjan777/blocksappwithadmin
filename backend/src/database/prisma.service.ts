import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { poolConfig } from './connection.js';

/**
 * The one database client. Prisma 7 talks to PostgreSQL through the `pg`
 * driver adapter, which owns the connection pool: `DATABASE_POOL_MAX` is
 * per API instance, so size it as (database connection limit / instances),
 * or put PgBouncer in front for many instances.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({
      adapter: new PrismaPg(
        poolConfig(env.DATABASE_URL, {
          max: env.DATABASE_POOL_MAX,
          // Fail a stuck query instead of holding a pooled connection forever.
          statement_timeout: 30_000,
          idle_in_transaction_session_timeout: 30_000,
        }),
      ),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
