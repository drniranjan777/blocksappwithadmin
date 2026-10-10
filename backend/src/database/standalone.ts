import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { poolConfig } from './connection.js';

/**
 * A database client for command-line scripts (seed, admin creation), which run
 * outside the Nest application. Same connection rules as the API: UTC session,
 * the `pg` driver adapter. Remember to `await client.$disconnect()`.
 */
export function createStandaloneClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg(poolConfig(databaseUrl, { max: 3 })) });
}

/** `DATABASE_URL`, or a clear failure: scripts never guess which database to touch. */
export function requireDatabaseUrl(): string {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. For local development run `npm run db:up` in another terminal and use the URL it prints.',
    );
  }
  return url;
}
