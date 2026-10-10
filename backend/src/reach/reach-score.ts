import { LEVELS, type LevelKey, type ReachConfig, SIGNALS, type Signal } from './reach-config.js';

/** What has been counted for one post or reel. Every figure excludes events flagged as fake. */
export interface ReachAggregates {
  /** Distinct viewers with a qualified view. This is "qualified reach". */
  qualifiedViewers: number;
  /** Average share (0..1) of the content watched, over its watch events. */
  avgWatchRatio: number;
  /** Distinct viewers who watched to the end. */
  completions: number;
  /** Distinct viewers who shared / saved / left a meaningful comment. */
  shares: number;
  saves: number;
  comments: number;
  /** Distinct places among qualified viewers. */
  distinctDistricts: number;
  distinctStates: number;
  distinctCountries: number;
  /** Qualified viewers from outside the content's own country. */
  internationalViewers: number;
  /** Events set aside as suspected fake engagement (informational). */
  excludedEvents: number;
  /** 0..1, from the author's standing (account age, verification, history). */
  authorTrust: number;
}

export interface Signals {
  raw: Record<Signal, number>;
  /** Each raw value as a share of its target, held to 0..1. */
  normalised: Record<Signal, number>;
  /** weight x normalised x 100: what each signal added to the score. They sum to the score. */
  contributions: Record<Signal, number>;
}

export interface LevelRequirement {
  key: string;
  have: number;
  need: number;
  met: boolean;
}

export interface ScoreResult {
  qualifiedReach: number;
  /** The Qualified Reach Score, 0..100, two decimals. */
  score: number;
  signals: Signals;
  level: LevelKey;
  /** The next rung and what is still missing for it. `null` at the top. */
  next: { level: LevelKey; requirements: LevelRequirement[] } | null;
}

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(Math.max(v, 0), 1) : 0);
const round = (v: number, places: number): number => {
  const f = 10 ** places;
  return Math.round(v * f) / f;
};

/**
 * Turns counted events into the Qualified Reach Score and a level.
 *
 * The score is a weighted sum of seven signals, each first expressed as a share of a target
 * (and held at 100%), so no single signal, however inflated, can contribute more than its
 * weight. Raw views are not an input at all: only distinct, qualified viewers are, and
 * watch quality, distribution, saves, conversation, geographic spread and the author's
 * standing count alongside them.
 *
 * Pure and deterministic: the same counts and the same configuration give the same result,
 * which is what lets any stored score be reproduced from its configuration version.
 */
export function computeScore(config: ReachConfig, agg: ReachAggregates): ScoreResult {
  const t = config.targets;
  const viewers = Math.max(0, agg.qualifiedViewers);
  const denominator = Math.max(viewers, t.ratioFloorViewers);
  const completionRate = viewers > 0 ? clamp01(agg.completions / viewers) : 0;
  const watchQuality = clamp01(0.5 * clamp01(agg.avgWatchRatio) + 0.5 * completionRate);
  const geo =
    t.geoMix.districts * clamp01(agg.distinctDistricts / t.districts) +
    t.geoMix.states * clamp01(agg.distinctStates / t.states) +
    t.geoMix.countries * clamp01(agg.distinctCountries / t.countries);

  const raw: Record<Signal, number> = {
    qualifiedViewers: viewers,
    watchCompletion: watchQuality,
    shares: (agg.shares / denominator) * 1000,
    saves: (agg.saves / denominator) * 1000,
    comments: (agg.comments / denominator) * 1000,
    geoExpansion: geo,
    trust: clamp01(agg.authorTrust),
  };
  const normalised: Record<Signal, number> = {
    qualifiedViewers: clamp01(raw.qualifiedViewers / t.qualifiedViewers),
    watchCompletion: clamp01(raw.watchCompletion / t.watchQuality),
    shares: clamp01(raw.shares / t.sharesPer1000),
    saves: clamp01(raw.saves / t.savesPer1000),
    comments: clamp01(raw.comments / t.commentsPer1000),
    geoExpansion: clamp01(raw.geoExpansion),
    trust: clamp01(raw.trust),
  };
  const contributions = {} as Record<Signal, number>;
  let total = 0;
  for (const s of SIGNALS) {
    contributions[s] = config.weights[s] * normalised[s] * 100;
    total += contributions[s];
  }
  const score = round(Math.min(100, Math.max(0, total)), 2);

  const { level, next } = levelFor(config, {
    qualifiedReach: viewers,
    score,
    districts: agg.distinctDistricts,
    states: agg.distinctStates,
    countries: agg.distinctCountries,
    international: agg.internationalViewers,
  });
  return {
    qualifiedReach: viewers,
    score,
    signals: {
      raw: mapValues(raw, (v) => round(v, 4)),
      normalised: mapValues(normalised, (v) => round(v, 4)),
      contributions: mapValues(contributions, (v) => round(v, 4)),
    },
    level,
    next,
  };
}

function mapValues<K extends string>(
  o: Record<K, number>,
  f: (v: number) => number,
): Record<K, number> {
  return Object.fromEntries(Object.entries<number>(o).map(([k, v]) => [k, f(v)])) as Record<
    K,
    number
  >;
}

interface Standing {
  qualifiedReach: number;
  score: number;
  districts: number;
  states: number;
  countries: number;
  international: number;
}

/** The conditions of one rung, with where the content stands against each. */
export function requirementsFor(
  config: ReachConfig,
  level: LevelKey,
  s: Standing,
): LevelRequirement[] {
  const l = config.levels;
  const req = (key: string, have: number, need: number): LevelRequirement => ({
    key,
    have,
    need,
    met: have >= need,
  });
  switch (level) {
    case 'district':
      return [];
    case 'state':
      return [
        req('qualifiedReach', s.qualifiedReach, l.state.minQualifiedReach),
        req('score', s.score, l.state.minScore),
        req('districts', s.districts, l.state.minDistinctDistricts),
      ];
    case 'national':
      return [
        req('qualifiedReach', s.qualifiedReach, l.national.minQualifiedReach),
        req('score', s.score, l.national.minScore),
        req('states', s.states, l.national.minDistinctStates),
      ];
    case 'global':
      return [
        req('qualifiedReach', s.qualifiedReach, l.global.minQualifiedReach),
        req('score', s.score, l.global.minScore),
        req('countries', s.countries, l.global.minDistinctCountries),
        req('internationalViewers', s.international, l.global.minInternationalViewers),
      ];
  }
}

/**
 * The highest rung whose conditions are all met, climbing from the bottom: a rung is only
 * reached if every rung below it was too.
 */
export function levelFor(config: ReachConfig, s: Standing) {
  let level: LevelKey = 'district';
  for (const candidate of LEVELS.slice(1)) {
    if (requirementsFor(config, candidate, s).every((r) => r.met)) level = candidate;
    else break;
  }
  const nextLevel = LEVELS[LEVELS.indexOf(level) + 1];
  return {
    level,
    next: nextLevel
      ? { level: nextLevel, requirements: requirementsFor(config, nextLevel, s) }
      : null,
  };
}

const ORDER: Record<LevelKey, number> = { district: 0, state: 1, national: 2, global: 3 };

/**
 * A rung, once earned, is kept: a quiet week or a change of settings does not demote content.
 * The one exception is fake engagement. If events have newly been set aside, the level is
 * recomputed from what is left, so a boosted post cannot keep a rung it was pushed up to.
 */
export function applyRatchet(
  current: LevelKey,
  computed: LevelKey,
  newlyExcludedEvents: boolean,
): LevelKey {
  if (newlyExcludedEvents) return computed;
  return ORDER[computed] >= ORDER[current] ? computed : current;
}

/**
 * A 0..1 standing for an author, used as the trust signal. Newer accounts, unverified contact
 * details and a risky history all lower it; it is never shown to the author or anyone else.
 */
export function authorTrust(input: {
  accountAgeDays: number;
  contactVerified: boolean;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  restricted: boolean;
}): number {
  if (input.restricted) return 0;
  const age = clamp01(input.accountAgeDays / 180);
  const verified = input.contactVerified ? 1 : 0.4;
  const risk = input.risk === 'LOW' ? 1 : input.risk === 'MEDIUM' ? 0.5 : 0.1;
  return round(0.4 * age + 0.3 * verified + 0.3 * risk, 4);
}
