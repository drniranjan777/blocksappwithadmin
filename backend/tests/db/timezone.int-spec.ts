import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { createTestDatabase, type TestDatabase } from '../support/database.js';

/**
 * Regression test for a real bug: on a database whose time zone is not UTC,
 * Prisma wrote timestamps shifted by the zone's offset, so a code meant to
 * expire in ten minutes was stored as already expired (or hours in the future)
 * as far as SQL's `now()` was concerned. The API now pins its connections to
 * UTC; this proves it holds even when the database itself says otherwise.
 */
describe('time zones', () => {
  let db: TestDatabase;
  let prisma: PrismaService;

  beforeAll(async () => {
    db = await createTestDatabase();
    // A server that is not in UTC: the unfavourable case.
    await db.query(`ALTER DATABASE ${db.name} SET timezone TO 'Asia/Kolkata'`);
    const { env } = loadEnv({
      NODE_ENV: 'test',
      DATABASE_URL: db.url,
      DATABASE_POOL_MAX: '2',
      LOG_LEVEL: 'silent',
    } as NodeJS.ProcessEnv);
    prisma = new PrismaService(env);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await db.dispose();
  });

  it('runs every API connection in UTC', async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ tz: string }>>(
      "SELECT current_setting('TimeZone') AS tz",
    );
    expect(rows[0]?.tz).toBe('UTC');
  });

  it('agrees with SQL now() about a time the API wrote', async () => {
    const user = await prisma.user.create({
      data: {
        username: 'tz_writer',
        email: 'tz_writer@example.test',
        passwordHash: 'x',
        lockedUntil: new Date(Date.now() + 3_600_000),
      },
    });
    const rows = await db.query<{ seconds: string }>(
      'SELECT extract(epoch FROM (locked_until - now()))::float AS seconds FROM users WHERE id = $1',
      [user.id],
    );
    const seconds = Number(rows.rows[0]?.seconds);
    expect(seconds).toBeGreaterThan(3_500);
    expect(seconds).toBeLessThan(3_700);
  });

  it('agrees with the clock about a time SQL wrote', async () => {
    const user = await prisma.user.create({
      data: { username: 'tz_reader', email: 'tz_reader@example.test', passwordHash: 'x' },
    });
    await db.query("UPDATE users SET locked_until = now() + interval '2 hours' WHERE id = $1", [
      user.id,
    ]);
    const read = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const delta = read.lockedUntil!.getTime() - Date.now();
    expect(delta).toBeGreaterThan(2 * 3_600_000 - 60_000);
    expect(delta).toBeLessThan(2 * 3_600_000 + 60_000);
  });

  it('sets the default zone of the migrated database to UTC for other tools', async () => {
    // A fresh clone has the template's schema but not its per-database settings, so check the migration's effect directly.
    const template = await db.query<{ setconfig: string[] | null }>(
      `SELECT s.setconfig FROM pg_db_role_setting s JOIN pg_database d ON d.oid = s.setdatabase WHERE d.datname = 'blocks_template'`,
    );
    expect((template.rows[0]?.setconfig ?? []).map((s) => s.toLowerCase())).toContain(
      'timezone=utc',
    );
  });
});
