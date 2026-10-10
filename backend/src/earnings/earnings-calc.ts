import { LEVELS, type LevelKey, type ReachConfig } from '../reach/reach-config.js';
import { type Paise, allocate, capShares } from '../ledger/money.js';

/** What one piece of content did in a reward cycle. */
export interface ContentContribution {
  creatorId: string;
  /** The rung it has reached. */
  level: LevelKey;
  /** Its Qualified Reach Score (0..100). */
  score: number;
  /** Distinct qualified views it earned inside the cycle's dates. */
  qualifiedViews: number;
}

export interface CreatorWeight {
  creatorId: string;
  weight: number;
  qualifiedReach: number;
  bestLevel: LevelKey;
  byLevel: Record<LevelKey, { views: number; weight: number }>;
  contentCount: number;
}

const emptyLevels = (): CreatorWeight['byLevel'] => ({
  district: { views: 0, weight: 0 },
  state: { views: 0, weight: 0 },
  national: { views: 0, weight: 0 },
  global: { views: 0, weight: 0 },
});

/**
 * How much of the pool each creator's content has earned a claim to.
 *
 *     claim = qualified views  x  rung multiplier  x  quality
 *
 * where quality is the content's score as a fraction, and zero below the configured minimum.
 * Raw plays do not appear: only distinct qualified viewers, a higher rung is worth more, and
 * low-quality content earns nothing however far it spread. Nothing here promises a rate per
 * view: the claim is a *share* of a fixed pool, so the value of a view depends on everyone
 * else's.
 */
export function creatorWeights(
  config: ReachConfig,
  contributions: readonly ContentContribution[],
): CreatorWeight[] {
  const { levelMultipliers, minScoreForReward } = config.rewards;
  const byCreator = new Map<string, CreatorWeight>();
  for (const c of contributions) {
    if (!(c.qualifiedViews > 0)) continue;
    const quality = c.score >= minScoreForReward ? Math.min(1, Math.max(0, c.score / 100)) : 0;
    const weight = c.qualifiedViews * levelMultipliers[c.level] * quality;
    const entry = byCreator.get(c.creatorId) ?? {
      creatorId: c.creatorId,
      weight: 0,
      qualifiedReach: 0,
      bestLevel: 'district' as LevelKey,
      byLevel: emptyLevels(),
      contentCount: 0,
    };
    entry.weight += weight;
    entry.qualifiedReach += c.qualifiedViews;
    entry.contentCount += 1;
    entry.byLevel[c.level].views += c.qualifiedViews;
    entry.byLevel[c.level].weight += weight;
    if (LEVELS.indexOf(c.level) > LEVELS.indexOf(entry.bestLevel)) entry.bestLevel = c.level;
    byCreator.set(c.creatorId, entry);
  }
  return [...byCreator.values()].sort((a, b) => (a.creatorId < b.creatorId ? -1 : 1));
}

export interface Allocation {
  creatorId: string;
  amount: Paise;
  /** This creator's claim as a share of everyone's, before any cap (0..1). */
  share: number;
  weight: number;
  qualifiedReach: number;
  bestLevel: LevelKey;
  byLevel: CreatorWeight['byLevel'];
  /** True when the per-creator cap reduced this amount. */
  capped: boolean;
}

export interface Distribution {
  allocations: Allocation[];
  /** Part of the pool nobody earned: rounding, the cap, or no one eligible. It stays unspent. */
  unspent: Paise;
  cappedAway: Paise;
  totalWeight: number;
}

/**
 * Shares a pool among creators by their claims, to the paisa, never paying out more than the
 * pool and never more than the cap to one person. The pieces plus `unspent` always equal the pool.
 */
export function distributePool(
  config: ReachConfig,
  pool: Paise,
  weights: readonly CreatorWeight[],
): Distribution {
  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
  const { shares, leftover } = allocate(
    pool,
    weights.map((w) => w.weight),
  );
  // The cap as a share of the pool, in whole paise (rounded down: the cap is a ceiling).
  const capPaise =
    (pool * BigInt(Math.round(config.rewards.maxCreatorShare * 1_000_000))) / 1_000_000n;
  const capped = capShares(shares, capPaise);
  const allocations = weights.map((w, i): Allocation => ({
    creatorId: w.creatorId,
    amount: capped.shares[i] as bigint,
    share: totalWeight > 0 ? w.weight / totalWeight : 0,
    weight: w.weight,
    qualifiedReach: w.qualifiedReach,
    bestLevel: w.bestLevel,
    byLevel: w.byLevel,
    capped: (capped.shares[i] as bigint) < (shares[i] as bigint),
  }));
  return {
    allocations,
    unspent: leftover + capped.removed,
    cappedAway: capped.removed,
    totalWeight,
  };
}

export interface EligibilityFacts {
  followers: number;
  accountAgeDays: number;
  publishedItems: number;
  qualifiedReach30d: number;
  accountActive: boolean;
}

export interface Requirement {
  key: string;
  have: number;
  need: number;
  met: boolean;
}

/** What a creator still needs before rewards accrue. Verification and payout rules are checked separately. */
export function evaluateEligibility(config: ReachConfig, f: EligibilityFacts) {
  const e = config.rewards.eligibility;
  const req = (key: string, have: number, need: number): Requirement => ({
    key,
    have,
    need,
    met: have >= need,
  });
  const requirements = [
    req('followers', f.followers, e.minFollowers),
    req('accountAgeDays', Math.floor(f.accountAgeDays), e.minAccountAgeDays),
    req('publishedItems', f.publishedItems, e.minPublishedItems),
    req('qualifiedReach30d', f.qualifiedReach30d, e.minQualifiedReach30d),
  ];
  return { eligible: f.accountActive && requirements.every((r) => r.met), requirements };
}
