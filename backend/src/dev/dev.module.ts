import { type DynamicModule, Module } from '@nestjs/common';
import type { Env } from '../config/env.js';
import { DevController } from './dev.controller.js';

@Module({})
export class DevModule {
  /** Contributes nothing at all unless the development outbox is switched on. */
  static forRoot(env: Env): DynamicModule {
    return {
      module: DevModule,
      controllers: env.devOutboxEnabled ? [DevController] : [],
    };
  }
}
