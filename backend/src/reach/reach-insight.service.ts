import { Injectable } from '@nestjs/common';
import { Errors } from '../common/errors/app-error.js';
import { PrismaService } from '../database/prisma.service.js';
import { SIGNALS, type LevelKey } from './reach-config.js';
import { ReachConfigService } from './reach-config.service.js';
import type { ContentKind } from './reach-events.service.js';
import { type ReachAggregates, requirementsFor } from './reach-score.js';

const kinds = new Set<string>(['post', 'reel']);
const toKey = (level: string): LevelKey => level.toLowerCase() as LevelKey;
const NEXT: Record<LevelKey, LevelKey | null> = {
  district: 'state',
  state: 'national',
  national: 'global',
  global: null,
};

/** Where a piece of content stands on the Reach Ladder, and why. */
@Injectable()
export class ReachInsightService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ReachConfigService,
  ) {}

  private assertKind(kind: string): ContentKind {
    if (!kinds.has(kind)) throw Errors.notFound('Content');
    return kind as ContentKind;
  }

  /**
   * The author's own view: current rung, qualified reach, the score and how each signal added to
   * it, and what is still missing for the next rung. It says nothing about events that were set
   * aside, so it cannot be used to test what the fraud rules catch.
   */
  async progress(authorId: string, rawKind: string, id: string) {
    const kind = this.assertKind(rawKind);
    const where = { id, authorId, deletedAt: null };
    const content =
      kind === 'reel'
        ? await this.prisma.reel.findFirst({
            where,
            select: { reachLevel: true, qualifiedReach: true, publishStatus: true },
          })
        : await this.prisma.post.findFirst({
            where,
            select: { reachLevel: true, qualifiedReach: true },
          });
    if (!content) throw Errors.notFound('Content');

    const [latest, active] = await Promise.all([
      this.prisma.reachScore.findFirst({
        where: kind === 'reel' ? { reelId: id } : { postId: id },
        orderBy: { computedAt: 'desc' },
      }),
      this.config.active(),
    ]);
    const level = toKey(content.reachLevel);
    const next = NEXT[level];
    if (!latest) {
      return {
        kind,
        id,
        level: content.reachLevel,
        qualifiedReach: content.qualifiedReach,
        score: null,
        computedAt: null,
        signals: [],
        next: next
          ? {
              level: next.toUpperCase(),
              requirements: requirementsFor(active.config, next, {
                qualifiedReach: 0,
                score: 0,
                districts: 0,
                states: 0,
                countries: 0,
                international: 0,
              }),
            }
          : null,
      };
    }
    // Show progress against the rules in force now, from the counts the score was computed from.
    const stored = latest.signals as {
      inputs?: ReachAggregates;
      signals?: { normalised: Record<string, number>; contributions: Record<string, number> };
    };
    const inputs = stored.inputs;
    return {
      kind,
      id,
      level: content.reachLevel,
      qualifiedReach: content.qualifiedReach,
      score: Number(latest.score),
      computedAt: latest.computedAt.toISOString(),
      signals: SIGNALS.map((key) => ({
        key,
        percent: Math.round((stored.signals?.normalised[key] ?? 0) * 100),
        points: Math.round((stored.signals?.contributions[key] ?? 0) * 100) / 100,
        outOf: Math.round(active.config.weights[key] * 10_000) / 100,
      })),
      next:
        next && inputs
          ? {
              level: next.toUpperCase(),
              requirements: requirementsFor(active.config, next, {
                qualifiedReach: inputs.qualifiedViewers,
                score: Number(latest.score),
                districts: inputs.distinctDistricts,
                states: inputs.distinctStates,
                countries: inputs.distinctCountries,
                international: inputs.internationalViewers,
              }),
            }
          : null,
    };
  }

  /** For staff: every score a piece of content has had, with the configuration version behind each. */
  async history(rawKind: string, id: string, limit = 50) {
    const kind = this.assertKind(rawKind);
    const rows = await this.prisma.reachScore.findMany({
      where: kind === 'reel' ? { reelId: id } : { postId: id },
      include: { configVersion: { select: { version: true } } },
      orderBy: { computedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return rows.map((r) => ({
      id: r.id,
      computedAt: r.computedAt.toISOString(),
      configVersion: r.configVersion.version,
      qualifiedReach: r.qualifiedReach,
      score: Number(r.score),
      level: r.level,
      previousLevel: r.previousLevel,
      distinctDistricts: r.distinctDistricts,
      distinctStates: r.distinctStates,
      distinctCountries: r.distinctCountries,
      excludedEvents: r.excludedEvents,
      signals: r.signals,
    }));
  }
}
