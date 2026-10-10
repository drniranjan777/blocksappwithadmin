// Starts one real PostgreSQL for the whole integration run and migrates a
// template database. Each test file then clones the template, which takes
// milliseconds and gives it a pristine, isolated database.
import { resolve } from 'node:path';
import type { TestProject } from 'vitest/node';
import {
  applyMigrations,
  backendRoot,
  freePort,
  startPostgres,
} from '../../scripts/lib/postgres.js';

export const TEMPLATE_DB = 'blocks_template';

declare module 'vitest' {
  export interface ProvidedContext {
    pgPort: number;
  }
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const port = await freePort();
  const server = await startPostgres({
    dataDir: resolve(backendRoot, '.devdb', `test-${process.pid}-${port}`),
    port,
    persistent: false,
    // Disposable data: skip durability for speed.
    fast: true,
  });
  await server.createDatabase(TEMPLATE_DB);
  await applyMigrations(server.url(TEMPLATE_DB));
  project.provide('pgPort', port);

  return async () => {
    await server.stop();
  };
}
