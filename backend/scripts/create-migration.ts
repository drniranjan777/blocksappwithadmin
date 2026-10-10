// Writes the next migration from the difference between the migrations so far and
// the Prisma schema files:
//
//     npm run db:migrate:create -- add_something
//
// (`prisma migrate dev` cannot run without a terminal, so this does the same job:
// it replays the existing migrations into a throw-away database, asks Prisma for
// the SQL that gets from there to the schema, and saves it.) Hand-written SQL
// that Prisma cannot express (triggers, CHECKs) goes into a migration of its own
// that you write yourself; see 20261009000100_integrity.
import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { applyMigrations, backendRoot, freePort, startPostgres } from './lib/postgres.js';

const run = promisify(execFile);
const name = (process.argv[2] ?? '').trim();
if (!/^[a-z][a-z0-9_]{2,60}$/.test(name)) {
  console.error('Usage: npm run db:migrate:create -- <name_in_snake_case>');
  process.exit(1);
}

const port = await freePort();
const server = await startPostgres({
  dataDir: resolve(backendRoot, '.devdb', `create-${process.pid}`),
  port,
  persistent: false,
});
try {
  await server.createDatabase('shadow');
  await applyMigrations(server.url('shadow'));
  const { stdout } = await run(
    process.execPath,
    [
      'node_modules/prisma/build/index.js',
      'migrate',
      'diff',
      '--from-config-datasource',
      '--to-schema',
      'prisma/schema',
      '--script',
    ],
    { cwd: backendRoot, env: { ...process.env, DATABASE_URL: server.url('shadow') } },
  );
  const sql = stdout.trim();
  if (!sql || sql === '-- This is an empty migration.') {
    console.log('The schema matches the migrations: nothing to create.');
  } else {
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const dir = resolve(backendRoot, 'prisma', 'migrations', `${stamp}_${name}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'migration.sql'), `${sql}\n`, 'utf8');
    console.log(`Wrote ${dir}\nReview it before committing.`);
  }
} finally {
  await server.stop();
}
