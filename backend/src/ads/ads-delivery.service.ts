import { Injectable } from '@nestjs/common';
import { AuditService } from '../admin/audit/audit.service.js';
import { Errors } from '../common/errors/app-error.js';
import { PrismaService } from '../database/prisma.service.js';
import { formatRupees, fromDatabase, parseRupees } from '../ledger/money.js';

export interface DeliveryReport {
  impressions: number;
  clicks: number;
  /** Rupees spent on these impressions and clicks, "12.50". */
  spend: string;
}

export interface DeliveryResult {
  /** What was recorded. */
  accepted: DeliveryReport;
  /** True when part of the spend was refused because a limit was reached. */
  capped: boolean;
  /** True when this report used up the campaign's budget. */
  exhausted: boolean;
}

/**
 * What happens to a campaign once it exists: it goes live when it is approved, paid for and its
 * time has come, it ends when its time or its money runs out, and it stops when something it
 * depends on stops (its page, its advertiser, the post it promotes).
 *
 * `record` is for the ad-serving service that does not exist yet. It is how delivery would be
 * written down, with every limit enforced here and not trusted to the caller: nothing is recorded
 * for a campaign that is not running, spend never goes past the budget or the daily limit, and
 * the figures are changed under a row lock so two reports at once cannot both spend the same
 * rupee. There is no HTTP route to it, on purpose.
 */
@Injectable()
export class AdsDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Moves campaigns through their lifecycle. Safe to run often and on every instance. */
  async tick(now = new Date()): Promise<number> {
    let changed = 0;

    // Things a running campaign depends on have stopped: pause it (the owner can resume when they are back).
    const dependsOnSomethingDown = await this.prisma.adCampaign.updateMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { advertiser: { status: { not: 'ACTIVE' } } },
          { businessPage: { is: { status: { not: 'ACTIVE' } } } },
          {
            boostPost: {
              is: { OR: [{ moderationStatus: { not: 'APPROVED' } }, { deletedAt: { not: null } }] },
            },
          },
          {
            boostReel: {
              is: { OR: [{ moderationStatus: { not: 'APPROVED' } }, { deletedAt: { not: null } }] },
            },
          },
        ],
      },
      data: {
        status: 'PAUSED',
        pausedBy: 'SYSTEM',
        reviewNote:
          'Paused because its page, its account or the post it promotes is no longer available.',
      },
    });
    changed += dependsOnSomethingDown.count;

    // Out of time.
    const finished = await this.prisma.adCampaign.updateMany({
      where: { status: { in: ['ACTIVE', 'PAUSED'] }, endsAt: { lte: now } },
      data: { status: 'COMPLETED', pausedBy: null },
    });
    changed += finished.count;

    // Never got to run: its time passed before it was approved or paid for.
    const lapsed = await this.prisma.adCampaign.updateMany({
      where: { status: { in: ['IN_REVIEW', 'APPROVED', 'FLAGGED'] }, endsAt: { lte: now } },
      data: { status: 'CANCELLED', reviewNote: 'Its schedule passed before it could run.' },
    });
    changed += lapsed.count;

    // Ready and due: approved, paid for, in its window, and everything it depends on is fine.
    const started = await this.prisma.adCampaign.updateMany({
      where: {
        status: 'APPROVED',
        billingStatus: 'PAID',
        startsAt: { lte: now },
        endsAt: { gt: now },
        advertiser: { status: 'ACTIVE' },
        AND: [
          { OR: [{ businessPageId: null }, { businessPage: { is: { status: 'ACTIVE' } } }] },
          {
            OR: [
              { boostPostId: null },
              { boostPost: { is: { moderationStatus: 'APPROVED', deletedAt: null } } },
            ],
          },
          {
            OR: [
              { boostReelId: null },
              { boostReel: { is: { moderationStatus: 'APPROVED', deletedAt: null } } },
            ],
          },
        ],
      },
      data: { status: 'ACTIVE' },
    });
    changed += started.count;
    return changed;
  }

  /**
   * Writes down delivery for a running campaign: impressions, clicks and what they cost. Returns
   * what was accepted, which can be less than what was reported if a limit was reached.
   */
  async record(
    campaignId: string,
    report: DeliveryReport,
    now = new Date(),
  ): Promise<DeliveryResult> {
    if (
      !Number.isInteger(report.impressions) ||
      report.impressions < 0 ||
      !Number.isInteger(report.clicks) ||
      report.clicks < 0
    )
      throw Errors.validation([
        { field: 'impressions', reasons: ['whole_numbers_of_zero_or_more'] },
      ]);
    if (report.clicks > report.impressions)
      throw Errors.validation([{ field: 'clicks', reasons: ['more_than_impressions'] }]);
    let spend: bigint;
    try {
      spend = parseRupees(report.spend);
      if (spend < 0n) throw new RangeError('negative');
    } catch {
      throw Errors.validation([{ field: 'spend', reasons: ['an_amount_in_rupees'] }]);
    }

    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM ad_campaigns WHERE id = ${campaignId}::uuid FOR UPDATE`;
      const c = await tx.adCampaign.findUnique({ where: { id: campaignId } });
      if (!c) throw Errors.notFound('Campaign');
      if (c.status !== 'ACTIVE' || c.billingStatus !== 'PAID')
        throw Errors.conflict('Nothing is recorded for a campaign that is not running.');
      if (c.startsAt > now || c.endsAt <= now) throw Errors.conflict('Outside its schedule.');

      const total = fromDatabase(c.budgetTotal);
      const spentBefore = fromDatabase(c.spent);
      const todays = await tx.adDailyStat.findUnique({
        where: { campaignId_day: { campaignId, day } },
        select: { spend: true },
      });
      const spentToday = fromDatabase(todays?.spend);
      const left = total - spentBefore;
      const leftToday = c.dailyBudget ? fromDatabase(c.dailyBudget) - spentToday : left;
      const room = left < leftToday ? left : leftToday;
      const accepted = spend < room ? spend : room > 0n ? room : 0n;
      const capped = accepted < spend;
      // When the money is capped, so is what it bought: nothing is counted beyond what was paid for.
      // Whole-number arithmetic, so the proportion is exact and never drifts with rounding.
      const share = (n: number) => (capped ? Number((BigInt(n) * accepted) / spend) : n);
      const impressions = share(report.impressions);
      const clicks = Math.min(share(report.clicks), impressions);

      await tx.adDailyStat.upsert({
        where: { campaignId_day: { campaignId, day } },
        create: { campaignId, day, impressions, clicks, spend: formatRupees(accepted) },
        update: {
          impressions: { increment: impressions },
          clicks: { increment: clicks },
          spend: formatRupees(spentToday + accepted),
        },
      });
      const spentAfter = spentBefore + accepted;
      const exhausted = spentAfter >= total;
      await tx.adCampaign.update({
        where: { id: campaignId },
        data: {
          spent: formatRupees(spentAfter),
          ...(exhausted ? { status: 'COMPLETED' as const } : {}),
        },
      });
      if (exhausted) {
        await this.audit.record(
          {
            actorType: 'SYSTEM',
            action: 'ads.budget_used_up',
            targetType: 'ad_campaign',
            targetId: campaignId,
            after: { spent: formatRupees(spentAfter) },
          },
          tx,
        );
      }
      return {
        accepted: { impressions, clicks, spend: formatRupees(accepted) },
        capped,
        exhausted,
      };
    });
  }
}
