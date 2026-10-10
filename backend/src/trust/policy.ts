import type {
  ModerationActionType,
  ReportCategory,
  ReportTargetType,
  Severity,
} from '../generated/prisma/client.js';

/**
 * The rules moderation works from, written down once.
 *
 * Nothing here is the platform's legal policy: the titles and summaries are placeholders for the
 * text the business and its counsel publish, and the numbers are starting points that staff with
 * `policy.update` can change (see `PolicyService`). What the code fixes is the *shape*: every
 * decision names one published rule, so a person can always be told which rule a decision enforced
 * and an auditor can see that no decision was taken for "no reason".
 */

export const POLICY_VERSION = 'draft-2026-10';

export interface PolicyRule {
  code: string;
  title: string;
  summary: string;
  /** The report categories this rule can be used for. */
  categories: readonly ReportCategory[];
}

/** The rules a moderator can cite. Wording is a draft pending legal review. */
export const POLICY_RULES: readonly PolicyRule[] = [
  {
    code: 'harassment_bullying',
    title: 'Harassment and bullying',
    summary: 'Content that targets a person to demean, threaten or repeatedly torment them.',
    categories: ['HARASSMENT'],
  },
  {
    code: 'violence_threats',
    title: 'Violence and threats',
    summary: 'Content that threatens, glorifies or incites violence.',
    categories: ['VIOLENCE'],
  },
  {
    code: 'sexual_content',
    title: 'Nudity and sexual content',
    summary: 'Sexually explicit content, and non-consensual intimate imagery of any kind.',
    categories: ['NUDITY'],
  },
  {
    code: 'child_safety',
    title: 'Child safety',
    summary: 'Any content that sexualises or endangers a child.',
    categories: ['CHILD_SAFETY'],
  },
  {
    code: 'self_harm',
    title: 'Self-harm and suicide',
    summary: 'Content that promotes self-harm, or a person at risk who needs help.',
    categories: ['SELF_HARM'],
  },
  {
    code: 'fraud_scams',
    title: 'Fraud and scams',
    summary: 'Deceptive offers, impersonation to obtain money or data, and fake giveaways.',
    categories: ['FRAUD'],
  },
  {
    code: 'spam',
    title: 'Spam',
    summary: 'Repetitive, unsolicited or misleading promotion.',
    categories: ['SPAM'],
  },
  {
    code: 'fake_engagement',
    title: 'Fake engagement',
    summary: 'Bought or traded likes, followers, views or comments.',
    categories: ['FAKE_ENGAGEMENT'],
  },
  {
    code: 'misinformation',
    title: 'Harmful misinformation',
    summary: 'False claims likely to cause real-world harm.',
    categories: ['MISINFORMATION'],
  },
  {
    code: 'synthetic_media',
    title: 'Deceptive synthetic media',
    summary: 'Realistic AI-made or edited media shown as real to mislead.',
    categories: ['DEEPFAKE'],
  },
  {
    code: 'copyright',
    title: 'Copyright',
    summary: 'Content that uses somebody else’s work without the right to.',
    categories: ['COPYRIGHT'],
  },
  {
    code: 'other_guidelines',
    title: 'Other community guideline breach',
    summary: 'A breach of the community guidelines not covered by a more specific rule.',
    categories: [
      'MISINFORMATION',
      'VIOLENCE',
      'FRAUD',
      'HARASSMENT',
      'SPAM',
      'COPYRIGHT',
      'NUDITY',
      'SELF_HARM',
      'CHILD_SAFETY',
      'FAKE_ENGAGEMENT',
      'DEEPFAKE',
      'OTHER',
    ],
  },
  {
    code: 'account_standing',
    title: 'Account standing',
    summary: 'A decision about the account as a whole, such as repeated or serious breaches.',
    categories: [
      'MISINFORMATION',
      'VIOLENCE',
      'FRAUD',
      'HARASSMENT',
      'SPAM',
      'COPYRIGHT',
      'NUDITY',
      'SELF_HARM',
      'CHILD_SAFETY',
      'FAKE_ENGAGEMENT',
      'DEEPFAKE',
      'OTHER',
    ],
  },
  {
    code: 'no_violation',
    title: 'No violation found',
    summary: 'The content or account was reviewed and does not break a rule.',
    categories: [
      'MISINFORMATION',
      'VIOLENCE',
      'FRAUD',
      'HARASSMENT',
      'SPAM',
      'COPYRIGHT',
      'NUDITY',
      'SELF_HARM',
      'CHILD_SAFETY',
      'FAKE_ENGAGEMENT',
      'DEEPFAKE',
      'OTHER',
    ],
  },
  {
    code: 'report_in_bad_faith',
    title: 'Report made in bad faith',
    summary: 'The report was false, or part of a coordinated attempt to silence someone.',
    categories: [
      'MISINFORMATION',
      'VIOLENCE',
      'FRAUD',
      'HARASSMENT',
      'SPAM',
      'COPYRIGHT',
      'NUDITY',
      'SELF_HARM',
      'CHILD_SAFETY',
      'FAKE_ENGAGEMENT',
      'DEEPFAKE',
      'OTHER',
    ],
  },
];

/** Codes the system writes itself; a person cannot choose these. */
export const SYSTEM_REASONS = {
  autoHold: 'auto_hold_pending_review',
  seniorReview: 'senior_review',
  reversal: 'reversal',
  appealOverturned: 'appeal_overturned',
  appealWithdrawn: 'reversed_before_appeal_decision',
} as const;

const RULES_BY_CODE = new Map(POLICY_RULES.map((r) => [r.code, r]));
export const ruleByCode = (code: string): PolicyRule | undefined => RULES_BY_CODE.get(code);

/** A short, plain label for a decision's reason, for the person it affects. Falls back to the code. */
export function reasonTitle(code: string): string {
  if (code === SYSTEM_REASONS.autoHold) return 'Held for review';
  return ruleByCode(code)?.title ?? code;
}

// ------------------------------------------------------------ severity and SLA --

export interface CategoryPolicy {
  severity: Severity;
  /** Hours within which a person should have looked at it. */
  slaHours: number;
  /**
   * How many different people must report the same thing before it is hidden pending review.
   * 0 turns that off. Counting distinct people, not reports, so one account cannot hide
   * somebody's post alone by reporting it again and again.
   */
  autoHoldAt: number;
}

/**
 * Starting values. The business sets the real ones (response times are a staffing and
 * legal-obligation question, hiding on report is a trade-off between harm and brigading).
 */
export const CATEGORY_DEFAULTS: Record<ReportCategory, CategoryPolicy> = {
  CHILD_SAFETY: { severity: 'CRITICAL', slaHours: 1, autoHoldAt: 1 },
  SELF_HARM: { severity: 'CRITICAL', slaHours: 1, autoHoldAt: 0 },
  VIOLENCE: { severity: 'HIGH', slaHours: 4, autoHoldAt: 3 },
  NUDITY: { severity: 'HIGH', slaHours: 8, autoHoldAt: 3 },
  HARASSMENT: { severity: 'MEDIUM', slaHours: 24, autoHoldAt: 0 },
  FRAUD: { severity: 'MEDIUM', slaHours: 24, autoHoldAt: 0 },
  DEEPFAKE: { severity: 'MEDIUM', slaHours: 24, autoHoldAt: 0 },
  MISINFORMATION: { severity: 'MEDIUM', slaHours: 48, autoHoldAt: 0 },
  COPYRIGHT: { severity: 'MEDIUM', slaHours: 72, autoHoldAt: 0 },
  SPAM: { severity: 'LOW', slaHours: 72, autoHoldAt: 0 },
  FAKE_ENGAGEMENT: { severity: 'LOW', slaHours: 72, autoHoldAt: 0 },
  OTHER: { severity: 'LOW', slaHours: 72, autoHoldAt: 0 },
};

export const CATEGORIES = Object.keys(CATEGORY_DEFAULTS) as ReportCategory[];

export const SEVERITY_ORDER: Record<Severity, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

const SEVERITY_WEIGHT: Record<Severity, number> = { LOW: 0, MEDIUM: 20, HIGH: 40, CRITICAL: 60 };

export const maxSeverity = (a: Severity, b: Severity): Severity =>
  SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;

/**
 * Where a report sits in the queue: severity first, then how many different people reported the
 * same thing (up to 19 more points), so a widely reported item rises without ever outranking a
 * more severe one.
 */
export function priorityFor(severity: Severity, distinctReporters: number): number {
  return SEVERITY_WEIGHT[severity] + Math.min(Math.max(distinctReporters - 1, 0), 19);
}

// ------------------------------------------------------------------- actions --

/** Which kinds of thing each action can be applied to. */
export const CONTENT_TARGETS: readonly ReportTargetType[] = ['POST', 'REEL', 'STORY', 'COMMENT'];

export type StaffAction = Extract<
  ModerationActionType,
  'APPROVE' | 'RESTRICT' | 'REMOVE' | 'WARN' | 'RESTRICT_USER' | 'SUSPEND_USER' | 'DISMISS_REPORT'
>;

export const STAFF_ACTIONS: readonly StaffAction[] = [
  'APPROVE',
  'RESTRICT',
  'REMOVE',
  'WARN',
  'RESTRICT_USER',
  'SUSPEND_USER',
  'DISMISS_REPORT',
];

/** Permissions needed on top of `reports.resolve`. */
export const ACTION_PERMISSIONS: Record<StaffAction, readonly string[]> = {
  APPROVE: [],
  DISMISS_REPORT: [],
  WARN: [],
  RESTRICT: ['content.moderate'],
  REMOVE: ['content.moderate'],
  RESTRICT_USER: ['users.restrict'],
  SUSPEND_USER: ['users.suspend'],
};

export function actionAllowedOn(action: StaffAction, target: ReportTargetType): boolean {
  switch (action) {
    case 'APPROVE':
    case 'RESTRICT':
    case 'REMOVE':
      return CONTENT_TARGETS.includes(target);
    case 'WARN':
    case 'RESTRICT_USER':
    case 'SUSPEND_USER':
    case 'DISMISS_REPORT':
      return true;
  }
}

/** Reasons a person may cite for an action. A dismissal cites "no violation" or "bad faith". */
export function reasonAllowedFor(action: StaffAction, code: string): boolean {
  const rule = ruleByCode(code);
  if (!rule) return false;
  const dismissing = action === 'APPROVE' || action === 'DISMISS_REPORT';
  if (code === 'no_violation') return dismissing;
  if (code === 'report_in_bad_faith') return action === 'DISMISS_REPORT';
  if (code === 'account_standing')
    return action === 'RESTRICT_USER' || action === 'SUSPEND_USER' || action === 'WARN';
  return !dismissing;
}

/** Decisions a person can appeal. */
export const APPEALABLE_ACTIONS: readonly ModerationActionType[] = [
  'REMOVE',
  'RESTRICT',
  'WARN',
  'RESTRICT_USER',
  'SUSPEND_USER',
];

/** Account-level decisions are appealed as the `ACCOUNT` kind, the rest as `MODERATION`. */
export const ACCOUNT_ACTIONS: readonly ModerationActionType[] = ['RESTRICT_USER', 'SUSPEND_USER'];

/** Decisions that can be undone by a later one. */
export const REVERSIBLE_ACTIONS: readonly ModerationActionType[] = [
  'RESTRICT',
  'REMOVE',
  'RESTRICT_USER',
  'SUSPEND_USER',
  'WARN',
];
