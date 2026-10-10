import type { Tone } from '@/components/ui/tag';
import type { BillingState, BusinessStatus, CampaignStatus, VerificationKind, VerificationState } from './types';

/** Plain words for the business and advertising states, so the console never shows a raw constant. */

export const PAGE_STATUS: Record<BusinessStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  PENDING_VERIFICATION: { label: 'Awaiting verification', tone: 'warn' },
  ACTIVE: { label: 'Published', tone: 'good' },
  SUSPENDED: { label: 'Suspended', tone: 'bad' },
};

export const VERIFICATION_STATE: Record<VerificationState, { label: string; tone: Tone }> = {
  NONE: { label: 'Not verified', tone: 'neutral' },
  PENDING: { label: 'Waiting', tone: 'brand' },
  APPROVED: { label: 'Verified', tone: 'good' },
  REJECTED: { label: 'Refused', tone: 'bad' },
};

export const VERIFICATION_KIND: Record<VerificationKind, string> = {
  IDENTITY: 'Identity badge',
  BUSINESS: 'Business badge',
  PUBLISHER: 'Publisher badge',
};

export const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  IN_REVIEW: { label: 'Waiting for review', tone: 'brand' },
  APPROVED: { label: 'Approved, not running', tone: 'warn' },
  ACTIVE: { label: 'Running', tone: 'good' },
  PAUSED: { label: 'Paused', tone: 'warn' },
  COMPLETED: { label: 'Finished', tone: 'neutral' },
  REJECTED: { label: 'Turned down', tone: 'bad' },
  FLAGGED: { label: 'Flagged', tone: 'bad' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

export const BILLING_STATE: Record<BillingState, { label: string; tone: Tone }> = {
  NOT_CONFIGURED: { label: 'Not paid for', tone: 'neutral' },
  PENDING: { label: 'Payment in progress', tone: 'warn' },
  PAID: { label: 'Paid', tone: 'good' },
  FAILED: { label: 'Payment failed', tone: 'bad' },
  REFUNDED: { label: 'Refunded', tone: 'neutral' },
};

export const OBJECTIVE_LABEL: Record<string, string> = {
  AWARENESS: 'Get known',
  TRAFFIC: 'Send visitors to a website',
  LOCAL_REACH: 'Reach people nearby',
  BOOST_CONTENT: 'Promote a post or reel',
  LEADS: 'Collect enquiries',
};

/** What the reviewer is told about each flag the system raised when the campaign was sent. */
export function describeFlag(key: string, value: unknown): string | null {
  switch (key) {
    case 'linkShortener':
      return value ? 'Uses a link shortener, so the real destination is hidden' : null;
    case 'newAccount':
      return value ? 'The advertiser’s account is under a week old' : null;
    case 'destinationHost':
      return typeof value === 'string' ? `Leads to ${value}` : null;
    case 'audienceAtLeast':
      return typeof value === 'number' ? `Audience of at least ${value}` : null;
    default:
      return null;
  }
}
