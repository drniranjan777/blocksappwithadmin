import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma, ReachLevel } from '../generated/prisma/client.js';
import { NotificationService } from '../notifications/notification.service.js';
import { ReachConfigService } from './reach-config.service.js';
import type { ContentKind } from './reach-events.service.js';
import { LEVELS, type LevelKey } from './reach-config.js';
import {
  type ReachAggregates,
  type ScoreResult,
  applyRatchet,
  authorTrust,
  computeScore,
} from './reach-score.js';

const toLevel = (key: LevelKey): ReachLevel => key.toUpperCase() as ReachLevel;
const toKey = (level: ReachLevel): LevelKey => level.toLowerCase() as LevelKey;

interface Counts {
  qualified_viewers: bigint;
  completions: bigint;
  avg_watch_ratio: number | null;
  watch_viewers: bigint;
  shares: bigint;
  saves: bigint;
  comments: bigint;
  districts: bigint;
  states: bigint;
  countries: bigint;
  international: bigint;
  excluded: bigint;
}

/**
 * Computing each piece of content's Qualified Reach Score and Reach Level.
 *
 * It runs in the background. For every post or reel that has had new events since it was last
 * scored (or was scored under an older configuration) it counts the events that were not set
 * aside, computes the score under the **active configuration version**, and stores the result
 * together with the counts it was computed from, so the number can be reproduced exactly.
 *
 * Only this code writes `reach_level` and `qualified_reach` on content. A client has no way to
 * say what level its content is on.
 */
@Injectable()
export class ReachScoringService {
  private readonly logger = new Logger('ReachScoring');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ReachConfigService,
    private readonly notifications: NotificationService,
  ) {}

  /** Scores what is out of date. Safe to run on every instance at once (a second pass finds nothing new). */
  async scorePending(limit = 200): Promise<number> {
    const active = await this.config.active();
    const reels = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT r.id FROM reels r
       WHERE r.deleted_at IS NULL AND r.publish_status = 'PUBLISHED'
         AND ( EXISTS (SELECT 1 FROM reach_events e
                        WHERE e.reel_id = r.id
                          AND e.created_at > COALESCE((SELECT max(s.computed_at) FROM reach_scores s WHERE s.reel_id = r.id), '-infinity'::timestamptz))
            OR COALESCE((SELECT s.config_version_id FROM reach_scores s WHERE s.reel_id = r.id ORDER BY s.computed_at DESC LIMIT 1), ${active.id}::uuid) <> ${active.id}::uuid )
       LIMIT ${limit}`;
    const posts = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM posts p
       WHERE p.deleted_at IS NULL AND p.moderation_status = 'APPROVED'
         AND ( EXISTS (SELECT 1 FROM reach_events e
                        WHERE e.post_id = p.id
                          AND e.created_at > COALESCE((SELECT max(s.computed_at) FROM reach_scores s WHERE s.post_id = p.id), '-infinity'::timestamptz))
            OR COALESCE((SELECT s.config_version_id FROM reach_scores s WHERE s.post_id = p.id ORDER BY s.computed_at DESC LIMIT 1), ${active.id}::uuid) <> ${active.id}::uuid )
       LIMIT ${limit}`;
    let done = 0;
    for (const [kind, rows] of [
      ['reel', reels],
      ['post', posts],
    ] as const) {
      for (const row of rows) {
        try {
          await this.scoreContent(kind, row.id);
          done++;
        } catch (error) {
          this.logger.warn(`could not score ${kind} ${row.id}: ${(error as Error).message}`);
        }
      }
    }
    return done;
  }

  /** Counts the events that count, for one piece of content. */
  async aggregate(
    kind: ContentKind,
    id: string,
    durationMs: number,
    country: string,
    authorTrustValue: number,
  ): Promise<ReachAggregates> {
    const [c] =
      kind === 'reel'
        ? await this.prisma.$queryRaw<Counts[]>`
          SELECT
            count(*) FILTER (WHERE type = 'QUALIFIED_VIEW' AND NOT excluded) AS qualified_viewers,
            count(*) FILTER (WHERE type = 'COMPLETE' AND NOT excluded) AS completions,
            avg(LEAST(1.0, watch_ms::float8 / NULLIF(${durationMs}::float8, 0))) FILTER (WHERE type = 'WATCH' AND NOT excluded) AS avg_watch_ratio,
            count(DISTINCT viewer_id) FILTER (WHERE type = 'WATCH' AND NOT excluded) AS watch_viewers,
            count(DISTINCT viewer_id) FILTER (WHERE type = 'SHARE' AND NOT excluded) AS shares,
            count(DISTINCT viewer_id) FILTER (WHERE type = 'SAVE' AND NOT excluded) AS saves,
            count(DISTINCT viewer_id) FILTER (WHERE type = 'COMMENT' AND NOT excluded) AS comments,
            count(DISTINCT (viewer_state, viewer_district)) FILTER (WHERE type = 'QUALIFIED_VIEW' AND NOT excluded AND viewer_district IS NOT NULL) AS districts,
            count(DISTINCT viewer_state) FILTER (WHERE type = 'QUALIFIED_VIEW' AND NOT excluded AND viewer_state IS NOT NULL) AS states,
            count(DISTINCT viewer_country) FILTER (WHERE type = 'QUALIFIED_VIEW' AND NOT excluded AND viewer_country IS NOT NULL) AS countries,
            count(*) FILTER (WHERE type = 'QUALIFIED_VIEW' AND NOT excluded AND viewer_country IS DISTINCT FROM ${country}) AS international,
            count(*) FILTER (WHERE excluded) AS excluded
          FROM reach_events WHERE reel_id = ${id}::uuid`
        : await this.prisma.$queryRaw<Counts[]>`
          SELECT
            count(*) FILTER (WHERE type = 'QUALIFIED_VIEW' AND NOT excluded) AS qualified_viewers,
            count(*) FILTER (WHERE type = 'QUALIFIED_VIEW' AND NOT excluded) AS completions,
            NULL::float8 AS avg_watch_ratio,
            count(DISTINCT viewer_id) FILTER (WHERE type = 'WATCH' AND NOT excluded) AS watch_viewers,
            count(DISTINCT viewer_id) FILTER (WHERE type = 'SHARE' AND NOT excluded) AS shares,
            count(DISTINCT viewer_id) FILTER (WHERE type = 'SAVE' AND NOT excluded) AS saves,
            count(DISTINCT viewer_id) FILTER (WHERE type = 'COMMENT' AND NOT excluded) AS comments,
            count(DISTINCT (viewer_state, viewer_district)) FILTER (WHERE type = 'QUALIFIED_VIEW' AND NOT excluded AND viewer_district IS NOT NULL) AS districts,
            count(DISTINCT viewer_state) FILTER (WHERE type = 'QUALIFIED_VIEW' AND NOT excluded AND viewer_state IS NOT NULL) AS states,
            count(DISTINCT viewer_country) FILTER (WHERE type = 'QUALIFIED_VIEW' AND NOT excluded AND viewer_country IS NOT NULL) AS countries,
            count(*) FILTER (WHERE type = 'QUALIFIED_VIEW' AND NOT excluded AND viewer_country IS DISTINCT FROM ${country}) AS international,
            count(*) FILTER (WHERE excluded) AS excluded
          FROM reach_events WHERE post_id = ${id}::uuid`;
    const n = (v: bigint | null | undefined): number => Number(v ?? 0);
    const qualified = n(c?.qualified_viewers);
    return {
      qualifiedViewers: qualified,
      // A post has no length to watch: the share of people who lingered long enough stands in for it.
      avgWatchRatio:
        kind === 'reel'
          ? (c?.avg_watch_ratio ?? 0)
          : Math.min(1, qualified / Math.max(1, n(c?.watch_viewers))),
      completions: n(c?.completions),
      shares: n(c?.shares),
      saves: n(c?.saves),
      comments: n(c?.comments),
      distinctDistricts: n(c?.districts),
      distinctStates: n(c?.states),
      distinctCountries: n(c?.countries),
      internationalViewers: n(c?.international),
      excludedEvents: n(c?.excluded),
      authorTrust: authorTrustValue,
    };
  }

  private async trustOf(authorId: string): Promise<number> {
    const u = await this.prisma.user.findUnique({
      where: { id: authorId },
      select: {
        createdAt: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        riskLevel: true,
        status: true,
      },
    });
    if (!u) return 0;
    return authorTrust({
      accountAgeDays: (Date.now() - u.createdAt.getTime()) / 86_400_000,
      contactVerified: !!(u.emailVerifiedAt ?? u.phoneVerifiedAt),
      risk: u.riskLevel,
      restricted: u.status !== 'ACTIVE',
    });
  }

  /** Scores one post or reel now, and records the result if anything changed. */
  async scoreContent(kind: ContentKind, id: string): Promise<ScoreResult | null> {
    const content =
      kind === 'reel'
        ? await this.prisma.reel.findUnique({
            where: { id },
            select: {
              authorId: true,
              durationMs: true,
              country: true,
              reachLevel: true,
              qualifiedReach: true,
              deletedAt: true,
            },
          })
        : await this.prisma.post.findUnique({
            where: { id },
            select: {
              authorId: true,
              country: true,
              reachLevel: true,
              qualifiedReach: true,
              deletedAt: true,
            },
          });
    if (!content || content.deletedAt) return null;
    const durationMs =
      kind === 'reel' ? Number((content as { durationMs?: number }).durationMs ?? 0) : 0;

    const { id: configVersionId, config } = await this.config.active();
    const where = kind === 'reel' ? { reelId: id } : { postId: id };
    const [aggregates, previous] = await Promise.all([
      this.aggregate(kind, id, durationMs, content.country, await this.trustOf(content.authorId)),
      this.prisma.reachScore.findFirst({ where, orderBy: { computedAt: 'desc' } }),
    ]);
    const result = computeScore(config, aggregates);
    const current = toKey(content.reachLevel);
    const level = applyRatchet(
      current,
      result.level,
      aggregates.excludedEvents > (previous?.excludedEvents ?? 0),
    );

    const changed =
      !previous ||
      previous.configVersionId !== configVersionId ||
      previous.qualifiedReach !== result.qualifiedReach ||
      Number(previous.score) !== result.score ||
      previous.level !== toLevel(level) ||
      previous.excludedEvents !== aggregates.excludedEvents;
    if (!changed) return { ...result, level };

    await this.prisma.$transaction(async (tx) => {
      await tx.reachScore.create({
        data: {
          ...where,
          configVersionId,
          qualifiedReach: result.qualifiedReach,
          score: result.score,
          // The counts it came from and how each signal contributed: enough to reproduce and explain it.
          signals: {
            inputs: aggregates,
            signals: result.signals,
            weights: config.weights,
            next: result.next,
          } as unknown as Prisma.InputJsonValue,
          distinctDistricts: aggregates.distinctDistricts,
          distinctStates: aggregates.distinctStates,
          distinctCountries: aggregates.distinctCountries,
          excludedEvents: aggregates.excludedEvents,
          level: toLevel(level),
          previousLevel: content.reachLevel,
        },
      });
      const data = { reachLevel: toLevel(level), qualifiedReach: result.qualifiedReach };
      if (kind === 'reel') await tx.reel.update({ where: { id }, data });
      else await tx.post.update({ where: { id }, data });
    });

    if (LEVELS.indexOf(level) > LEVELS.indexOf(current)) {
      await this.notifications
        .notify({
          userId: content.authorId,
          type: 'REACH_MILESTONE',
          template: 'reach_level_up',
          vars: { target: kind, level: level.toUpperCase() },
          severity: 'INFO',
          category: 'social',
          data: { [`${kind}Id`]: id, level: level.toUpperCase() },
          dedupeKey: `reach:${kind}:${id}:${level}`,
        })
        .catch(() => undefined);
    }
    return { ...result, level };
  }
}
