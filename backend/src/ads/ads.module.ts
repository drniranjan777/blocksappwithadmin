import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { TrustModule } from '../trust/trust.module.js';
import { AdsAdminController } from './ads-admin.controller.js';
import { AdsAdminService } from './ads-admin.service.js';
import { AdsController } from './ads.controller.js';
import { AdsDeliveryService } from './ads-delivery.service.js';
import { AdsService } from './ads.service.js';
import { AudienceService } from './audience.service.js';
import { BillingProvider, DevBillingProvider, NullBillingProvider } from './billing-provider.js';

/**
 * Advertising: campaigns, their review, and the rules that keep them honest. There is no ad
 * network and no payment provider here; see `BillingProvider` and `AdsDeliveryService`.
 */
@Module({
  imports: [AdminModule, TrustModule],
  controllers: [AdsController, AdsAdminController],
  providers: [
    AudienceService,
    AdsService,
    AdsAdminService,
    AdsDeliveryService,
    {
      provide: BillingProvider,
      inject: [ENV],
      useFactory: (env: Env): BillingProvider =>
        env.ADS_BILLING_PROVIDER === 'dev' ? new DevBillingProvider() : new NullBillingProvider(),
    },
  ],
  exports: [AdsService, AdsDeliveryService, AudienceService],
})
export class AdsModule {}
