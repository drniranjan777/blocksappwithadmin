import { createHash } from 'node:crypto';
import { compareNames } from '../identifiers.js';
import {
  type BankCheckInput,
  type BankCheckResult,
  BankVerificationProvider,
  type KycCheckInput,
  type KycCheckResult,
  KycProvider,
  PayoutProvider,
  type PayoutProviderResult,
  type PayoutSendInput,
} from './providers.js';

/*
 * MOCK PROVIDERS. These stand in for real services so the rest of the system can be built and
 * tested end to end. They verify NOTHING real: no PAN is looked up, no account exists, no money
 * moves. They are refused in production. Their behaviour is driven by simple, documented
 * patterns in the input so tests can exercise every outcome.
 */

const ref = (kind: string, ...parts: string[]): string =>
  `mock_${kind}_${createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16)}`;

/**
 * MOCK identity provider.
 *   PAN digits `0000`              -> REJECTED (PAN_NOT_FOUND)
 *   legal name containing "review" -> REVIEW (MANUAL_CHECK)
 *   anything else                  -> APPROVED, PAN verified
 */
export class MockKycProvider extends KycProvider {
  readonly name = 'mock';

  async check(input: KycCheckInput): Promise<KycCheckResult> {
    const reference = ref('kyc', input.pan, input.legalName);
    if (input.pan.slice(5, 9) === '0000') {
      return {
        reference,
        outcome: 'REJECTED',
        reasonCode: 'PAN_NOT_FOUND',
        panVerified: false,
        nameMatch: 'UNKNOWN',
      };
    }
    if (/review/i.test(input.legalName)) {
      return {
        reference,
        outcome: 'REVIEW',
        reasonCode: 'MANUAL_CHECK',
        panVerified: true,
        nameMatch: 'PARTIAL',
      };
    }
    return { reference, outcome: 'APPROVED', panVerified: true, nameMatch: 'MATCH' };
  }
}

/**
 * MOCK bank verification (a penny-drop stand-in).
 *   account number ending `0000` -> FAILED (ACCOUNT_NOT_FOUND)
 *   account number ending `1111` -> verified, but the bank holds a different name
 *   account number ending `2222` -> verified, the bank holds only part of the name
 *   anything else                -> verified, the bank holds the name given
 */
export class MockBankVerificationProvider extends BankVerificationProvider {
  readonly name = 'mock';

  async verify(input: BankCheckInput): Promise<BankCheckResult> {
    const reference = ref('bank', input.accountNumber, input.ifsc);
    if (input.accountNumber.endsWith('0000')) {
      return { reference, status: 'FAILED', failureCode: 'ACCOUNT_NOT_FOUND' };
    }
    if (input.accountNumber.endsWith('1111')) {
      return { reference, status: 'VERIFIED', beneficiaryName: 'Someone Else Entirely' };
    }
    if (input.accountNumber.endsWith('2222')) {
      const words = input.holderName.split(/\s+/).filter(Boolean);
      return {
        reference,
        status: 'VERIFIED',
        beneficiaryName: `${words[0] ?? ''} Unrelated`.trim(),
      };
    }
    return { reference, status: 'VERIFIED', beneficiaryName: input.holderName };
  }
}

/**
 * MOCK payout rail. A payout is accepted as PROCESSING and settles when asked again. Stateless:
 * the outcome is encoded in the provider reference it hands out, so it survives a restart.
 *   account number ending `9999` -> FAILED (BANK_REJECTED) when asked again
 *   account number ending `8888` -> still PROCESSING when asked again
 *   anything else                -> COMPLETED when asked again
 * A repeat of the same reference returns the same provider reference and moves nothing more.
 */
export class MockPayoutProvider extends PayoutProvider {
  readonly name = 'mock';

  async send(input: PayoutSendInput): Promise<PayoutProviderResult> {
    const fate = input.accountNumber.endsWith('9999')
      ? 'f'
      : input.accountNumber.endsWith('8888')
        ? 'p'
        : 'c';
    return { providerReference: `${ref('payout', input.reference)}_${fate}`, status: 'PROCESSING' };
  }

  async status(providerReference: string): Promise<PayoutProviderResult> {
    if (!providerReference.startsWith('mock_payout_')) {
      return { providerReference, status: 'FAILED', failureCode: 'UNKNOWN_PAYOUT' };
    }
    const fate = providerReference.slice(-1);
    if (fate === 'f') return { providerReference, status: 'FAILED', failureCode: 'BANK_REJECTED' };
    if (fate === 'p') return { providerReference, status: 'PROCESSING' };
    return { providerReference, status: 'COMPLETED' };
  }
}

/** Used by tests that want to see how the provider's beneficiary name compares to a legal name. */
export const mockNameMatch = compareNames;
