// Applies every migration to a throw-away PostgreSQL and reports what it built.
// Run with:  npm run db:verify
import { resolve } from 'node:path';
import pg from 'pg';
import { applyMigrations, backendRoot, freePort, startPostgres } from './lib/postgres.js';

const port = await freePort();
const server = await startPostgres({
  dataDir: resolve(backendRoot, '.devdb', `verify-${process.pid}`),
  port,
  persistent: false,
});
try {
  await server.createDatabase('verify');
  const url = server.url('verify');
  const out = await applyMigrations(url);
  console.log(
    out
      .split('\n')
      .filter((l) => /migration|applied/i.test(l))
      .join('\n'),
  );

  const c = new pg.Client({ connectionString: url });
  await c.connect();
  const count = async (sql: string): Promise<number> =>
    Number((await c.query<{ n: string }>(sql)).rows[0]?.n ?? 0);
  console.log(
    'tables      :',
    await count(
      "select count(*) n from information_schema.tables where table_schema='public' and table_name <> '_prisma_migrations'",
    ),
  );
  console.log(
    'enum types  :',
    await count(
      "select count(*) n from pg_type t join pg_namespace s on s.oid=t.typnamespace where t.typtype='e' and s.nspname='public'",
    ),
  );
  console.log(
    'indexes     :',
    await count("select count(*) n from pg_indexes where schemaname='public'"),
  );
  console.log(
    'check cons. :',
    await count(
      "select count(*) n from pg_constraint where contype='c' and connamespace='public'::regnamespace",
    ),
  );
  console.log(
    'triggers    :',
    await count('select count(*) n from pg_trigger where not tgisinternal'),
  );
  await c.end();
} finally {
  await server.stop();
}
