import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp } from './app.factory.js';
import { ConfigError, loadEnv } from './config/env.js';

async function bootstrap(): Promise<void> {
  let loaded;
  try {
    loaded = loadEnv();
  } catch (error) {
    if (error instanceof ConfigError) {
      // A readable list of what is wrong, and no stack trace: this is operator error.
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
  const { env, warnings } = loaded;

  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  const log = app.get(Logger);
  for (const warning of warnings) log.warn(warning);

  configureApp(app, env);
  await app.listen(env.PORT, env.HOST);
  log.log(
    `BLOCKS API listening on ${env.HOST}:${env.PORT} (${env.NODE_ENV})` +
      (env.swaggerEnabled ? ` — docs at /api/docs` : ''),
  );
}

await bootstrap();
