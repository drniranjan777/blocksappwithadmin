import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AdminModule } from './admin/admin.module.js';
import { AdsModule } from './ads/ads.module.js';
import { BusinessModule } from './business/business.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CommonModule } from './common/common.module.js';
import { loggerParams } from './common/logging/logger.config.js';
import { ThrottlingModule } from './common/throttling/throttling.module.js';
import { ConfigModule } from './config/config.module.js';
import type { Env } from './config/env.js';
import { CryptoModule } from './common/crypto/crypto.module.js';
import { DatabaseModule } from './database/database.module.js';
import { DevModule } from './dev/dev.module.js';
import { HealthModule } from './health/health.module.js';
import { EarningsModule } from './earnings/earnings.module.js';
import { MediaModule } from './media/media.module.js';
import { MusicModule } from './music/music.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { ReachModule } from './reach/reach.module.js';
import { ReelsModule } from './reels/reels.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { ProvidersModule } from './providers/providers.module.js';
import { SocialModule } from './social/social.module.js';
import { TrustModule } from './trust/trust.module.js';
import { RedisModule } from './redis/redis.module.js';
import { WorkersModule } from './workers/workers.module.js';

@Module({})
export class AppModule {
  /** The environment is passed in so a test can run an app against its own database. */
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        LoggerModule.forRoot(loggerParams(env)),
        DatabaseModule,
        RedisModule,
        CommonModule,
        CryptoModule,
        ThrottlingModule,
        ProvidersModule,
        NotificationsModule,
        HealthModule,
        AuthModule,
        AdminModule,
        SocialModule,
        MediaModule,
        MusicModule,
        ReelsModule,
        ReachModule,
        EarningsModule,
        PaymentsModule,
        TrustModule,
        BusinessModule,
        AdsModule,
        WorkersModule,
        DevModule.forRoot(env),
      ],
    };
  }
}
