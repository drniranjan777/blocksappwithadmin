import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../admin/audit/audit.service.js';
import { Errors, type FieldIssue } from '../common/errors/app-error.js';
import { Page, clampLimit, decodeCursor } from '../common/pagination/cursor.js';
import { SystemSettingsService } from '../common/settings/system-settings.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { AdObjective, AdStatus, Prisma } from '../generated/prisma/client.js';
import { formatRupees, fromDatabase, parseRupees } from '../ledger/money.js';
import { safeWebUrl } from '../business/business-rules.js';
import { screenText } from '../social/posts/text-safety.js';
import { AudienceService } from './audience.service.js';
import {
  DEFAULTS,
  EDITABLE,
  OBJECTIVES,
  OBJECTIVE_NEEDS,
  OPEN_STATUSES,
  SETTING_KEYS,
  type Targeting,
  coarseAudience,
  normaliseTargeting,
  targetingSchema,
} from './ads-rules.js';
import { BillingProvider } from './billing-provider.js';

const BLOCKED_TERMS_SETTING = 'moderation.blocked_terms';
const cursorSchema = z.object({ t: z.string(), id: z.string() });
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface CampaignInput {
  name?: string | undefined;
  objective?: AdObjective | undefined;
  businessPageId?: string | null | undefined;
  budgetTotal?: string | undefined;
  dailyBudget?: string | null | undefined;
  startsAt?: string | undefined;
  endsAt?: string | undefined;
  targeting?: unknown;
  headline?: string | undefined;
  body?: string | null | undefined;
  destinationUrl?: string | null | undefined;
  boostPostId?: string | null | undefined;
  boostReelId?: string | null | undefined;
}

const include = {
  businessPage: { select: { id: true, slug: true, name: true, status: true } },
} satisfies Prisma.AdCampaignInclude;
export type CampaignRow = Prisma.AdCampaignGetPayload<{ include: typeof include }>;

/** The limits in force, read from settings (staff can change them without a deploy). */
export interface AdLimits {
  minBudget: string;
  maxBudget: string;
  maxCampaignDays: number;
  minAudience: number;
  maxOpenCampaigns: number;
  minLeadHours: number;
}

/**
 * Advertising campaigns, from an advertiser's side.
 *
 * What the server decides, whatever the client sends: who the advertiser is (the caller), what a
 * campaign may cost (limits from settings), where it can be aimed (a closed list of coarse
 * choices), who must look at it before it runs (staff, always), and whether it runs at all (only
 * when it has been paid for, which needs a payment provider that does not exist yet). A campaign
 * moves one way through its states by the rules in `transition`, never by the client naming a
 * status.
 */
@Injectable()
export class AdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SystemSettingsService,
    private readonly audience: AudienceService,
    private readonly audit: AuditService,
    private readonly billing: BillingProvider,
  ) {}

  // ----------------------------------------------------------------- settings --

  async limits(): Promise<AdLimits> {
    const [minBudget, maxBudget, maxCampaignDays, minAudience, maxOpenCampaigns] =
      await Promise.all([
        this.settings.get<string>(SETTING_KEYS.minBudget, DEFAULTS.minBudget),
        this.settings.get<string>(SETTING_KEYS.maxBudget, DEFAULTS.maxBudget),
        this.settings.get<number>(SETTING_KEYS.maxCampaignDays, DEFAULTS.maxCampaignDays),
        this.settings.get<number>(SETTING_KEYS.minAudience, DEFAULTS.minAudience),
        this.settings.get<number>(SETTING_KEYS.maxOpenCampaigns, DEFAULTS.maxOpenCampaigns),
      ]);
    return {
      minBudget,
      maxBudget,
      maxCampaignDays,
      minAudience,
      maxOpenCampaigns,
      minLeadHours: DEFAULTS.minLeadHours,
    };
  }

  async rules() {
    const l = await this.limits();
    return {
      objectives: OBJECTIVES.map((o) => ({ objective: o, ...OBJECTIVE_NEEDS[o] })),
      budget: { min: l.minBudget, max: l.maxBudget, currency: 'INR' },
      maxCampaignDays: l.maxCampaignDays,
      minLeadHours: l.minLeadHours,
      maxOpenCampaigns: l.maxOpenCampaigns,
      targeting: {
        countries: ['IN'],
        ageBands: ['18-24', '25-34', '35-44', '45+'],
        note: 'Places and broad age bands only. Advertisers never see who is in an audience.',
      },
      billingConfigured: this.billing.configured,
    };
  }

  // -------------------------------------------------------------------- views --

  view(c: CampaignRow, audience?: number) {
    const total = fromDatabase(c.budgetTotal);
    const spent = fromDatabase(c.spent);
    const targeting = c.targeting as Targeting;
    return {
      id: c.id,
      name: c.name,
      objective: c.objective,
      status: c.status,
      budget: {
        total: formatRupees(total),
        daily: c.dailyBudget ? formatRupees(fromDatabase(c.dailyBudget)) : null,
        spent: formatRupees(spent),
        remaining: formatRupees(total - spent),
        currency: c.currency,
      },
      schedule: { startsAt: c.startsAt.toISOString(), endsAt: c.endsAt.toISOString() },
      targeting,
      ...(audience !== undefined ? { audience: { atLeast: coarseAudience(audience) } } : {}),
      creative: { headline: c.headline, body: c.body, destinationUrl: c.destinationUrl },
      boost: c.boostPostId
        ? { postId: c.boostPostId }
        : c.boostReelId
          ? { reelId: c.boostReelId }
          : null,
      page: c.businessPage
        ? { id: c.businessPage.id, slug: c.businessPage.slug, name: c.businessPage.name }
        : null,
      // Why it was turned down, stopped or paused, written for the advertiser.
      reviewNote: ['REJECTED', 'FLAGGED', 'PAUSED', 'CANCELLED'].includes(c.status)
        ? c.reviewNote
        : null,
      pausedBy: c.status === 'PAUSED' ? c.pausedBy : null,
      billing: { status: c.billingStatus, funded: c.billingStatus === 'PAID' },
      submittedAt: c.submittedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    };
  }

  private async mustOwn(userId: string, id: string): Promise<CampaignRow> {
    const c = await this.prisma.adCampaign.findFirst({
      where: { id, advertiserId: userId },
      include,
    });
    if (!c) throw Errors.notFound('Campaign');
    return c;
  }

  async get(userId: string, id: string) {
    const c = await this.mustOwn(userId, id);
    return this.view(c, await this.audience.count(c.targeting as Targeting));
  }

  async list(
    userId: string,
    q: { status?: AdStatus | undefined; cursor?: string | undefined; limit?: number | undefined },
  ) {
    const limit = clampLimit(q.limit);
    const c = decodeCursor(q.cursor, cursorSchema);
    const rows = await this.prisma.adCampaign.findMany({
      where: {
        advertiserId: userId,
        ...(q.status ? { status: q.status } : {}),
        ...(c
          ? {
              OR: [
                { createdAt: { lt: new Date(c.t) } },
                { createdAt: new Date(c.t), id: { lt: c.id } },
              ],
            }
          : {}),
      },
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.createdAt.toISOString(), id: r.id }),
      (r) => this.view(r),
    );
  }

  // ----------------------------------------------------------------- validating --

  /**
   * Checks what is present and fills in what follows from it. Draft-level: a campaign can be saved
   * half-finished, but nothing it does contain can be wrong. `readiness` is the stricter check
   * that runs when it is sent for review.
   */
  private async clean(
    userId: string,
    merged: CampaignInput,
    limits: AdLimits,
    issues: FieldIssue[],
  ) {
    const out: {
      budgetTotal?: bigint;
      dailyBudget?: bigint | null;
      startsAt?: Date;
      endsAt?: Date;
      targeting?: Targeting;
      destinationUrl?: string | null;
    } = {};

    const money = (field: string, text: string): bigint | null => {
      try {
        const v = parseRupees(text);
        if (v <= 0n) throw new RangeError('not positive');
        return v;
      } catch {
        issues.push({ field, reasons: ['an_amount_in_rupees_like_1500.00'] });
        return null;
      }
    };
    if (merged.budgetTotal !== undefined) {
      const total = money('budgetTotal', merged.budgetTotal);
      if (total !== null) {
        out.budgetTotal = total;
        if (total < parseRupees(limits.minBudget))
          issues.push({ field: 'budgetTotal', reasons: ['below_the_minimum'] });
        if (total > parseRupees(limits.maxBudget))
          issues.push({ field: 'budgetTotal', reasons: ['above_the_maximum'] });
      }
    }
    if (merged.dailyBudget !== undefined) {
      if (merged.dailyBudget === null) out.dailyBudget = null;
      else {
        const daily = money('dailyBudget', merged.dailyBudget);
        if (daily !== null) {
          out.dailyBudget = daily;
          if (out.budgetTotal !== undefined && daily > out.budgetTotal)
            issues.push({ field: 'dailyBudget', reasons: ['more_than_the_total_budget'] });
        }
      }
    }
    for (const f of ['startsAt', 'endsAt'] as const) {
      const text = merged[f];
      if (text === undefined) continue;
      const d = new Date(text);
      if (Number.isNaN(d.getTime())) issues.push({ field: f, reasons: ['invalid'] });
      else out[f] = d;
    }
    if (out.startsAt && out.endsAt) {
      if (out.endsAt <= out.startsAt)
        issues.push({ field: 'endsAt', reasons: ['must_be_after_start'] });
      else if (out.endsAt.getTime() - out.startsAt.getTime() > limits.maxCampaignDays * DAY)
        issues.push({ field: 'endsAt', reasons: [`longer_than_${limits.maxCampaignDays}_days`] });
    }
    if (merged.targeting !== undefined) {
      const parsed = targetingSchema.safeParse(merged.targeting);
      if (!parsed.success) {
        for (const i of parsed.error.issues) {
          issues.push({
            field: ['targeting', ...i.path.map(String)].join('.'),
            reasons: [
              i.code === 'unrecognized_keys' ? 'not_something_you_can_target_on' : 'invalid',
            ],
          });
        }
      } else out.targeting = normaliseTargeting(parsed.data);
    }
    if (merged.destinationUrl !== undefined) {
      if (merged.destinationUrl === null || merged.destinationUrl.trim() === '')
        out.destinationUrl = null;
      else {
        const safe = safeWebUrl(merged.destinationUrl);
        if (!safe || safe.length > 300)
          issues.push({ field: 'destinationUrl', reasons: ['must_be_a_public_https_address'] });
        else out.destinationUrl = safe;
      }
    }
    if (merged.boostPostId && merged.boostReelId)
      issues.push({ field: 'boostPostId', reasons: ['boost_one_thing'] });
    return out;
  }

  /** The page and the boosted content must be the advertiser's own, and fit to show. */
  private async checkOwnership(userId: string, merged: CampaignInput, issues: FieldIssue[]) {
    if (merged.businessPageId) {
      const page = await this.prisma.businessPage.findFirst({
        where: { id: merged.businessPageId, ownerId: userId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!page) issues.push({ field: 'businessPageId', reasons: ['not_available'] });
    }
    if (merged.boostPostId) {
      const post = await this.prisma.post.findFirst({
        where: {
          id: merged.boostPostId,
          authorId: userId,
          deletedAt: null,
          moderationStatus: 'APPROVED',
          visibility: 'PUBLIC',
        },
        select: { id: true },
      });
      if (!post) issues.push({ field: 'boostPostId', reasons: ['not_available'] });
    }
    if (merged.boostReelId) {
      const reel = await this.prisma.reel.findFirst({
        where: {
          id: merged.boostReelId,
          authorId: userId,
          deletedAt: null,
          moderationStatus: 'APPROVED',
          publishStatus: 'PUBLISHED',
          visibility: 'PUBLIC',
        },
        select: { id: true },
      });
      if (!reel) issues.push({ field: 'boostReelId', reasons: ['not_available'] });
    }
  }

  private async eligible(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { status: true, emailVerifiedAt: true, phoneVerifiedAt: true },
    });
    if (u.status !== 'ACTIVE') throw Errors.forbidden('This account cannot advertise right now.');
    if (!u.emailVerifiedAt && !u.phoneVerifiedAt)
      throw Errors.precondition('Verify your e-mail or phone number before advertising.');
  }

  // ------------------------------------------------------------------ changing --

  async create(
    userId: string,
    input: CampaignInput &
      Required<
        Pick<
          CampaignInput,
          'name' | 'objective' | 'budgetTotal' | 'startsAt' | 'endsAt' | 'headline'
        >
      >,
  ) {
    await this.eligible(userId);
    const limits = await this.limits();
    const open = await this.prisma.adCampaign.count({
      where: { advertiserId: userId, status: { in: OPEN_STATUSES.slice() } },
    });
    if (open >= limits.maxOpenCampaigns)
      throw Errors.conflict(
        `You can have up to ${limits.maxOpenCampaigns} campaigns open at a time.`,
      );

    const issues: FieldIssue[] = [];
    const clean = await this.clean(userId, input, limits, issues);
    await this.checkOwnership(userId, input, issues);
    if (issues.length) throw Errors.validation(issues);

    const created = await this.prisma.adCampaign.create({
      data: {
        advertiserId: userId,
        businessPageId: input.businessPageId ?? null,
        name: input.name.trim(),
        objective: input.objective,
        budgetTotal: formatRupees(clean.budgetTotal as bigint),
        dailyBudget: clean.dailyBudget ? formatRupees(clean.dailyBudget) : null,
        startsAt: clean.startsAt as Date,
        endsAt: clean.endsAt as Date,
        targeting: (clean.targeting ??
          normaliseTargeting(targetingSchema.parse({}))) as Prisma.InputJsonValue,
        headline: input.headline.trim(),
        body: input.body?.trim() || null,
        destinationUrl: clean.destinationUrl ?? null,
        boostPostId: input.boostPostId ?? null,
        boostReelId: input.boostReelId ?? null,
      },
      include,
    });
    return this.view(created, await this.audience.count(created.targeting as Targeting));
  }

  async update(userId: string, id: string, input: CampaignInput) {
    const c = await this.mustOwn(userId, id);
    if (!EDITABLE.includes(c.status))
      throw Errors.conflict('Only a draft, or a campaign that was turned down, can be changed.');
    const limits = await this.limits();
    const issues: FieldIssue[] = [];
    // Check the change together with what is already there, so a new end date is judged against the old start.
    const merged: CampaignInput = {
      ...input,
      ...(input.startsAt === undefined && input.endsAt !== undefined
        ? { startsAt: c.startsAt.toISOString() }
        : {}),
      ...(input.endsAt === undefined && input.startsAt !== undefined
        ? { endsAt: c.endsAt.toISOString() }
        : {}),
      ...(input.budgetTotal === undefined && input.dailyBudget
        ? { budgetTotal: formatRupees(fromDatabase(c.budgetTotal)) }
        : {}),
    };
    const clean = await this.clean(userId, merged, limits, issues);
    // A smaller total cannot drop below the daily limit that is already set.
    if (
      clean.budgetTotal !== undefined &&
      input.dailyBudget === undefined &&
      c.dailyBudget &&
      clean.budgetTotal < fromDatabase(c.dailyBudget)
    )
      issues.push({ field: 'budgetTotal', reasons: ['less_than_the_daily_budget'] });
    await this.checkOwnership(
      userId,
      {
        businessPageId: input.businessPageId,
        boostPostId: input.boostPostId,
        boostReelId: input.boostReelId,
      },
      issues,
    );
    if (issues.length) throw Errors.validation(issues);

    // A boost target can be swapped, not doubled.
    const boost: Prisma.AdCampaignUncheckedUpdateInput = {};
    if (input.boostPostId !== undefined) {
      boost.boostPostId = input.boostPostId;
      if (input.boostPostId) boost.boostReelId = null;
    }
    if (input.boostReelId !== undefined) {
      boost.boostReelId = input.boostReelId;
      if (input.boostReelId) boost.boostPostId = null;
    }
    const updated = await this.prisma.adCampaign.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.objective !== undefined ? { objective: input.objective } : {}),
        ...(input.businessPageId !== undefined ? { businessPageId: input.businessPageId } : {}),
        ...(clean.budgetTotal !== undefined
          ? { budgetTotal: formatRupees(clean.budgetTotal) }
          : {}),
        ...(clean.dailyBudget !== undefined
          ? { dailyBudget: clean.dailyBudget ? formatRupees(clean.dailyBudget) : null }
          : {}),
        ...(clean.startsAt ? { startsAt: clean.startsAt } : {}),
        ...(clean.endsAt ? { endsAt: clean.endsAt } : {}),
        ...(clean.targeting ? { targeting: clean.targeting as Prisma.InputJsonValue } : {}),
        ...(input.headline !== undefined ? { headline: input.headline.trim() } : {}),
        ...(input.body !== undefined ? { body: input.body?.trim() || null } : {}),
        ...(clean.destinationUrl !== undefined ? { destinationUrl: clean.destinationUrl } : {}),
        ...boost,
      },
      include,
    });
    return this.view(updated, await this.audience.count(updated.targeting as Targeting));
  }

  /** Everything the campaign needs before a person can be asked to look at it. */
  private async readiness(c: CampaignRow, limits: AdLimits, now: Date) {
    const issues: FieldIssue[] = [];
    const needs = OBJECTIVE_NEEDS[c.objective];
    const targeting = c.targeting as Targeting;
    if (needs.destination && !c.destinationUrl)
      issues.push({ field: 'destinationUrl', reasons: ['required_for_this_objective'] });
    if (needs.boost && !c.boostPostId && !c.boostReelId)
      issues.push({ field: 'boostPostId', reasons: ['choose_what_to_boost'] });
    if (needs.district && targeting.districts.length === 0)
      issues.push({ field: 'targeting.districts', reasons: ['choose_at_least_one_district'] });
    if (c.startsAt.getTime() < now.getTime() + limits.minLeadHours * HOUR)
      issues.push({
        field: 'startsAt',
        reasons: [`at_least_${limits.minLeadHours}_hour_from_now`],
      });
    if (c.endsAt <= now) issues.push({ field: 'endsAt', reasons: ['must_be_in_the_future'] });

    const blocked = await this.settings.get<string[]>(BLOCKED_TERMS_SETTING, []);
    const flags: Record<string, unknown> = {};
    for (const [field, text] of [
      ['headline', c.headline],
      ['body', c.body],
    ] as const) {
      if (text && !screenText(text, blocked).clean)
        issues.push({ field, reasons: ['not_allowed'] });
    }
    if (c.destinationUrl) {
      const host = new URL(c.destinationUrl).hostname;
      flags['destinationHost'] = host;
      if (SHORTENERS.has(host)) flags['linkShortener'] = true;
    }
    const size = await this.audience.count(targeting, now);
    if (size < limits.minAudience) {
      // Said without the number: a small figure would itself tell the advertiser who is in it.
      issues.push({ field: 'targeting', reasons: ['audience_too_small'] });
    }
    return { issues, flags, size };
  }

  async submit(userId: string, id: string) {
    await this.eligible(userId);
    const limits = await this.limits();
    const now = new Date();
    const c = await this.mustOwn(userId, id);
    if (!EDITABLE.includes(c.status)) throw Errors.conflict('This campaign has already been sent.');
    const { issues, flags, size } = await this.readiness(c, limits, now);
    if (issues.length) throw Errors.validation(issues);

    const account = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { createdAt: true },
    });
    if (now.getTime() - account.createdAt.getTime() < 7 * DAY) flags['newAccount'] = true;

    const res = await this.prisma.adCampaign.updateMany({
      where: { id, advertiserId: userId, status: { in: EDITABLE.slice() } },
      data: {
        status: 'IN_REVIEW',
        submittedAt: now,
        reviewedAt: null,
        reviewedById: null,
        reviewNote: null,
        pausedBy: null,
        policyFlags: { ...flags, audienceAtLeast: coarseAudience(size) } as Prisma.InputJsonValue,
      },
    });
    if (res.count !== 1) throw Errors.conflict('This campaign was changed just now. Reload it.');
    await this.audit.record({
      actorType: 'USER',
      actorId: userId,
      action: 'ads.submit',
      targetType: 'ad_campaign',
      targetId: id,
      after: { budget: formatRupees(fromDatabase(c.budgetTotal)) },
    });
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const c = await this.mustOwn(userId, id);
    if (!EDITABLE.includes(c.status))
      throw Errors.conflict('Only a draft can be deleted. Cancel a campaign that was sent.');
    await this.prisma.adCampaign.deleteMany({
      where: { id, advertiserId: userId, status: { in: EDITABLE.slice() } },
    });
  }

  async pause(userId: string, id: string) {
    const res = await this.prisma.adCampaign.updateMany({
      where: { id, advertiserId: userId, status: 'ACTIVE' },
      data: { status: 'PAUSED', pausedBy: 'OWNER' },
    });
    if (res.count !== 1) {
      await this.mustOwn(userId, id);
      throw Errors.conflict('Only a running campaign can be paused.');
    }
    return this.get(userId, id);
  }

  async resume(userId: string, id: string) {
    const now = new Date();
    const c = await this.mustOwn(userId, id);
    if (c.status !== 'PAUSED') throw Errors.conflict('Only a paused campaign can be resumed.');
    if (c.pausedBy === 'STAFF')
      throw Errors.forbidden('Staff paused this campaign. Contact support.');
    if (c.businessPage && c.businessPage.status !== 'ACTIVE')
      throw Errors.conflict('Its page is not published.');
    if (c.endsAt <= now) throw Errors.conflict('Its schedule has ended.');
    if (c.billingStatus !== 'PAID') throw Errors.conflict('It has not been paid for.');
    const running = c.startsAt <= now;
    const res = await this.prisma.adCampaign.updateMany({
      where: { id, advertiserId: userId, status: 'PAUSED', pausedBy: { not: 'STAFF' } },
      data: { status: running ? 'ACTIVE' : 'APPROVED', pausedBy: null, reviewNote: null },
    });
    if (res.count !== 1) throw Errors.conflict('This campaign was changed just now. Reload it.');
    return this.get(userId, id);
  }

  /** Stops a campaign for good. Anything paid and not spent is refunded. */
  async cancel(userId: string, id: string) {
    const stoppable: AdStatus[] = ['IN_REVIEW', 'APPROVED', 'ACTIVE', 'PAUSED', 'FLAGGED'];
    let refund: { amount: bigint; reference: string } | null = null;
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM ad_campaigns WHERE id = ${id}::uuid AND advertiser_id = ${userId}::uuid FOR UPDATE`;
      const c = await tx.adCampaign.findFirst({ where: { id, advertiserId: userId } });
      if (!c) throw Errors.notFound('Campaign');
      if (!stoppable.includes(c.status))
        throw Errors.conflict('This campaign cannot be cancelled now.');
      const unspent = fromDatabase(c.budgetTotal) - fromDatabase(c.spent);
      await tx.adCampaign.update({
        where: { id },
        data: { status: 'CANCELLED', pausedBy: null, reviewNote: 'Cancelled by the advertiser.' },
      });
      if (c.billingStatus === 'PAID' && unspent > 0n && c.billingReference) {
        refund = { amount: unspent, reference: c.billingReference };
      }
      await this.audit.record(
        {
          actorType: 'USER',
          actorId: userId,
          action: 'ads.cancel',
          targetType: 'ad_campaign',
          targetId: id,
          before: { status: c.status },
          after: { status: 'CANCELLED', unspent: formatRupees(unspent) },
        },
        tx,
      );
    });
    const due = refund as { amount: bigint; reference: string } | null;
    if (due) await this.refund(userId, id, due.amount, due.reference);
    return this.get(userId, id);
  }

  private async refund(
    userId: string,
    id: string,
    amount: bigint,
    reference: string,
  ): Promise<void> {
    try {
      const done = await this.billing.refund({
        campaignId: id,
        advertiserId: userId,
        amount: formatRupees(amount),
        reference,
      });
      await this.prisma.adCampaign.update({ where: { id }, data: { billingStatus: 'REFUNDED' } });
      await this.audit.record({
        actorType: 'SYSTEM',
        action: 'ads.refund',
        targetType: 'ad_campaign',
        targetId: id,
        after: { amount: formatRupees(amount), reference: done.reference },
      });
    } catch (e) {
      // The campaign is cancelled; the money is not back yet. It stays PAID so it shows up for a person to settle.
      await this.audit.record({
        actorType: 'SYSTEM',
        action: 'ads.refund_failed',
        targetType: 'ad_campaign',
        targetId: id,
        after: { amount: formatRupees(amount), error: (e as Error).message.slice(0, 200) },
      });
    }
  }

  // -------------------------------------------------------------------- paying --

  /** Pays for an approved campaign. Refused outright while no payment provider is configured. */
  async fund(userId: string, id: string) {
    if (!this.billing.configured)
      throw Errors.unavailable('Paying for advertising is not available yet.');
    const c = await this.mustOwn(userId, id);
    if (c.status !== 'APPROVED')
      throw Errors.conflict('Only an approved campaign can be paid for.');
    if (c.billingStatus === 'PAID') throw Errors.conflict('This campaign is already paid for.');
    if (c.endsAt <= new Date()) throw Errors.conflict('Its schedule has ended.');

    // Claim the payment: two taps cannot both start one.
    const claim = await this.prisma.adCampaign.updateMany({
      where: {
        id,
        advertiserId: userId,
        status: 'APPROVED',
        billingStatus: { in: ['NOT_CONFIGURED', 'FAILED'] },
      },
      data: { billingStatus: 'PENDING' },
    });
    if (claim.count !== 1)
      throw Errors.conflict('A payment for this campaign is already in progress.');

    const amount = formatRupees(fromDatabase(c.budgetTotal));
    let result;
    try {
      result = await this.billing.charge({ campaignId: id, advertiserId: userId, amount });
    } catch (e) {
      await this.prisma.adCampaign.update({ where: { id }, data: { billingStatus: 'FAILED' } });
      throw e;
    }
    await this.prisma.adCampaign.update({
      where: { id },
      data:
        result.status === 'PAID'
          ? {
              billingStatus: 'PAID',
              billingReference: result.reference.slice(0, 80),
              fundedAt: new Date(),
            }
          : { billingStatus: 'FAILED' },
    });
    await this.audit.record({
      actorType: 'USER',
      actorId: userId,
      action: result.status === 'PAID' ? 'ads.funded' : 'ads.payment_failed',
      targetType: 'ad_campaign',
      targetId: id,
      after: { amount, reference: result.reference },
    });
    if (result.status !== 'PAID') throw Errors.conflict('The payment did not go through.');
    return this.get(userId, id);
  }

  // ------------------------------------------------------------------ reporting --

  async report(userId: string, id: string) {
    const c = await this.mustOwn(userId, id);
    const stats = await this.prisma.adDailyStat.findMany({
      where: { campaignId: id },
      orderBy: { day: 'asc' },
      take: 400,
    });
    let impressions = 0;
    let clicks = 0;
    let spend = 0n;
    for (const s of stats) {
      impressions += s.impressions;
      clicks += s.clicks;
      spend += fromDatabase(s.spend);
    }
    const total = fromDatabase(c.budgetTotal);
    return {
      campaign: { id: c.id, name: c.name, status: c.status },
      totals: {
        impressions,
        clicks,
        // A rate to two decimal places, as text, so it never reads as a float: "1.25" means 1.25%.
        clickRate: impressions > 0 ? ((clicks * 10000) / impressions / 100).toFixed(2) : null,
        spend: formatRupees(spend),
        costPerClick: clicks > 0 ? formatRupees(spend / BigInt(clicks)) : null,
        budget: formatRupees(total),
        remaining: formatRupees(total - fromDatabase(c.spent)),
      },
      daily: stats.map((s) => ({
        day: s.day.toISOString().slice(0, 10),
        impressions: s.impressions,
        clicks: s.clicks,
        spend: formatRupees(fromDatabase(s.spend)),
      })),
      note: 'BLOCKS has no ad delivery service yet, so these numbers stay at zero until one is connected.',
    };
  }
}

/** Link shorteners hide where an advertisement leads; reviewers are told when one is used. */
const SHORTENERS: ReadonlySet<string> = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'is.gd',
  'ow.ly',
  'rb.gy',
  'cutt.ly',
  'shorturl.at',
]);
