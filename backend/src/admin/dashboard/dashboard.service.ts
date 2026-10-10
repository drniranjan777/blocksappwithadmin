import { Injectable } from '@nestjs/common';
import type { AdminAuthContext } from '../../common/http/request.js';
import { PrismaService } from '../../database/prisma.service.js';
import { formatRupees, fromDatabase } from '../../ledger/money.js';

const DAY = 86_400_000;

/**
 * The numbers on the console's front page.
 *
 * Everything is counted from the real tables when asked (cheap indexed counts; nothing is
 * cached or made up), and **each section is included only if the signed-in person's role may read
 * it**: money for those who can read the ledger, the identity queue for those who can read
 * identity cases, and so on. The page cannot show what the API did not send.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(actor: AdminAuthContext) {
    const can = (p: string) => actor.permissions.has(p);
    const now = new Date();
    const week = new Date(now.getTime() - 7 * DAY);
    const out: Record<string, unknown> = { generatedAt: now.toISOString() };

    if (can('users.read') || can('analytics.read')) {
      const [total, active, suspended, restricted, newWeek, signups] = await Promise.all([
        this.prisma.user.count({ where: { deletedAt: null } }),
        this.prisma.user.count({ where: { status: 'ACTIVE' } }),
        this.prisma.user.count({ where: { status: 'SUSPENDED' } }),
        this.prisma.user.count({ where: { status: 'RESTRICTED' } }),
        this.prisma.user.count({ where: { createdAt: { gte: week } } }),
        this.signups(14),
      ]);
      out['users'] = {
        total,
        active,
        suspended,
        restricted,
        newLast7Days: newWeek,
        signupsPerDay: signups,
      };
    }

    if (can('content.read') || can('analytics.read')) {
      const [posts, reels, stories, reelsMaking, postsHeld, reelsHeld] = await Promise.all([
        this.prisma.post.count({ where: { deletedAt: null, moderationStatus: 'APPROVED' } }),
        this.prisma.reel.count({ where: { deletedAt: null, publishStatus: 'PUBLISHED' } }),
        this.prisma.story.count({
          where: { deletedAt: null, expiresAt: { gt: now }, moderationStatus: 'APPROVED' },
        }),
        this.prisma.reel.count({ where: { deletedAt: null, publishStatus: 'PROCESSING' } }),
        this.prisma.post.count({ where: { deletedAt: null, moderationStatus: 'PENDING' } }),
        this.prisma.reel.count({ where: { deletedAt: null, publishStatus: 'MODERATION' } }),
      ]);
      out['content'] = {
        posts,
        reels,
        activeStories: stories,
        reelsBeingMade: reelsMaking,
        heldForReview: { posts: postsHeld, reels: reelsHeld },
      };
    }

    if (can('reach.read') || can('analytics.read')) {
      const [reels, posts, config, qualified] = await Promise.all([
        this.prisma.reel.groupBy({
          by: ['reachLevel'],
          where: { deletedAt: null, publishStatus: 'PUBLISHED' },
          _count: true,
        }),
        this.prisma.post.groupBy({
          by: ['reachLevel'],
          where: { deletedAt: null, moderationStatus: 'APPROVED' },
          _count: true,
        }),
        this.prisma.reachConfigVersion.findFirst({
          where: { status: 'ACTIVE' },
          select: { version: true, activatedAt: true },
        }),
        this.qualifiedViewsPerDay(14),
      ]);
      const byLevel: Record<string, number> = { DISTRICT: 0, STATE: 0, NATIONAL: 0, GLOBAL: 0 };
      for (const g of [...reels, ...posts])
        byLevel[g.reachLevel] = (byLevel[g.reachLevel] ?? 0) + g._count;
      out['reach'] = {
        itemsByLevel: byLevel,
        activeConfigVersion: config?.version ?? null,
        activatedAt: config?.activatedAt?.toISOString() ?? null,
        qualifiedViewsPerDay: qualified,
      };
    }

    if (can('ledger.read') || can('earnings.read')) {
      const [accounts, cycles] = await Promise.all([
        this.prisma.ledgerAccount.findMany({
          select: { type: true, ownerUserId: true, balance: true },
        }),
        this.prisma.rewardCycle.groupBy({ by: ['status'], _count: true }),
      ]);
      let owed = 0n;
      const platform: Record<string, bigint> = {};
      for (const a of accounts) {
        const v = fromDatabase(a.balance);
        if (a.type === 'CREATOR_PAYABLE') owed += v;
        else platform[a.type] = (platform[a.type] ?? 0n) + v;
      }
      out['money'] = {
        currency: 'INR',
        owedToCreators: formatRupees(owed),
        rewardsGranted: formatRupees(platform['REWARD_POOL'] ?? 0n),
        payoutsInFlight: formatRupees(platform['PAYOUT_CLEARING'] ?? 0n),
        paidOut: formatRupees(platform['BANK_SETTLEMENT'] ?? 0n),
        manualAdjustments: formatRupees(platform['ADJUSTMENTS'] ?? 0n),
        cycles: Object.fromEntries(cycles.map((c) => [c.status, c._count])),
      };
    }

    // Work waiting for a person, each count only for those who can act on it.
    const queues: Record<string, number> = {};
    const add = async (permission: string, key: string, count: () => Promise<number>) => {
      if (can(permission)) queues[key] = await count();
    };
    await Promise.all([
      add('kyc.read', 'identityUnderReview', () =>
        this.prisma.kycProfile.count({ where: { status: 'UNDER_REVIEW' } }),
      ),
      add('bank.read', 'bankAccountsToReview', () =>
        this.prisma.payoutAccount.count({
          where: { status: 'PENDING_VERIFICATION', removedAt: null },
        }),
      ),
      add('payout.read', 'payoutsToReview', () =>
        this.prisma.payoutRequest.count({ where: { status: 'PENDING_REVIEW' } }),
      ),
      add('payout.read', 'payoutsOnHold', () =>
        this.prisma.payoutRequest.count({ where: { status: 'ON_HOLD' } }),
      ),
      add('media.read', 'mediaJobsFailed', () =>
        this.prisma.mediaJob.count({
          where: { status: 'FAILED', finishedAt: { gte: new Date(now.getTime() - 7 * DAY) } },
        }),
      ),
      add('media.read', 'mediaAwaitingReview', () =>
        this.prisma.mediaAsset.count({
          where: { status: 'READY', moderationStatus: 'PENDING', deletedAt: null },
        }),
      ),
      add('music.read', 'licencesEndingSoon', () =>
        this.prisma.musicLicence.count({
          where: {
            status: 'ACTIVE',
            expiresAt: { gte: now, lte: new Date(now.getTime() + 30 * DAY) },
          },
        }),
      ),
      add('reports.read', 'reportsOpen', () =>
        this.prisma.report.count({ where: { status: 'OPEN' } }),
      ),
      add('appeals.read', 'appealsOpen', () =>
        this.prisma.appeal.count({ where: { status: 'OPEN' } }),
      ),
      add('business.read', 'verificationsPending', () =>
        this.prisma.verificationRequest.count({ where: { status: 'PENDING' } }),
      ),
      add('ads.read', 'campaignsInReview', () =>
        this.prisma.adCampaign.count({ where: { status: 'IN_REVIEW' } }),
      ),
      add('safety.incidents.read', 'incidentsOpen', () =>
        this.prisma.safetyIncident.count({ where: { status: { in: ['OPEN', 'ESCALATED'] } } }),
      ),
    ]);
    out['queues'] = queues;
    return out;
  }

  /** New accounts per day for the last `days` days, with zeros for quiet days. */
  private async signups(days: number) {
    const rows = await this.prisma.$queryRaw<{ day: Date; n: bigint }[]>`
      SELECT (created_at AT TIME ZONE 'UTC')::date AS day, count(*) AS n
        FROM users WHERE created_at >= now() - make_interval(days => ${days}::int) GROUP BY 1 ORDER BY 1`;
    return this.fill(
      days,
      rows.map((r) => [r.day, Number(r.n)] as const),
    );
  }

  private async qualifiedViewsPerDay(days: number) {
    const rows = await this.prisma.$queryRaw<{ day: Date; n: bigint }[]>`
      SELECT (created_at AT TIME ZONE 'UTC')::date AS day, count(*) AS n
        FROM reach_events WHERE type = 'QUALIFIED_VIEW' AND NOT excluded AND created_at >= now() - make_interval(days => ${days}::int)
       GROUP BY 1 ORDER BY 1`;
    return this.fill(
      days,
      rows.map((r) => [r.day, Number(r.n)] as const),
    );
  }

  private fill(days: number, rows: ReadonlyArray<readonly [Date, number]>) {
    const byDay = new Map(rows.map(([d, n]) => [d.toISOString().slice(0, 10), n]));
    return Array.from({ length: days }, (_, i) => {
      const day = new Date(Date.now() - (days - 1 - i) * DAY).toISOString().slice(0, 10);
      return { day, count: byDay.get(day) ?? 0 };
    });
  }
}
