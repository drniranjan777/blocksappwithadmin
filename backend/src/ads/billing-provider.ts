import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppError } from '../common/errors/app-error.js';

export interface ChargeRequest {
  campaignId: string;
  advertiserId: string;
  /** Rupees as a decimal string, "1500.00". */
  amount: string;
}

export interface ChargeResult {
  status: 'PAID' | 'FAILED';
  /** The provider's own reference, for reconciliation. */
  reference: string;
}

/**
 * The seam to whatever takes an advertiser's money.
 *
 * BLOCKS charges nobody today: with no provider configured, funding a campaign is refused, a
 * campaign can be approved but never goes live, and the database refuses an active campaign that
 * has not been paid for. A real provider (a payment gateway integration, with GST invoicing and
 * the accounting that goes with it) is added here when the business has one; until then the
 * development provider below stands in for it and is refused in production.
 */
export abstract class BillingProvider {
  /** Whether this provider can take money at all. */
  abstract readonly configured: boolean;
  abstract charge(request: ChargeRequest): Promise<ChargeResult>;
  abstract refund(request: ChargeRequest & { reference: string }): Promise<{ reference: string }>;
}

/** No provider: nothing can be paid for. */
@Injectable()
export class NullBillingProvider extends BillingProvider {
  readonly configured = false;

  async charge(): Promise<ChargeResult> {
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Paying for advertising is not available yet.');
  }

  async refund(): Promise<{ reference: string }> {
    throw new AppError(
      503,
      'SERVICE_UNAVAILABLE',
      'Refunds for advertising are not available yet.',
    );
  }
}

/** Development and tests only: "pays" at once and moves no money. */
@Injectable()
export class DevBillingProvider extends BillingProvider {
  readonly configured = true;

  async charge(): Promise<ChargeResult> {
    return { status: 'PAID', reference: `dev_${randomUUID()}` };
  }

  async refund(): Promise<{ reference: string }> {
    return { reference: `dev_refund_${randomUUID()}` };
  }
}
