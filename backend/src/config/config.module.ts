import { Global, Module, type DynamicModule } from '@nestjs/common';
import type { Env } from './env.js';

/** Injection token for the validated environment. */
export const ENV = Symbol('ENV');

/**
 * The parsed, validated environment, available everywhere. It is passed in
 * (not read from `process.env` here) so tests can start an app with their own
 * database and secrets without touching the real environment.
 */
@Global()
@Module({})
export class ConfigModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    };
  }
}
