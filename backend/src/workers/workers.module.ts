import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { AdsModule } from '../ads/ads.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { EarningsModule } from '../earnings/earnings.module.js';
import { MediaModule } from '../media/media.module.js';
import { MusicModule } from '../music/music.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { ReachModule } from '../reach/reach.module.js';
import { SocialModule } from '../social/social.module.js';
import { MaintenanceScheduler } from './maintenance.scheduler.js';

/** Background work that runs inside the API process (see `MaintenanceScheduler`). */
@Module({
  imports: [
    AuthModule,
    AdminModule,
    MediaModule,
    MusicModule,
    ReachModule,
    EarningsModule,
    PaymentsModule,
    SocialModule,
    AdsModule,
  ],
  providers: [MaintenanceScheduler],
  exports: [MaintenanceScheduler],
})
export class WorkersModule {}
