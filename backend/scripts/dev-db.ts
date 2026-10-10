// A local PostgreSQL for development, with no Docker or system install:
//
//     npm run db:up
//
// Starts (and keeps running, until Ctrl-C) a real PostgreSQL whose data lives in
// backend/.devdb/dev, creates the `blocks_dev` database if it is not there yet,
// applies every migration, and prints the DATABASE_URL to use.
//
// Development only. Production uses a managed PostgreSQL (docs/deployment.md).
import { resolve } from 'node:path';
import { applyMigrations, backendRoot, startPostgres } from './lib/postgres.js';

export const DEV_DB = 'blocks_dev';
const port = Number(process.env['DEV_DB_PORT'] ?? 54340);

const server = await startPostgres({
  dataDir: resolve(backendRoot, '.devdb', 'dev'),
  port,
  persistent: true,
});

if (!(await server.databaseExists(DEV_DB))) {
  await server.createDatabase(DEV_DB);
  console.log(`Created database ${DEV_DB}`);
}
const url = server.url(DEV_DB);
await applyMigrations(url);

console.log('');
console.log('PostgreSQL is running for development.');
console.log(`  DATABASE_URL=${url}`);
console.log('');
console.log('Next, in another terminal:');
console.log('  npm run db:seed     (RBAC roles, and a first super admin if there is none)');
console.log('  npm run start:dev   (the API; set DATABASE_URL as above)');
console.log('');
console.log('Press Ctrl-C to stop.');

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log('\nStopping PostgreSQL...');
  await server.stop();
  process.exit(0);
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
// Keep the process alive.
setInterval(() => undefined, 1 << 30);
