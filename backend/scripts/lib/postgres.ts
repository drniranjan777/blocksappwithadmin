// A real PostgreSQL for development and tests, with no Docker or system install:
// the server binaries come from the `embedded-postgres` npm package.
//
// This is a development tool. Production uses a managed or hardened PostgreSQL
// (see docs/deployment.md); nothing under src/ imports this file.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
export const backendRoot = resolve(here, '..', '..');

export interface PostgresOptions {
  /** Where the data directory lives. */
  dataDir: string;
  port: number;
  user?: string;
  password?: string;
  /** Keep the data after stop(). Tests use false. */
  persistent?: boolean;
  /**
   * Throw-away data: skip the durability guarantees (fsync, full-page writes) so
   * cloning and writing are several times faster. Never for data you want to keep.
   */
  fast?: boolean;
}

export interface RunningPostgres {
  readonly port: number;
  url(database: string): string;
  createDatabase(name: string, template?: string): Promise<void>;
  dropDatabase(name: string): Promise<void>;
  databaseExists(name: string): Promise<boolean>;
  stop(): Promise<void>;
}

const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;

function assertIdentifier(name: string): void {
  // Database names are interpolated into DDL (they cannot be bound parameters),
  // so only a strict identifier is accepted.
  if (!IDENTIFIER.test(name)) throw new Error(`unsafe database name: ${name}`);
}

/** A free TCP port on localhost. */
export function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      srv.close(() => resolvePort(port));
    });
  });
}

export async function startPostgres(options: PostgresOptions): Promise<RunningPostgres> {
  const user = options.user ?? 'blocks';
  const password = options.password ?? 'blocks_dev';
  const persistent = options.persistent ?? false;
  const dataDir = resolve(options.dataDir);
  const fresh = !existsSync(resolve(dataDir, 'PG_VERSION'));

  mkdirSync(dirname(dataDir), { recursive: true });
  const server = new EmbeddedPostgres({
    databaseDir: dataDir,
    user,
    password,
    port: options.port,
    persistent,
    // UTF-8 and the C locale on every platform, so behaviour matches production.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    // The server speaks UTC too, so psql and other tools agree with the API.
    postgresFlags: [
      '-c',
      'timezone=UTC',
      ...(options.fast
        ? ['-c', 'fsync=off', '-c', 'synchronous_commit=off', '-c', 'full_page_writes=off']
        : []),
    ],
    onLog: () => undefined,
    onError: () => undefined,
  });
  if (fresh) await server.initialise();
  await server.start();

  const url = (database: string): string =>
    `postgresql://${user}:${password}@127.0.0.1:${options.port}/${database}`;

  const admin = async <T>(fn: (c: pg.Client) => Promise<T>): Promise<T> => {
    const client = new pg.Client({ connectionString: url('postgres') });
    await client.connect();
    try {
      return await fn(client);
    } finally {
      await client.end();
    }
  };

  return {
    port: options.port,
    url,
    async createDatabase(name, template) {
      assertIdentifier(name);
      if (template) assertIdentifier(template);
      await admin((c) =>
        c.query(`CREATE DATABASE ${name}${template ? ` TEMPLATE ${template}` : ''}`),
      );
    },
    async dropDatabase(name) {
      assertIdentifier(name);
      await admin((c) => c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`));
    },
    async databaseExists(name) {
      const r = await admin((c) => c.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]));
      return r.rowCount === 1;
    },
    async stop() {
      await server.stop();
    },
  };
}

/** Applies every migration in prisma/migrations, the way production does. */
export async function applyMigrations(databaseUrl: string): Promise<string> {
  const { stdout } = await run(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    { cwd: backendRoot, env: { ...process.env, DATABASE_URL: databaseUrl } },
  );
  return stdout;
}
