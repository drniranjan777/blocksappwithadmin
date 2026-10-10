import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { ReachCoreModule } from '../reach/reach-core.module.js';
import { CreatorProfileService } from './creator-profile.service.js';
import { CreatorController } from './creator.controller.js';
import { EarningsAdminController } from './earnings-admin.controller.js';
import { EarningsService } from './earnings.service.js';

/** Creator Studio, reward cycles and the earnings that reach the ledger. */
@Module({
  imports: [AdminModule, LedgerModule, ReachCoreModule],
  controllers: [CreatorController, EarningsAdminController],
  providers: [CreatorProfileService, EarningsService],
  exports: [CreatorProfileService, EarningsService, LedgerModule],
})
export class EarningsModule {}
