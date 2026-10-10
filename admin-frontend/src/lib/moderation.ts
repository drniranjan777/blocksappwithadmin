import type { ReportCategory, ReportStatus, ReportTargetType, Severity, StaffAction } from './types';
import type { Tone } from '@/components/ui/tag';

/** Plain words for what the API calls things, so the console never shows a raw constant. */

export const SEVERITY_TONE: Record<Severity, Tone> = {
  LOW: 'neutral',
  MEDIUM: 'warn',
  HIGH: 'bad',
  CRITICAL: 'bad',
};

export const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export const CATEGORY_LABEL: Record<ReportCategory, string> = {
  MISINFORMATION: 'Misinformation',
  VIOLENCE: 'Violence',
  FRAUD: 'Fraud or scam',
  HARASSMENT: 'Harassment',
  SPAM: 'Spam',
  COPYRIGHT: 'Copyright',
  NUDITY: 'Nudity or sexual content',
  SELF_HARM: 'Self-harm',
  CHILD_SAFETY: 'Child safety',
  FAKE_ENGAGEMENT: 'Fake engagement',
  DEEPFAKE: 'Deceptive synthetic media',
  OTHER: 'Other',
};

export const CATEGORIES = Object.keys(CATEGORY_LABEL) as ReportCategory[];

export const TARGET_LABEL: Record<ReportTargetType, string> = {
  POST: 'Post',
  REEL: 'Reel',
  STORY: 'Story',
  COMMENT: 'Comment',
  USER: 'Account',
  LIVE: 'Live session',
  MESSAGE: 'Message',
};

export const STATUS_LABEL: Record<ReportStatus, string> = {
  OPEN: 'Waiting',
  IN_REVIEW: 'Being reviewed',
  ESCALATED: 'Escalated',
  RESOLVED: 'Acted on',
  DISMISSED: 'Dismissed',
};

export function reportStatusTone(status: ReportStatus): Tone {
  switch (status) {
    case 'OPEN':
      return 'brand';
    case 'IN_REVIEW':
      return 'warn';
    case 'ESCALATED':
      return 'bad';
    case 'RESOLVED':
      return 'good';
    case 'DISMISSED':
      return 'neutral';
  }
}

/** What each decision does, in the words a moderator needs before pressing the button. */
export const ACTION_INFO: Record<
  StaffAction,
  { label: string; effect: string; tone: 'good' | 'bad' | 'primary' | 'ghost' }
> = {
  APPROVE: {
    label: 'No violation: leave it up',
    effect: 'Closes the report. If it was hidden automatically, it is shown again.',
    tone: 'good',
  },
  DISMISS_REPORT: {
    label: 'Dismiss the report',
    effect: 'Closes the report and changes nothing about the item.',
    tone: 'ghost',
  },
  WARN: {
    label: 'Warn the person',
    effect: 'The item stays up. They are told which rule it broke, and can appeal.',
    tone: 'primary',
  },
  RESTRICT: {
    label: 'Hide it',
    effect: 'Only its author can see it. They are told why and can appeal. Reversible.',
    tone: 'bad',
  },
  REMOVE: {
    label: 'Remove it',
    effect: 'Taken down for everyone but kept on record. They are told why and can appeal. Reversible.',
    tone: 'bad',
  },
  RESTRICT_USER: {
    label: 'Restrict the account',
    effect: 'They can sign in and read but cannot post or comment. They can appeal.',
    tone: 'bad',
  },
  SUSPEND_USER: {
    label: 'Suspend the account',
    effect: 'Signed out everywhere and unable to sign in. They are e-mailed and can appeal.',
    tone: 'bad',
  },
};

export const DECISION_LABEL: Record<string, string> = {
  APPROVE: 'No violation',
  DISMISS_REPORT: 'Dismissed',
  WARN: 'Warning',
  RESTRICT: 'Hidden',
  REMOVE: 'Removed',
  RESTORE: 'Restored',
  RESTRICT_USER: 'Account restricted',
  SUSPEND_USER: 'Account suspended',
  REACTIVATE_USER: 'Account reactivated',
  ESCALATE: 'Escalated',
  LABEL: 'Labelled',
};

/** Decisions that can be taken back (the API checks this too, and that only the latest can be). */
export const REVERSIBLE = new Set(['RESTRICT', 'REMOVE', 'WARN', 'RESTRICT_USER', 'SUSPEND_USER']);

/**
 * Which published rules fit a decision. This mirrors the API's check so the form only offers rules
 * the API will accept; the API still decides.
 */
export function rulesFor<R extends { code: string }>(action: StaffAction, rules: readonly R[]): R[] {
  const dismissing = action === 'APPROVE' || action === 'DISMISS_REPORT';
  return rules.filter((r) => {
    if (r.code === 'no_violation') return dismissing;
    if (r.code === 'report_in_bad_faith') return action === 'DISMISS_REPORT';
    if (r.code === 'account_standing')
      return action === 'RESTRICT_USER' || action === 'SUSPEND_USER' || action === 'WARN';
    return !dismissing;
  });
}

export function hoursLabel(hours: number): string {
  if (hours < 1) return 'under an hour';
  if (hours === 1) return '1 hour';
  if (hours < 48) return `${hours} hours`;
  const days = Math.round(hours / 24);
  return `${days} days`;
}
