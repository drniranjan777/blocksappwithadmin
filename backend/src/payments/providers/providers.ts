import type { NameMatch } from '../../generated/prisma/client.js';

/**
 * The three outside services money depends on, as interfaces.
 *
 * Nothing in BLOCKS decides whether a person is who they say they are, whether a bank account
 * exists and belongs to them, or whether money reached a bank. Those answers come from
 * authorised providers; this system records the answer and acts on it. Only clearly labelled
 * **mock** implementations exist today, they are refused in production, and a real provider is
 * added by implementing one of these classes and selecting it in configuration. Nothing else
 * changes.
 */

// ------------------------------------------------------------------ identity --

export interface KycCheckInput {
  subject: 'INDIVIDUAL' | 'BUSINESS';
  /** The legal name as submitted. */
  legalName: string;
  dateOfBirth?: string | undefined;
  pan: string;
  businessName?: string | undefined;
  gstin?: string | undefined;
}

export interface KycCheckResult {
  /** The provider's id for the case. */
  reference: string;
  /** APPROVED: verified by the provider. REVIEW: a person must look. REJECTED: failed. */
  outcome: 'APPROVED' | 'REVIEW' | 'REJECTED';
  /** Why, as a short code the app maps to words. */
  reasonCode?: string | undefined;
  /** The provider confirmed the PAN exists and belongs to the name given. */
  panVerified: boolean;
  nameMatch: NameMatch;
}

export abstract class KycProvider {
  abstract readonly name: string;
  abstract check(input: KycCheckInput): Promise<KycCheckResult>;
}

// ---------------------------------------------------------------------- bank --

export interface BankCheckInput {
  accountNumber: string;
  ifsc: string;
  /** The name the account holder gave. */
  holderName: string;
}

export interface BankCheckResult {
  reference: string;
  status: 'VERIFIED' | 'FAILED';
  /** The name the bank holds for the account (what a real penny-drop returns). */
  beneficiaryName?: string | undefined;
  failureCode?: string | undefined;
}

export abstract class BankVerificationProvider {
  abstract readonly name: string;
  abstract verify(input: BankCheckInput): Promise<BankCheckResult>;
}

// -------------------------------------------------------------------- payouts --

export interface PayoutSendInput {
  /** Our payout id: the provider must treat a repeat of it as the same payout. */
  reference: string;
  /** Rupees as a decimal string. */
  amount: string;
  accountNumber: string;
  ifsc: string;
  holderName: string;
  narration: string;
}

export interface PayoutProviderResult {
  providerReference: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  failureCode?: string | undefined;
}

export abstract class PayoutProvider {
  abstract readonly name: string;
  /** Sends money. Safe to call again with the same `reference`: it must not pay twice. */
  abstract send(input: PayoutSendInput): Promise<PayoutProviderResult>;
  /** Where a payout stands now. */
  abstract status(providerReference: string): Promise<PayoutProviderResult>;
}
