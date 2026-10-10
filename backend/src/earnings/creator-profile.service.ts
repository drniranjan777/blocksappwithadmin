import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../admin/audit/audit.service.js';
import { Errors } from '../common/errors/app-error.js';
import type { AdminAuthContext } from '../common/http/request.js';
import { Page, clampLimit, decodeCursor } from '../common/pagination/cursor.js';
import { PrismaService } from '../database/prisma.service.js';
import type { MonetizationStatus, ReachLevel } from '../generated/prisma/client.js';
import { LEVELS, type LevelKey } from '../reach/reach-config.js';
import { ReachConfigService } from '../reach/reach-config.service.js';
import { type EligibilityFacts, evaluateEligibility } from './earnings-calc.js';

const cursorSchema = z.object({ t: z.string(), id: z.string() });
const toKey = (level: ReachLevel): LevelKey => level.toLowerCase() as LevelKey;

interface Meta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

/**
 * Who may earn.
 *
 * Eligibility is decided here, from the account's own standing and track record, against the
 * thresholds in the active Reach configuration; nothing a client sends can set it. A creator
 * who meets them is `ELIGIBLE`; one whom staff have suspended stays `SUSPENDED` however well
 * they perform until staff restore them. (`ACTIVE`, eligible *and* identity-verified, arrives
 * with the verification stage; until then an `ELIGIBLE` creator accrues rewards but cannot be
 * paid out.)
 */
@Injectable()
export class CreatorProfileService {
  private readonly logger = new Logger('Creators');

  constructor(
    private readonly prisma: PrismaService,
    private readonly configs: ReachConfigService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------- facts --

  async facts(userId: string): Promise<EligibilityFacts | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true, status: true, profile: { select: { followersCount: true } } },
    });
    if (!user) return null;
    const [reels, posts, reach] = await Promise.all([
      this.prisma.reel.count({
        where: { authorId: userId, deletedAt: null, publishStatus: 'PUBLISHED' },
      }),
      this.prisma.post.count({
        where: { authorId: userId, deletedAt: null, moderationStatus: 'APPROVED' },
      }),
      this.qualifiedReach30d(userId),
    ]);
    return {
      followers: user.profile?.followersCount ?? 0,
      accountAgeDays: (Date.now() - user.createdAt.getTime()) / 86_400_000,
      publishedItems: reels + posts,
      qualifiedReach30d: reach,
      accountActive: user.status === 'ACTIVE',
    };
  }

  /** Distinct qualified views on this creator's content in the last 30 days (fake engagement excluded). */
  private async qualifiedReach30d(userId: string): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT (
        (SELECT count(*) FROM reach_events e JOIN reels r ON r.id = e.reel_id
          WHERE r.author_id = ${userId}::uuid AND e.type = 'QUALIFIED_VIEW' AND NOT e.excluded
            AND e.created_at > now() - interval '30 days')
        +
        (SELECT count(*) FROM reach_events e JOIN posts p ON p.id = e.post_id
          WHERE p.author_id = ${userId}::uuid AND e.type = 'QUALIFIED_VIEW' AND NOT e.excluded
            AND e.created_at > now() - interval '30 days')
      ) AS n`;
    return Number(row?.n ?? 0);
  }

  private async bestLevel(userId: string): Promise<ReachLevel> {
    const [reel, post] = await Promise.all([
      this.prisma.reel.findFirst({
        where: { authorId: userId, deletedAt: null, publishStatus: 'PUBLISHED' },
        orderBy: { reachLevel: 'desc' },
        select: { reachLevel: true },
      }),
      this.prisma.post.findFirst({
        where: { authorId: userId, deletedAt: null, moderationStatus: 'APPROVED' },
        orderBy: { reachLevel: 'desc' },
        select: { reachLevel: true },
      }),
    ]);
    const levels = [reel?.reachLevel, post?.reachLevel].filter((l): l is ReachLevel => !!l);
    return (
      levels.sort((a, b) => LEVELS.indexOf(toKey(b)) - LEVELS.indexOf(toKey(a)))[0] ?? 'DISTRICT'
    );
  }

  // -------------------------------------------------------------- eligibility --

  /** Where this creator stands against the thresholds, for their own screen. Does not change anything. */
  async eligibility(userId: string) {
    const [facts, active, profile] = await Promise.all([
      this.facts(userId),
      this.configs.active(),
      this.prisma.creatorProfile.findUnique({ where: { userId } }),
    ]);
    if (!facts) throw Errors.notFound('Creator');
    const result = evaluateEligibility(active.config, facts);
    return {
      status: profile?.monetizationStatus ?? 'NOT_ELIGIBLE',
      eligible: result.eligible,
      requirements: result.requirements,
      suspended:
        profile?.monetizationStatus === 'SUSPENDED'
          ? { since: profile.suspendedAt?.toISOString() ?? null }
          : null,
    };
  }

  /** Re-decides one creator's status from their current record. Suspension is never undone here. */
  async refreshOne(userId: string): Promise<MonetizationStatus> {
    const [facts, active, existing] = await Promise.all([
      this.facts(userId),
      this.configs.active(),
      this.prisma.creatorProfile.findUnique({ where: { userId } }),
    ]);
    if (!facts) return 'NOT_ELIGIBLE';
    const eligible = evaluateEligibility(active.config, facts).eligible;
    // Eligible by record; ACTIVE once identity is verified as well (see the payments module).
    const verified = await this.prisma.kycProfile.findFirst({
      where: {
        userId,
        status: 'VERIFIED',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    });
    let status: MonetizationStatus;
    if (existing?.monetizationStatus === 'SUSPENDED') status = 'SUSPENDED';
    else if (!eligible) status = 'NOT_ELIGIBLE';
    else status = verified ? 'ACTIVE' : 'ELIGIBLE';

    const best = await this.bestLevel(userId);
    await this.prisma.creatorProfile.upsert({
      where: { userId },
      create: {
        userId,
        monetizationStatus: status,
        eligibleSince: status === 'ELIGIBLE' || status === 'ACTIVE' ? new Date() : null,
        bestReachLevel: best,
        qualifiedReach30d: facts.qualifiedReach30d,
      },
      update: {
        monetizationStatus: status,
        bestReachLevel: best,
        qualifiedReach30d: facts.qualifiedReach30d,
        ...((status === 'ELIGIBLE' || status === 'ACTIVE') && !existing?.eligibleSince
          ? { eligibleSince: new Date() }
          : {}),
        ...(status === 'NOT_ELIGIBLE' ? { eligibleSince: null } : {}),
      },
    });
    return status;
  }

  /** Background job: anyone with recent qualified views, and anyone already tracked. */
  async refreshAll(limit = 200): Promise<number> {
    const ids = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM (
        SELECT r.author_id AS id FROM reach_events e JOIN reels r ON r.id = e.reel_id
         WHERE e.type = 'QUALIFIED_VIEW' AND NOT e.excluded AND e.created_at > now() - interval '30 days'
        UNION
        SELECT p.author_id FROM reach_events e JOIN posts p ON p.id = e.post_id
         WHERE e.type = 'QUALIFIED_VIEW' AND NOT e.excluded AND e.created_at > now() - interval '30 days'
        UNION
        SELECT user_id FROM creator_profiles
      ) c LIMIT ${limit}`;
    let done = 0;
    for (const { id } of ids) {
      try {
        await this.refreshOne(id);
        done++;
      } catch (error) {
        this.logger.warn(`could not refresh creator ${id}: ${(error as Error).message}`);
      }
    }
    return done;
  }

  // -------------------------------------------------------------- suspension --

  async suspend(actor: AdminAuthContext, userId: string, reason: string, meta: Meta) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw Errors.notFound('Creator');
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.creatorProfile.findUnique({ where: { userId } });
      if (before?.monetizationStatus === 'SUSPENDED') {
        throw Errors.conflict("This creator's monetisation is already suspended.");
      }
      await tx.creatorProfile.upsert({
        where: { userId },
        create: {
          userId,
          monetizationStatus: 'SUSPENDED',
          suspendedAt: new Date(),
          suspendedReason: reason.slice(0, 300),
          suspendedById: actor.adminId,
        },
        update: {
          monetizationStatus: 'SUSPENDED',
          suspendedAt: new Date(),
          suspendedReason: reason.slice(0, 300),
          suspendedById: actor.adminId,
          eligibleSince: null,
        },
      });
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'creator.monetization_suspended',
          targetType: 'user',
          targetId: userId,
          reason,
          before: { status: before?.monetizationStatus ?? 'NOT_ELIGIBLE' },
          after: { status: 'SUSPENDED' },
          ...meta,
        },
        tx,
      );
    });
    return this.eligibility(userId);
  }

  async restore(actor: AdminAuthContext, userId: string, reason: string, meta: Meta) {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.creatorProfile.findUnique({ where: { userId } });
      if (before?.monetizationStatus !== 'SUSPENDED') {
        throw Errors.conflict("This creator's monetisation is not suspended.");
      }
      await tx.creatorProfile.update({
        where: { userId },
        data: {
          monetizationStatus: 'NOT_ELIGIBLE',
          suspendedAt: null,
          suspendedReason: null,
          suspendedById: null,
        },
      });
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'creator.monetization_restored',
          targetType: 'user',
          targetId: userId,
          reason,
          before: { status: 'SUSPENDED' },
          after: { status: 'NOT_ELIGIBLE' },
          ...meta,
        },
        tx,
      );
    });
    // Restored does not mean eligible: the record decides.
    await this.refreshOne(userId);
    return this.eligibility(userId);
  }

  // --------------------------------------------------------------- analytics --

  /** The creator’s own published content with where each piece stands on the Ladder. */
  async content(
    userId: string,
    kind: 'reel' | 'post',
    q: { cursor?: string | undefined; limit?: number | undefined },
  ) {
    const limit = clampLimit(q.limit);
    const after = decodeCursor(q.cursor, cursorSchema);
    const older = after
      ? [
          {
            OR: [
              { publishedAt: { lt: new Date(after.t) } },
              { publishedAt: new Date(after.t), id: { lt: after.id } },
            ],
          },
        ]
      : [];
    const rows =
      kind === 'reel'
        ? await this.prisma.reel.findMany({
            where: {
              AND: [
                { authorId: userId, deletedAt: null, publishStatus: 'PUBLISHED' },
                { publishedAt: { not: null } },
                ...older,
              ],
            },
            select: {
              id: true,
              caption: true,
              publishedAt: true,
              reachLevel: true,
              qualifiedReach: true,
              viewsCount: true,
              likesCount: true,
              commentsCount: true,
              sharesCount: true,
              savesCount: true,
            },
            orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
            take: limit + 1,
          })
        : await this.prisma.post.findMany({
            where: {
              AND: [{ authorId: userId, deletedAt: null, moderationStatus: 'APPROVED' }, ...older],
            },
            select: {
              id: true,
              caption: true,
              publishedAt: true,
              reachLevel: true,
              qualifiedReach: true,
              viewsCount: true,
              likesCount: true,
              commentsCount: true,
              sharesCount: true,
              savesCount: true,
            },
            orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
            take: limit + 1,
          });
    const shown = rows.slice(0, limit);
    const ids = shown.map((r) => r.id);
    const scores = ids.length
      ? await this.prisma.reachScore.findMany({
          where: kind === 'reel' ? { reelId: { in: ids } } : { postId: { in: ids } },
          orderBy: { computedAt: 'desc' },
          distinct: [kind === 'reel' ? 'reelId' : 'postId'],
          select: { reelId: true, postId: true, score: true, computedAt: true },
        })
      : [];
    const scoreOf = new Map(scores.map((s) => [(s.reelId ?? s.postId) as string, Number(s.score)]));
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: (r.publishedAt as Date).toISOString(), id: r.id }),
      (r) => ({
        kind,
        id: r.id,
        caption: r.caption.slice(0, 140),
        publishedAt: (r.publishedAt as Date).toISOString(),
        level: r.reachLevel,
        qualifiedReach: r.qualifiedReach,
        score: scoreOf.get(r.id) ?? null,
        counts: {
          views: r.viewsCount,
          likes: r.likesCount,
          comments: r.commentsCount,
          shares: r.sharesCount,
          saves: r.savesCount,
        },
      }),
    );
  }

  /** How many published items sit on each rung. */
  async levelCounts(userId: string): Promise<Record<LevelKey, number>> {
    const out: Record<LevelKey, number> = { district: 0, state: 0, national: 0, global: 0 };
    const [reels, posts] = await Promise.all([
      this.prisma.reel.groupBy({
        by: ['reachLevel'],
        where: { authorId: userId, deletedAt: null, publishStatus: 'PUBLISHED' },
        _count: true,
      }),
      this.prisma.post.groupBy({
        by: ['reachLevel'],
        where: { authorId: userId, deletedAt: null, moderationStatus: 'APPROVED' },
        _count: true,
      }),
    ]);
    for (const g of [...reels, ...posts]) out[toKey(g.reachLevel)] += g._count;
    return out;
  }

  /**
   * Share (0..1) of the creator's published items that have reached *at least* each rung, so
   * the District figure is 1 for anyone who has published, and Global is the share that went
   * all the way. An empty profile has no coverage anywhere.
   */
  coverageOf(counts: Record<LevelKey, number>): Record<LevelKey, number> {
    const total = counts.district + counts.state + counts.national + counts.global;
    const share = (n: number): number =>
      total === 0 ? 0 : Math.round((n / total) * 10_000) / 10_000;
    return {
      district: share(total),
      state: share(counts.state + counts.national + counts.global),
      national: share(counts.national + counts.global),
      global: share(counts.global),
    };
  }

  /**
   * What the creator's audience did in the last 30 days, counted the same way as qualified
   * reach (fake engagement excluded). Watch time is the time the qualifying views were watched.
   * `engagementRate` is likes + comments + shares + saves per qualified view, capped at 1.
   * `bestItemQualifiedReach` is the most qualified views any one reel or post got.
   */
  async performance30d(userId: string): Promise<{
    qualifiedViews: number;
    watchSeconds: number;
    shares: number;
    saves: number;
    likes: number;
    comments: number;
    engagementRate: number;
    bestItemQualifiedReach: number;
  }> {
    const [totals] = await this.prisma.$queryRaw<
      {
        qualified_views: bigint;
        watch_ms: bigint;
        shares: bigint;
        saves: bigint;
        likes: bigint;
        comments: bigint;
      }[]
    >`
      WITH mine AS (
        SELECT e.type, e.watch_ms FROM reach_events e JOIN reels r ON r.id = e.reel_id
         WHERE r.author_id = ${userId}::uuid AND NOT e.excluded
           AND e.created_at > now() - interval '30 days'
        UNION ALL
        SELECT e.type, e.watch_ms FROM reach_events e JOIN posts p ON p.id = e.post_id
         WHERE p.author_id = ${userId}::uuid AND NOT e.excluded
           AND e.created_at > now() - interval '30 days'
      )
      SELECT
        count(*) FILTER (WHERE type = 'QUALIFIED_VIEW')::bigint AS qualified_views,
        coalesce(sum(watch_ms) FILTER (WHERE type = 'QUALIFIED_VIEW'), 0)::bigint AS watch_ms,
        count(*) FILTER (WHERE type = 'SHARE')::bigint AS shares,
        count(*) FILTER (WHERE type = 'SAVE')::bigint AS saves,
        count(*) FILTER (WHERE type = 'LIKE')::bigint AS likes,
        count(*) FILTER (WHERE type = 'COMMENT')::bigint AS comments
      FROM mine`;
    const [best] = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT coalesce(max(n), 0)::bigint AS n FROM (
        SELECT count(*) AS n FROM reach_events e JOIN reels r ON r.id = e.reel_id
         WHERE r.author_id = ${userId}::uuid AND e.type = 'QUALIFIED_VIEW' AND NOT e.excluded
           AND e.created_at > now() - interval '30 days'
         GROUP BY e.reel_id
        UNION ALL
        SELECT count(*) AS n FROM reach_events e JOIN posts p ON p.id = e.post_id
         WHERE p.author_id = ${userId}::uuid AND e.type = 'QUALIFIED_VIEW' AND NOT e.excluded
           AND e.created_at > now() - interval '30 days'
         GROUP BY e.post_id
      ) t`;
    const qualifiedViews = Number(totals?.qualified_views ?? 0);
    const shares = Number(totals?.shares ?? 0);
    const saves = Number(totals?.saves ?? 0);
    const likes = Number(totals?.likes ?? 0);
    const comments = Number(totals?.comments ?? 0);
    const interactions = shares + saves + likes + comments;
    return {
      qualifiedViews,
      watchSeconds: Math.round(Number(totals?.watch_ms ?? 0) / 1000),
      shares,
      saves,
      likes,
      comments,
      engagementRate:
        qualifiedViews === 0
          ? 0
          : Math.min(1, Math.round((interactions / qualifiedViews) * 10_000) / 10_000),
      bestItemQualifiedReach: Number(best?.n ?? 0),
    };
  }
}
