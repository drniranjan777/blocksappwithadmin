import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Errors } from '../../common/errors/app-error.js';
import type { AdminAuthContext } from '../../common/http/request.js';
import { SystemSettingsService } from '../../common/settings/system-settings.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { parseRupees } from '../../ledger/money.js';
import { SETTING_DEFAULTS } from '../../payments/payment-settings.js';
import { AuditService } from '../audit/audit.service.js';

interface Meta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

const money = z.string().refine((v) => {
  try {
    return parseRupees(v) >= 0n;
  } catch {
    return false;
  }
}, 'an amount in rupees, like "1500.00"');

interface Definition {
  label: string;
  description: string;
  group:
    'Moderation' | 'Stories' | 'Payouts' | 'Identity' | 'Earnings' | 'Business' | 'Advertising';
  schema: z.ZodType<unknown>;
  default: unknown;
}

/**
 * The settings staff may change without a deploy, and the rule for each.
 *
 * It is a closed list: a key that is not here cannot be written, whatever the caller sends, and a
 * value must pass its own schema. Money limits are also checked against each other (the minimum
 * payout cannot exceed the maximum, a daily limit cannot be below one payout, and so on), so no
 * single change can leave the rules contradicting themselves. Each change needs a reason and is
 * audited with the old and new value.
 */
export const SETTING_DEFINITIONS: Record<string, Definition> = {
  'moderation.blocked_terms': {
    label: 'Blocked terms',
    description:
      'Posts, reels and comments containing these words are held for a person to review before they are public.',
    group: 'Moderation',
    schema: z.array(z.string().trim().min(2).max(60)).max(500),
    default: [],
  },
  'moderation.reports_per_day': {
    label: 'Reports one person can make per day',
    description:
      'More than this in 24 hours is refused, so reporting cannot be used to flood the queue.',
    group: 'Moderation',
    schema: z.number().int().min(1).max(500),
    default: 30,
  },
  'moderation.appeal_window_days': {
    label: 'Days to appeal a decision',
    description: 'After this, a decision can no longer be appealed.',
    group: 'Moderation',
    schema: z.number().int().min(1).max(365),
    default: 30,
  },
  'moderation.appeal_sla_hours': {
    label: 'Hours to answer an appeal',
    description: 'Appeals still waiting after this show as overdue.',
    group: 'Moderation',
    schema: z.number().int().min(1).max(720),
    default: 72,
  },
  'stories.ttl_hours': {
    label: 'Story lifetime (hours)',
    description: 'How long a story stays up.',
    group: 'Stories',
    schema: z.number().int().min(1).max(72),
    default: 24,
  },
  'payouts.min_amount': {
    label: 'Smallest payout (₹)',
    description: 'The least a creator can withdraw at once.',
    group: 'Payouts',
    schema: money,
    default: SETTING_DEFAULTS['payouts.min_amount'],
  },
  'payouts.max_amount': {
    label: 'Largest single payout (₹)',
    description: 'The most one payout request can be for.',
    group: 'Payouts',
    schema: money,
    default: SETTING_DEFAULTS['payouts.max_amount'],
  },
  'payouts.daily_limit': {
    label: 'Daily payout limit (₹)',
    description: 'The most one creator can request in 24 hours.',
    group: 'Payouts',
    schema: money,
    default: SETTING_DEFAULTS['payouts.daily_limit'],
  },
  'payouts.step_up_amount': {
    label: 'Fresh confirmation from (₹)',
    description: 'Payouts at or above this need the creator to confirm it is really them.',
    group: 'Payouts',
    schema: money,
    default: SETTING_DEFAULTS['payouts.step_up_amount'],
  },
  'payouts.review_amount': {
    label: 'Reviewed by a person from (₹)',
    description: 'Payouts at or above this wait for a person to approve.',
    group: 'Payouts',
    schema: money,
    default: SETTING_DEFAULTS['payouts.review_amount'],
  },
  'payouts.dual_approval_amount': {
    label: 'Two approvers from (₹)',
    description: 'Payouts at or above this need two different people to approve.',
    group: 'Payouts',
    schema: money,
    default: SETTING_DEFAULTS['payouts.dual_approval_amount'],
  },
  'payouts.new_account_hold_hours': {
    label: 'Pause after a bank change (hours)',
    description: 'How long payouts are paused after a bank account is added, changed or removed.',
    group: 'Payouts',
    schema: z.number().int().min(0).max(720),
    default: SETTING_DEFAULTS['payouts.new_account_hold_hours'],
  },
  'payouts.max_accounts': {
    label: 'Bank accounts per person',
    description: 'How many payout bank accounts one person can keep.',
    group: 'Payouts',
    schema: z.number().int().min(1).max(10),
    default: SETTING_DEFAULTS['payouts.max_accounts'],
  },
  'kyc.valid_days': {
    label: 'Identity verification lasts (days)',
    description: 'After this, a person must verify again.',
    group: 'Identity',
    schema: z.number().int().min(30).max(3650),
    default: SETTING_DEFAULTS['kyc.valid_days'],
  },
  'kyc.document_retention_days': {
    label: 'Identity documents kept (days)',
    description:
      'Scans and stored numbers are deleted this long after submission. Set by the business and its counsel.',
    group: 'Identity',
    schema: z.number().int().min(30).max(3650),
    default: SETTING_DEFAULTS['kyc.document_retention_days'],
  },
  'business.max_pages_per_user': {
    label: 'Business pages per person',
    description: 'How many business pages one person can have.',
    group: 'Business',
    schema: z.number().int().min(1).max(20),
    default: 3,
  },
  'ads.min_budget': {
    label: 'Smallest campaign budget (₹)',
    description: 'The least an advertiser can set as a campaign’s total budget.',
    group: 'Advertising',
    schema: money,
    default: '500.00',
  },
  'ads.max_budget': {
    label: 'Largest campaign budget (₹)',
    description: 'The most an advertiser can set as a campaign’s total budget.',
    group: 'Advertising',
    schema: money,
    default: '1000000.00',
  },
  'ads.max_campaign_days': {
    label: 'Longest a campaign can run (days)',
    description: 'From its start to its end.',
    group: 'Advertising',
    schema: z.number().int().min(1).max(365),
    default: 90,
  },
  'ads.min_audience': {
    label: 'Smallest audience a campaign can aim at',
    description:
      'A campaign aimed at fewer people than this is refused, so targeting cannot be used to single anybody out.',
    group: 'Advertising',
    schema: z.number().int().min(10).max(1_000_000),
    default: 100,
  },
  'ads.max_open_campaigns': {
    label: 'Campaigns one person can have open',
    description: 'Drafts, campaigns in review, approved, running, paused or flagged ones.',
    group: 'Advertising',
    schema: z.number().int().min(1).max(100),
    default: 10,
  },
  'earnings.max_adjustment': {
    label: 'Largest manual adjustment (₹)',
    description: 'The most one correction to a creator’s balance can move.',
    group: 'Earnings',
    schema: money,
    default: '10000.00',
  },
};

/** The payout limits that must stay consistent with one another. */
function consistent(values: Record<string, unknown>): string | null {
  const v = (k: string) => parseRupees(String(values[k]));
  if (v('payouts.min_amount') > v('payouts.max_amount'))
    return 'The smallest payout cannot be more than the largest.';
  if (v('payouts.max_amount') > v('payouts.daily_limit'))
    return 'The daily limit cannot be below the largest single payout.';
  if (v('payouts.dual_approval_amount') > v('payouts.max_amount'))
    return 'Two approvers must apply at or below the largest single payout, or never would.';
  if (v('payouts.review_amount') > v('payouts.dual_approval_amount'))
    return 'A person must review before two people do: review must start at or below the two-approver amount.';
  return null;
}

@Injectable()
export class SettingsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SystemSettingsService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { in: Object.keys(SETTING_DEFINITIONS) } },
    });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return Object.entries(SETTING_DEFINITIONS).map(([key, d]) => {
      const row = byKey.get(key);
      return {
        key,
        label: d.label,
        description: d.description,
        group: d.group,
        value: row?.value ?? d.default,
        default: d.default,
        isDefault: !row,
        version: row?.version ?? 0,
        updatedAt: row?.updatedAt.toISOString() ?? null,
      };
    });
  }

  async set(actor: AdminAuthContext, key: string, rawValue: unknown, reason: string, meta: Meta) {
    const def = SETTING_DEFINITIONS[key];
    if (!def) throw Errors.notFound('Setting');
    const parsed = def.schema.safeParse(rawValue);
    if (!parsed.success) {
      throw Errors.validation([
        { field: 'value', reasons: [parsed.error.issues[0]?.message ?? 'invalid'] },
      ]);
    }
    if (key.startsWith('payouts.') && !key.endsWith('hours') && !key.endsWith('accounts')) {
      const all = Object.fromEntries(
        (await this.list())
          .filter((s) => s.key.startsWith('payouts.'))
          .map((s) => [s.key, s.value]),
      );
      const problem = consistent({ ...all, [key]: parsed.data });
      if (problem) throw Errors.validation([{ field: 'value', reasons: [problem] }]);
    }
    if (key === 'ads.min_budget' || key === 'ads.max_budget') {
      const other = key === 'ads.min_budget' ? 'ads.max_budget' : 'ads.min_budget';
      const row = await this.prisma.systemSetting.findUnique({ where: { key: other } });
      const otherValue = String(row?.value ?? SETTING_DEFINITIONS[other]?.default);
      const [lo, hi] =
        key === 'ads.min_budget'
          ? [String(parsed.data), otherValue]
          : [otherValue, String(parsed.data)];
      if (parseRupees(lo) > parseRupees(hi))
        throw Errors.validation([
          { field: 'value', reasons: ['The smallest budget cannot be more than the largest.'] },
        ]);
    }
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.systemSetting.findUnique({ where: { key } });
      await tx.systemSetting.upsert({
        where: { key },
        create: { key, value: parsed.data as Prisma.InputJsonValue, updatedById: actor.adminId },
        update: {
          value: parsed.data as Prisma.InputJsonValue,
          version: { increment: 1 },
          updatedById: actor.adminId,
        },
      });
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'settings.changed',
          targetType: 'setting',
          targetId: key,
          reason,
          before: { value: before?.value ?? def.default },
          after: { value: parsed.data },
          ...meta,
        },
        tx,
      );
    });
    this.settings.invalidate(key);
    return (await this.list()).find((s) => s.key === key);
  }
}
