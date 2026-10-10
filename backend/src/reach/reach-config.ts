import { z } from 'zod';

/**
 * The Reach Engine's settings: every weight, threshold and multiplier, in one document.
 *
 * Nothing here is a business rule carved in stone. The numbers are starting points taken from
 * the product brief (a seven-signal score; District, State, National and Global unlocks) and
 * are meant to be tuned by staff, one **immutable version** at a time. A version is validated
 * before it is saved, can be edited only while it is a draft, and every score records the
 * version it was computed with, so any past result can be reproduced exactly.
 *
 * The mobile app never hard-codes these. It reads the parts that are safe to show from
 * `GET /reach/ladder`.
 */

const fraction = z.number().min(0).max(1);
const positive = z.number().positive().finite();
const count = z.number().int().min(0).max(1_000_000_000);

export const SIGNALS = [
  'qualifiedViewers',
  'watchCompletion',
  'shares',
  'saves',
  'comments',
  'geoExpansion',
  'trust',
] as const;
export type Signal = (typeof SIGNALS)[number];

export const LEVELS = ['district', 'state', 'national', 'global'] as const;
export type LevelKey = (typeof LEVELS)[number];

const weights = z.object({
  qualifiedViewers: fraction,
  watchCompletion: fraction,
  shares: fraction,
  saves: fraction,
  comments: fraction,
  geoExpansion: fraction,
  trust: fraction,
});

const level = <T extends z.ZodRawShape>(extra: T) =>
  z.object({ minQualifiedReach: count, minScore: z.number().min(0).max(100), ...extra });

export const reachConfigSchema = z
  .object({
    schemaVersion: z.literal(1),

    /** How much each signal counts towards the 0-100 Qualified Reach Score. Must add up to 1. */
    weights,

    /**
     * What counts as "full marks" for each signal. A signal's value is divided by its target and
     * held at 1, so a number far beyond the target cannot buy more than the signal's weight.
     */
    targets: z.object({
      /** Unique qualified viewers. */
      qualifiedViewers: positive,
      /** Watch quality (see `watchQuality`) at which the watch signal is full. */
      watchQuality: fraction.refine((v) => v > 0, 'must be above 0'),
      /** Shares / saves / meaningful comments per 1,000 qualified viewers. */
      sharesPer1000: positive,
      savesPer1000: positive,
      commentsPer1000: positive,
      /** Distinct places among qualified viewers that fill the geographic signal. */
      districts: positive,
      states: positive,
      countries: positive,
      /** How the three combine into the geographic signal. Must add up to 1. */
      geoMix: z.object({ districts: fraction, states: fraction, countries: fraction }),
      /** Ratios are computed over at least this many viewers, so a handful cannot look like a trend. */
      ratioFloorViewers: positive,
    }),

    /** What makes a view count as a *qualified* view. */
    qualification: z.object({
      /** A reel view qualifies once this much has been watched... */
      minWatchMs: count,
      /** ...or this share of the reel (so a very short reel can qualify). */
      minWatchRatio: fraction,
      /** A post (photo or text) qualifies after this long on screen. */
      minPostDwellMs: count,
      /** Watching at least this share of a reel counts as completing it. */
      completeRatio: fraction,
      /** Views from accounts younger than this do not qualify. */
      minViewerAccountAgeHours: z
        .number()
        .min(0)
        .max(24 * 365),
      /** Views from accounts with no verified e-mail or phone do not qualify. */
      requireVerifiedViewer: z.boolean(),
      /** A comment counts as meaningful at this length (after cleaning) and no less. */
      meaningfulCommentMinChars: z.number().int().min(1).max(500),
    }),

    /** Suspected fake engagement. Events at or above the threshold are kept but excluded from every count. */
    fraud: z.object({
      excludeAtOrAbove: z.number().int().min(20).max(100),
      maxEventsPerViewerPerMinute: z.number().int().min(1).max(10_000),
      maxEventsPerDevicePerMinute: z.number().int().min(1).max(10_000),
      /** Different accounts using one device to engage with the same content, per day. */
      maxViewersPerDevicePerContentPerDay: z.number().int().min(1).max(1000),
      /** The most a view may last, as a multiple of the reel's length (replays count, runaway timers do not). */
      maxWatchLoops: z.number().min(1).max(10),
    }),

    /** The conditions for each rung. A level needs all of its own conditions and those of the rungs below. */
    levels: z.object({
      district: level({}),
      state: level({ minDistinctDistricts: count }),
      national: level({ minDistinctStates: count }),
      global: level({ minDistinctCountries: count, minInternationalViewers: count }),
    }),

    /** Creator rewards (see the earnings module). */
    rewards: z.object({
      /** How much a qualified viewer is worth at each rung, relative to the District rung. */
      levelMultipliers: z.object({
        district: positive,
        state: positive,
        national: positive,
        global: positive,
      }),
      /** Content scoring below this earns nothing, however many views it has. */
      minScoreForReward: z.number().min(0).max(100),
      /** No one creator may take more than this share of a cycle's pool. The rest stays unspent. */
      maxCreatorShare: z.number().gt(0).max(1),
      /** What a creator needs before rewards accrue. Verification and payout rules are separate (KYC, payouts). */
      eligibility: z.object({
        minFollowers: count,
        minAccountAgeDays: z.number().int().min(0).max(3650),
        minPublishedItems: count,
        minQualifiedReach30d: count,
      }),
    }),
  })
  .superRefine((c, ctx) => {
    const add = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });

    const sum = SIGNALS.reduce((s, k) => s + c.weights[k], 0);
    if (Math.abs(sum - 1) > 1e-6) {
      add(['weights'], `weights must add up to 1 (they add up to ${Math.round(sum * 1e6) / 1e6})`);
    }
    const geo = c.targets.geoMix.districts + c.targets.geoMix.states + c.targets.geoMix.countries;
    if (Math.abs(geo - 1) > 1e-6) {
      add(
        ['targets', 'geoMix'],
        `geoMix must add up to 1 (it adds up to ${Math.round(geo * 1e6) / 1e6})`,
      );
    }

    const { district, state, national, global } = c.levels;
    if (district.minQualifiedReach !== 0) {
      add(
        ['levels', 'district', 'minQualifiedReach'],
        'the District rung is where everything starts: it must be 0',
      );
    }
    if (district.minScore !== 0) add(['levels', 'district', 'minScore'], 'must be 0');
    const rungs = [district, state, national, global];
    for (let i = 1; i < rungs.length; i++) {
      const lower = rungs[i - 1] as (typeof rungs)[number];
      const upper = rungs[i] as (typeof rungs)[number];
      const name = LEVELS[i] as LevelKey;
      if (upper.minQualifiedReach <= lower.minQualifiedReach) {
        add(
          ['levels', name, 'minQualifiedReach'],
          'each rung must need more qualified reach than the one below',
        );
      }
      if (upper.minScore < lower.minScore) {
        add(
          ['levels', name, 'minScore'],
          'each rung must need at least the score of the one below',
        );
      }
    }
    // A rung cannot ask for more places than the audience that unlocks it could possibly cover.
    if (state.minDistinctDistricts > state.minQualifiedReach) {
      add(
        ['levels', 'state', 'minDistinctDistricts'],
        'cannot exceed the qualified reach the rung needs',
      );
    }
    if (global.minInternationalViewers > global.minQualifiedReach) {
      add(
        ['levels', 'global', 'minInternationalViewers'],
        'cannot exceed the qualified reach the rung needs',
      );
    }

    const m = c.rewards.levelMultipliers;
    if (!(m.district <= m.state && m.state <= m.national && m.national <= m.global)) {
      add(
        ['rewards', 'levelMultipliers'],
        'a higher rung must never be worth less than a lower one',
      );
    }
  });

export type ReachConfig = z.infer<typeof reachConfigSchema>;

export interface ConfigIssue {
  path: string;
  message: string;
}

/** Checks a configuration before it is saved. Returns every problem found, not just the first. */
export function validateReachConfig(
  raw: unknown,
): { ok: true; config: ReachConfig } | { ok: false; issues: ConfigIssue[] } {
  const result = reachConfigSchema.safeParse(raw);
  if (result.success) return { ok: true, config: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  };
}

/**
 * The starting configuration. The weights are the product brief's illustrative model (viewers
 * 25%, watch 25%, shares 15%, saves 10%, comments 10%, geographic expansion 10%, trust 5%);
 * the thresholds are the demo ladder the app already shows (State 10,001, National 100,001,
 * Global 1,000,001). The brief says the weights are "starting points, not final economics";
 * these are placeholders to be tuned by staff and validated by experiment, not recommendations.
 */
export const DEFAULT_REACH_CONFIG: ReachConfig = {
  schemaVersion: 1,
  weights: {
    qualifiedViewers: 0.25,
    watchCompletion: 0.25,
    shares: 0.15,
    saves: 0.1,
    comments: 0.1,
    geoExpansion: 0.1,
    trust: 0.05,
  },
  targets: {
    qualifiedViewers: 100_000,
    watchQuality: 0.7,
    sharesPer1000: 20,
    savesPer1000: 40,
    commentsPer1000: 15,
    districts: 20,
    states: 8,
    countries: 3,
    geoMix: { districts: 0.4, states: 0.4, countries: 0.2 },
    ratioFloorViewers: 100,
  },
  qualification: {
    minWatchMs: 3000,
    minWatchRatio: 0.5,
    minPostDwellMs: 2000,
    completeRatio: 0.9,
    minViewerAccountAgeHours: 24,
    requireVerifiedViewer: true,
    meaningfulCommentMinChars: 12,
  },
  fraud: {
    excludeAtOrAbove: 60,
    maxEventsPerViewerPerMinute: 60,
    maxEventsPerDevicePerMinute: 120,
    maxViewersPerDevicePerContentPerDay: 3,
    maxWatchLoops: 3,
  },
  levels: {
    district: { minQualifiedReach: 0, minScore: 0 },
    state: { minQualifiedReach: 10_001, minScore: 40, minDistinctDistricts: 3 },
    national: { minQualifiedReach: 100_001, minScore: 55, minDistinctStates: 3 },
    global: {
      minQualifiedReach: 1_000_001,
      minScore: 70,
      minDistinctCountries: 2,
      minInternationalViewers: 1000,
    },
  },
  rewards: {
    levelMultipliers: { district: 1, state: 1.5, national: 2.5, global: 4 },
    minScoreForReward: 20,
    maxCreatorShare: 0.25,
    eligibility: {
      minFollowers: 100,
      minAccountAgeDays: 30,
      minPublishedItems: 3,
      minQualifiedReach30d: 1000,
    },
  },
};

/**
 * The part of the configuration a person may see: what unlocks each rung, so the app can show
 * progress without hard-coding numbers. Weights, fraud limits and reward economics stay private
 * (publishing them would invite gaming).
 */
export function publicLadder(config: ReachConfig) {
  const { district, state, national, global } = config.levels;
  return {
    levels: [
      { key: 'DISTRICT', minQualifiedReach: district.minQualifiedReach },
      { key: 'STATE', minQualifiedReach: state.minQualifiedReach },
      { key: 'NATIONAL', minQualifiedReach: national.minQualifiedReach },
      { key: 'GLOBAL', minQualifiedReach: global.minQualifiedReach },
    ],
  };
}

export interface ConfigChange {
  path: string;
  from: unknown;
  to: unknown;
}

/** Every setting that differs between two configurations, for reviewing a draft before it goes live. */
export function diffConfig(from: unknown, to: unknown, path = ''): ConfigChange[] {
  const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);
  if (isObject(from) && isObject(to)) {
    return [...new Set([...Object.keys(from), ...Object.keys(to)])]
      .sort()
      .flatMap((key) => diffConfig(from[key], to[key], path ? `${path}.${key}` : key));
  }
  return JSON.stringify(from) === JSON.stringify(to) ? [] : [{ path, from, to }];
}
