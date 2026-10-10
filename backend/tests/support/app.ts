import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../../src/app.factory.js';
import { AppModule } from '../../src/app.module.js';
import { type Env, loadEnv } from '../../src/config/env.js';
import { createTestDatabase, type TestDatabase } from './database.js';

export interface TestApp {
  app: NestExpressApplication;
  env: Env;
  db: TestDatabase;
  /** supertest against the in-process HTTP server (no real port is opened). */
  http: ReturnType<typeof request>;
  close(): Promise<void>;
}

/**
 * The real application (every module, guard, filter and pipe) against a freshly
 * cloned, fully migrated database. Only provider *adapters* are swapped for
 * in-memory ones; the HTTP layer is exactly what runs in production.
 */
export async function createTestApp(
  overrides: Record<string, string> = {},
  configure?: (builder: ReturnType<typeof Test.createTestingModule>) => void,
): Promise<TestApp> {
  const db = await createTestDatabase();
  const { env } = loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: db.url,
    DATABASE_POOL_MAX: '5',
    LOG_LEVEL: 'silent',
    // Real hashing is slow by design; the policy is the same, this keeps the suite quick.
    ...overrides,
  } as NodeJS.ProcessEnv);

  const builder = Test.createTestingModule({ imports: [AppModule.forRoot(env)] });
  configure?.(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app, env);
  await app.init();
  // supertest attaches listeners per request; many parallel requests are normal in these tests.
  app.getHttpServer().setMaxListeners(0);

  return {
    app,
    env,
    db,
    http: request(app.getHttpServer()),
    async close() {
      await app.close();
      await db.dispose();
    },
  };
}
