// Reports what Prisma thinks differs between the migrated database and the
// schema files. Used to understand which hand-written objects it cannot see.
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { applyMigrations, backendRoot, freePort, startPostgres } from './lib/postgres.js';

const run = promisify(execFile);
const port = await freePort();
const server = await startPostgres({
  dataDir: resolve(backendRoot, '.devdb', `drift-${process.pid}`),
  port,
  persistent: false,
});
try {
  await server.createDatabase('drift');
  const url = server.url('drift');
  await applyMigrations(url);
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
    { cwd: backendRoot, env: { ...process.env, DATABASE_URL: url } },
  );
  console.log(stdout.trim() === '-- This is an empty migration.' ? 'NO DRIFT' : stdout);
} finally {
  await server.stop();
}
