// Throws away the development database and rebuilds it from the migrations:
//
//     npm run db:reset
//
// Needs `npm run db:up` running. Refuses to touch anything that is not the local
// development database, so it cannot be pointed at a real one by accident.
import { applyMigrations } from './lib/postgres.js';
import pg from 'pg';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set. Run `npm run db:up` first and use the URL it prints.');
  process.exit(1);
}
const parsed = new URL(url);
const database = parsed.pathname.slice(1);
const local = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(parsed.hostname);
if (!local || database !== 'blocks_dev') {
  console.error(
    `Refusing to reset "${database}" on ${parsed.hostname}: only the local blocks_dev database can be reset.`,
  );
  process.exit(1);
}

const admin = new pg.Client({ connectionString: new URL('/postgres', url).toString() });
await admin.connect();
try {
  await admin.query('DROP DATABASE IF EXISTS blocks_dev WITH (FORCE)');
  await admin.query('CREATE DATABASE blocks_dev');
} finally {
  await admin.end();
}
await applyMigrations(url);
console.log('blocks_dev rebuilt from the migrations. Run `npm run db:seed` to add the base data.');
