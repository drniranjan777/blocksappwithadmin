import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { EarningsModule } from '../earnings/earnings.module.js';
import { BankAccountsService } from './bank/bank.service.js';
import { PayoutsAdminController } from './payouts/payouts-admin.controller.js';
import { PayoutsController } from './payouts/payouts.controller.js';
import { PayoutsService } from './payouts/payouts.service.js';
import { TaxService } from './payouts/tax.service.js';
import { KycAdminController } from './kyc/kyc-admin.controller.js';
import { KycFilesService } from './kyc/kyc-files.service.js';
import { KycController } from './kyc/kyc.controller.js';
import { KycService } from './kyc/kyc.service.js';
import { PaymentSettings } from './payment-settings.js';
import {
  MockBankVerificationProvider,
  MockKycProvider,
  MockPayoutProvider,
} from './providers/mock-providers.js';
import { BankVerificationProvider, KycProvider, PayoutProvider } from './providers/providers.js';

/**
 * Identity verification, bank accounts and payouts.
 *
 * The outside services (identity, bank verification, the payout rail) are chosen here from
 * configuration. Only mock implementations exist, they are refused in production, and money
 * features are off by default there: see MONEY_FEATURES_ENABLED.
 */
@Module({
  imports: [AdminModule, AuthModule, EarningsModule],
  controllers: [KycController, KycAdminController, PayoutsController, PayoutsAdminController],
  providers: [
    PaymentSettings,
    KycFilesService,
    KycService,
    BankAccountsService,
    PayoutsService,
    TaxService,
    {
      provide: KycProvider,
      inject: [ENV],
      useFactory: (_env: Env): KycProvider => new MockKycProvider(),
    },
    {
      provide: BankVerificationProvider,
      inject: [ENV],
      useFactory: (_env: Env): BankVerificationProvider => new MockBankVerificationProvider(),
    },
    {
      provide: PayoutProvider,
      inject: [ENV],
      useFactory: (_env: Env): PayoutProvider => new MockPayoutProvider(),
    },
  ],
  exports: [
    KycService,
    BankAccountsService,
    PayoutsService,
    PaymentSettings,
    BankVerificationProvider,
    PayoutProvider,
    KycFilesService,
  ],
})
export class PaymentsModule {}
