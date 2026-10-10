import { Injectable } from '@nestjs/common';
import { SystemSettingsService } from '../common/settings/system-settings.service.js';
import { type Paise, parseRupees } from '../ledger/money.js';

/**
 * The compliance and risk limits for identity, bank accounts and payouts.
 *
 * Every figure is a **setting**, not a constant: staff change them without a deploy, and the
 * app reads the ones it shows from the API instead of hard-coding them. The defaults below are
 * cautious starting points, not legal advice: the real limits, KYC validity and document
 * retention periods are for the business and its counsel to decide.
 */
export const SETTING_DEFAULTS = {
  'kyc.valid_days': 730,
  'kyc.document_retention_days': 1825,
  'payouts.min_amount': '100.00',
  'payouts.max_amount': '50000.00',
  'payouts.daily_limit': '100000.00',
  'payouts.step_up_amount': '1000.00',
  'payouts.review_amount': '10000.00',
  'payouts.dual_approval_amount': '50000.00',
  'payouts.new_account_hold_hours': 48,
  'payouts.max_accounts': 3,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export interface PayoutLimits {
  min: Paise;
  max: Paise;
  dailyLimit: Paise;
  /** At or above this, the request needs a fresh step-up. */
  stepUp: Paise;
  /** At or above this, a person reviews the payout before it is sent. */
  review: Paise;
  /** At or above this, two different people must approve it. */
  dualApproval: Paise;
  newAccountHoldHours: number;
  maxAccounts: number;
}

@Injectable()
export class PaymentSettings {
  constructor(private readonly settings: SystemSettingsService) {}

  private async money(key: SettingKey): Promise<Paise> {
    const fallback = SETTING_DEFAULTS[key] as string;
    const raw = await this.settings.get<string>(key, fallback);
    try {
      return parseRupees(String(raw));
    } catch {
      // A malformed setting must never loosen a limit: fall back to the default.
      return parseRupees(fallback);
    }
  }

  private async whole(key: SettingKey): Promise<number> {
    const fallback = SETTING_DEFAULTS[key] as number;
    const raw = Number(await this.settings.get<number>(key, fallback));
    return Number.isInteger(raw) && raw >= 0 ? raw : fallback;
  }

  kycValidDays(): Promise<number> {
    return this.whole('kyc.valid_days');
  }

  documentRetentionDays(): Promise<number> {
    return this.whole('kyc.document_retention_days');
  }

  async payoutLimits(): Promise<PayoutLimits> {
    const [min, max, dailyLimit, stepUp, review, dualApproval, newAccountHoldHours, maxAccounts] =
      await Promise.all([
        this.money('payouts.min_amount'),
        this.money('payouts.max_amount'),
        this.money('payouts.daily_limit'),
        this.money('payouts.step_up_amount'),
        this.money('payouts.review_amount'),
        this.money('payouts.dual_approval_amount'),
        this.whole('payouts.new_account_hold_hours'),
        this.whole('payouts.max_accounts'),
      ]);
    return { min, max, dailyLimit, stepUp, review, dualApproval, newAccountHoldHours, maxAccounts };
  }
}
