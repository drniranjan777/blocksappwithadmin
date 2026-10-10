import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './app-throttler.guard.js';
import { ResilientThrottlerStorage } from './resilient-throttler.storage.js';

@Module({
  providers: [ResilientThrottlerStorage],
  exports: [ResilientThrottlerStorage],
})
class ThrottlerStorageModule {}

/**
 * A global rate limit for every route (120 requests a minute per IP), shared
 * across API instances through Redis. Routes that are attractive to attackers
 * (sign-in, OTP, password reset) set much tighter limits with `@Throttle`.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ThrottlerStorageModule],
      inject: [ResilientThrottlerStorage],
      useFactory: (storage: ResilientThrottlerStorage) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
        storage,
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class ThrottlingModule {}
