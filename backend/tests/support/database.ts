import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { inject } from 'vitest';
import { poolConfig } from '../../src/database/connection.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';

const USER = 'blocks';
const PASSWORD = 'blocks_dev';
const TEMPLATE_DB = 'blocks_template';

export interface TestDatabase {
  readonly name: string;
  readonly url: string;
  readonly prisma: PrismaClient;
  /** A plain pg connection, for raw SQL the ORM cannot or should not issue. */
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<pg.QueryResult<T>>;
  dispose(): Promise<void>;
}

/** A fresh, fully migrated database cloned from the template. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const port = inject('pgPort');
  const name = `t_${randomBytes(6).toString('hex')}`;
  const adminUrl = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${port}/postgres`;
  const url = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${port}/${name}`;

  const admin = new pg.Client({ connectionString: adminUrl });
  // The server ends these connections itself when it shuts down or a database is dropped with FORCE.
  // That is routine at the end of a run and must not surface as an uncaught exception.
  admin.on('error', () => undefined);
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name} TEMPLATE ${TEMPLATE_DB}`);

  const prisma = new PrismaClient({ adapter: new PrismaPg(poolConfig(url)) });
  const pool = new pg.Pool(poolConfig(url, { max: 4 }));
  pool.on('error', () => undefined);

  return {
    name,
    url,
    prisma,
    query: (sql, params) => pool.query(sql, params as unknown[]),
    async dispose() {
      await prisma.$disconnect();
      await pool.end();
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end();
    },
  };
}
