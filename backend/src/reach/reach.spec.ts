import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REACH_CONFIG,
  LEVELS,
  type ReachConfig,
  SIGNALS,
  publicLadder,
  validateReachConfig,
} from './reach-config.js';
import {
  fraudScore,
  isExcluded,
  isMeaningfulComment,
  viewQualifies,
  watchRatio,
} from './reach-events.rules.js';
import {
  type ReachAggregates,
  applyRatchet,
  authorTrust,
  computeScore,
  levelFor,
} from './reach-score.js';

const config = (patch: (c: ReachConfig) => void = () => undefined): ReachConfig => {
  const c = structuredClone(DEFAULT_REACH_CONFIG);
  patch(c);
  return c;
};

const agg = (over: Partial<ReachAggregates> = {}): ReachAggregates => ({
  qualifiedViewers: 0,
  avgWatchRatio: 0,
  completions: 0,
  shares: 0,
  saves: 0,
  comments: 0,
  distinctDistricts: 0,
  distinctStates: 0,
  distinctCountries: 0,
  internationalViewers: 0,
  excludedEvents: 0,
  authorTrust: 0,
  ...over,
});

/** Everything at or beyond its target. */
const perfect = (over: Partial<ReachAggregates> = {}): ReachAggregates =>
  agg({
    qualifiedViewers: 2_000_000,
    avgWatchRatio: 1,
    completions: 2_000_000,
    shares: 100_000,
    saves: 200_000,
    comments: 100_000,
    distinctDistricts: 100,
    distinctStates: 20,
    distinctCountries: 10,
    internationalViewers: 50_000,
    authorTrust: 1,
    ...over,
  });

describe('the Reach configuration', () => {
  it('ships a default that passes its own validation', () => {
    const result = validateReachConfig(DEFAULT_REACH_CONFIG);
    expect(result.ok).toBe(true);
  });

  it('starts from the brief: seven signals adding up to one, and the demo ladder', () => {
    const w = DEFAULT_REACH_CONFIG.weights;
    expect(SIGNALS.map((s) => w[s])).toEqual([0.25, 0.25, 0.15, 0.1, 0.1, 0.1, 0.05]);
    expect(SIGNALS.reduce((sum, s) => sum + w[s], 0)).toBeCloseTo(1, 12);
    expect(publicLadder(DEFAULT_REACH_CONFIG).levels).toEqual([
      { key: 'DISTRICT', minQualifiedReach: 0 },
      { key: 'STATE', minQualifiedReach: 10_001 },
      { key: 'NATIONAL', minQualifiedReach: 100_001 },
      { key: 'GLOBAL', minQualifiedReach: 1_000_001 },
    ]);
  });

  const problems = (patch: (c: ReachConfig) => void): string => {
    const r = validateReachConfig(config(patch));
    return r.ok ? '' : r.issues.map((i) => `${i.path}: ${i.message}`).join('\n');
  };

  it('refuses weights that do not add up to one, naming the problem', () => {
    expect(problems((c) => (c.weights.shares = 0.3))).toMatch(/weights: weights must add up to 1/);
    expect(problems((c) => (c.weights.trust = -0.05))).toMatch(/weights\.trust/);
    expect(problems((c) => (c.targets.geoMix.countries = 0.5))).toMatch(/geoMix must add up to 1/);
  });

  it('refuses a ladder that does not climb', () => {
    expect(problems((c) => (c.levels.national.minQualifiedReach = 5000))).toMatch(
      /levels\.national\.minQualifiedReach/,
    );
    expect(problems((c) => (c.levels.district.minQualifiedReach = 1))).toMatch(/must be 0/);
    expect(problems((c) => (c.levels.global.minScore = 10))).toMatch(/levels\.global\.minScore/);
  });

  it('refuses rewards that pay a lower rung more than a higher one', () => {
    expect(problems((c) => (c.rewards.levelMultipliers.national = 0.5))).toMatch(
      /never be worth less/,
    );
  });

  it('refuses nonsense numbers, unknown versions and unknown fields', () => {
    expect(problems((c) => (c.targets.qualifiedViewers = 0))).toMatch(/targets\.qualifiedViewers/);
    expect(problems((c) => (c.fraud.excludeAtOrAbove = 5))).toMatch(/fraud\.excludeAtOrAbove/);
    expect(problems((c) => (c.rewards.maxCreatorShare = 0))).toMatch(/maxCreatorShare/);
    expect(problems((c) => (c.rewards.maxCreatorShare = 1.5))).toMatch(/maxCreatorShare/);
    expect(problems((c) => ((c as { schemaVersion: number }).schemaVersion = 2))).toMatch(
      /schemaVersion/,
    );
    expect(validateReachConfig({ ...DEFAULT_REACH_CONFIG, weights: undefined }).ok).toBe(false);
    expect(validateReachConfig(null).ok).toBe(false);
    expect(validateReachConfig('config').ok).toBe(false);
  });

  it('reports every problem at once', () => {
    const r = validateReachConfig(
      config((c) => {
        c.weights.shares = 0.9;
        c.levels.state.minQualifiedReach = 0;
        c.rewards.maxCreatorShare = 2;
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.length).toBeGreaterThanOrEqual(3);
  });

  it('shows the app only the ladder, not weights, fraud limits or rewards', () => {
    const shown = JSON.stringify(publicLadder(DEFAULT_REACH_CONFIG));
    expect(shown).not.toMatch(/weight|fraud|reward|multiplier|target/i);
  });
});

describe('the Qualified Reach Score', () => {
  it('is zero for nothing, and 100 when every signal is at its target', () => {
    expect(computeScore(DEFAULT_REACH_CONFIG, agg()).score).toBe(0);
    expect(computeScore(DEFAULT_REACH_CONFIG, perfect()).score).toBe(100);
  });

  it('adds up exactly: the contributions are the score', () => {
    const r = computeScore(
      DEFAULT_REACH_CONFIG,
      agg({
        qualifiedViewers: 5000,
        avgWatchRatio: 0.6,
        completions: 2000,
        shares: 40,
        saves: 90,
        comments: 30,
        distinctDistricts: 5,
        distinctStates: 2,
        distinctCountries: 1,
        authorTrust: 0.8,
      }),
    );
    const sum = SIGNALS.reduce((s, k) => s + r.signals.contributions[k], 0);
    expect(sum).toBeCloseTo(r.score, 1);
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(100);
    for (const s of SIGNALS) {
      expect(r.signals.normalised[s]).toBeGreaterThanOrEqual(0);
      expect(r.signals.normalised[s]).toBeLessThanOrEqual(1);
      // No signal can add more than its weight.
      expect(r.signals.contributions[s]).toBeLessThanOrEqual(
        DEFAULT_REACH_CONFIG.weights[s] * 100 + 1e-9,
      );
    }
  });

  it('cannot be bought by one signal: inflating a single count stops at its weight', () => {
    const base = computeScore(DEFAULT_REACH_CONFIG, agg({ qualifiedViewers: 100_000 }));
    const absurd = computeScore(DEFAULT_REACH_CONFIG, agg({ qualifiedViewers: 900_000_000 }));
    expect(absurd.score).toBe(base.score); // already at its target
    expect(base.score).toBe(25);
    const flooded = computeScore(
      DEFAULT_REACH_CONFIG,
      agg({ qualifiedViewers: 1000, shares: 1_000_000 }),
    );
    expect(flooded.signals.contributions.shares).toBeCloseTo(15, 6);
  });

  it('judges conversation and sharing as a rate, not a count, with a floor so a handful cannot look like a trend', () => {
    // Ten viewers, all of whom shared: 100% would be absurd, so ratios are over at least 100 viewers.
    const few = computeScore(DEFAULT_REACH_CONFIG, agg({ qualifiedViewers: 10, shares: 10 }));
    expect(few.signals.raw.shares).toBeCloseTo(100, 6); // 10 / 100 * 1000
    const many = computeScore(DEFAULT_REACH_CONFIG, agg({ qualifiedViewers: 10_000, shares: 10 }));
    expect(many.signals.raw.shares).toBeCloseTo(1, 6);
  });

  it('values watch quality, not just reach', () => {
    const watched = computeScore(
      DEFAULT_REACH_CONFIG,
      agg({ qualifiedViewers: 1000, avgWatchRatio: 0.9, completions: 800 }),
    );
    const skimmed = computeScore(
      DEFAULT_REACH_CONFIG,
      agg({ qualifiedViewers: 1000, avgWatchRatio: 0.1, completions: 20 }),
    );
    expect(watched.score).toBeGreaterThan(skimmed.score);
  });

  it('values spread across places', () => {
    const wide = computeScore(
      DEFAULT_REACH_CONFIG,
      agg({
        qualifiedViewers: 1000,
        distinctDistricts: 20,
        distinctStates: 8,
        distinctCountries: 3,
      }),
    );
    const local = computeScore(
      DEFAULT_REACH_CONFIG,
      agg({
        qualifiedViewers: 1000,
        distinctDistricts: 1,
        distinctStates: 1,
        distinctCountries: 1,
      }),
    );
    expect(wide.signals.contributions.geoExpansion).toBeCloseTo(10, 6);
    expect(wide.score).toBeGreaterThan(local.score);
  });

  it('survives nonsense input without producing NaN or going out of range', () => {
    const r = computeScore(
      DEFAULT_REACH_CONFIG,
      agg({
        qualifiedViewers: -5,
        avgWatchRatio: Number.NaN,
        completions: 10,
        shares: -3,
        authorTrust: 7,
      }),
    );
    expect(Number.isFinite(r.score)).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it('is deterministic: the same counts and configuration always give the same result', () => {
    const a = agg({
      qualifiedViewers: 12_345,
      avgWatchRatio: 0.55,
      completions: 4000,
      shares: 120,
      saves: 300,
      comments: 90,
      distinctDistricts: 7,
      distinctStates: 3,
      authorTrust: 0.7,
    });
    expect(computeScore(DEFAULT_REACH_CONFIG, a)).toEqual(
      computeScore(structuredClone(DEFAULT_REACH_CONFIG), structuredClone(a)),
    );
  });

  it('follows the configuration: changing a weight changes the answer, and nothing else does', () => {
    const a = agg({
      qualifiedViewers: 50_000,
      shares: 2000,
      avgWatchRatio: 0.5,
      completions: 10_000,
    });
    const reweighted = config((c) => {
      c.weights.qualifiedViewers = 0.05;
      c.weights.shares = 0.35;
    });
    expect(computeScore(reweighted, a).score).not.toBe(computeScore(DEFAULT_REACH_CONFIG, a).score);
  });
});

describe('climbing the Reach Ladder', () => {
  const stand = (over: Partial<Parameters<typeof levelFor>[1]> = {}) => ({
    qualifiedReach: 0,
    score: 0,
    districts: 0,
    states: 0,
    countries: 0,
    international: 0,
    ...over,
  });

  it('starts at District, with the State rung as the next goal and what is missing for it', () => {
    const r = levelFor(
      DEFAULT_REACH_CONFIG,
      stand({ qualifiedReach: 500, score: 12, districts: 1 }),
    );
    expect(r.level).toBe('district');
    expect(r.next?.level).toBe('state');
    expect(r.next?.requirements).toEqual([
      { key: 'qualifiedReach', have: 500, need: 10_001, met: false },
      { key: 'score', have: 12, need: 40, met: false },
      { key: 'districts', have: 1, need: 3, met: false },
    ]);
  });

  it('needs every condition of a rung, not just the reach number', () => {
    const enoughReach = { qualifiedReach: 20_000, score: 50, districts: 5 };
    expect(levelFor(DEFAULT_REACH_CONFIG, stand(enoughReach)).level).toBe('state');
    expect(levelFor(DEFAULT_REACH_CONFIG, stand({ ...enoughReach, score: 39.99 })).level).toBe(
      'district',
    ); // quality too low
    expect(levelFor(DEFAULT_REACH_CONFIG, stand({ ...enoughReach, districts: 2 })).level).toBe(
      'district',
    ); // all from one corner
  });

  it('unlocks at the exact configured number, not one below', () => {
    const at = (qualifiedReach: number) =>
      levelFor(
        DEFAULT_REACH_CONFIG,
        stand({
          qualifiedReach,
          score: 90,
          districts: 9,
          states: 9,
          countries: 9,
          international: 9999,
        }),
      ).level;
    expect(at(10_000)).toBe('district');
    expect(at(10_001)).toBe('state');
    expect(at(100_000)).toBe('state');
    expect(at(100_001)).toBe('national');
    expect(at(1_000_000)).toBe('national');
    expect(at(1_000_001)).toBe('global');
  });

  it('reaches Global only with a real international audience', () => {
    const big = {
      qualifiedReach: 2_000_000,
      score: 90,
      districts: 50,
      states: 12,
      countries: 1,
      international: 0,
    };
    expect(levelFor(DEFAULT_REACH_CONFIG, stand(big)).level).toBe('national');
    expect(
      levelFor(DEFAULT_REACH_CONFIG, stand({ ...big, countries: 3, international: 999 })).level,
    ).toBe('national');
    expect(
      levelFor(DEFAULT_REACH_CONFIG, stand({ ...big, countries: 3, international: 1000 })).level,
    ).toBe('global');
    expect(
      levelFor(DEFAULT_REACH_CONFIG, stand({ ...big, countries: 3, international: 1000 })).next,
    ).toBeNull();
  });

  it('cannot skip a rung', () => {
    // Plenty for Global, but the State conditions are not met.
    const r = levelFor(
      DEFAULT_REACH_CONFIG,
      stand({
        qualifiedReach: 5_000_000,
        score: 99,
        districts: 1,
        states: 20,
        countries: 5,
        international: 90_000,
      }),
    );
    expect(r.level).toBe('district');
  });

  it('follows the configuration', () => {
    const easy = config((c) => (c.levels.state.minQualifiedReach = 100));
    expect(levelFor(easy, stand({ qualifiedReach: 100, score: 40, districts: 3 })).level).toBe(
      'state',
    );
    expect(
      levelFor(DEFAULT_REACH_CONFIG, stand({ qualifiedReach: 100, score: 40, districts: 3 })).level,
    ).toBe('district');
    expect(LEVELS).toEqual(['district', 'state', 'national', 'global']);
  });

  it('keeps a rung once earned, unless fake engagement has just been removed', () => {
    expect(applyRatchet('state', 'district', false)).toBe('state');
    expect(applyRatchet('state', 'national', false)).toBe('national');
    expect(applyRatchet('district', 'district', false)).toBe('district');
    expect(applyRatchet('national', 'district', true)).toBe('district'); // pushed up by fakes, taken back
    expect(applyRatchet('national', 'state', true)).toBe('state');
    expect(applyRatchet('state', 'national', true)).toBe('national');
  });
});

describe('author trust', () => {
  it('is highest for an established, verified, low-risk account', () => {
    expect(
      authorTrust({ accountAgeDays: 400, contactVerified: true, risk: 'LOW', restricted: false }),
    ).toBe(1);
  });
  it('drops for new, unverified or risky accounts, and is zero when restricted', () => {
    const base = {
      accountAgeDays: 400,
      contactVerified: true,
      risk: 'LOW' as const,
      restricted: false,
    };
    expect(authorTrust({ ...base, accountAgeDays: 0 })).toBeLessThan(authorTrust(base));
    expect(authorTrust({ ...base, contactVerified: false })).toBeLessThan(authorTrust(base));
    expect(authorTrust({ ...base, risk: 'HIGH' })).toBeLessThan(
      authorTrust({ ...base, risk: 'MEDIUM' }),
    );
    expect(authorTrust({ ...base, restricted: true })).toBe(0);
  });
});

describe('what counts as a qualified view', () => {
  const view = (over: Partial<Parameters<typeof viewQualifies>[1]> = {}) => ({
    kind: 'reel' as const,
    watchMs: 0,
    durationMs: 30_000,
    viewerAccountAgeHours: 500,
    viewerVerified: true,
    ...over,
  });

  it('needs a few seconds of a reel, or half of a short one', () => {
    expect(viewQualifies(DEFAULT_REACH_CONFIG, view({ watchMs: 2999 }))).toBe(false);
    expect(viewQualifies(DEFAULT_REACH_CONFIG, view({ watchMs: 3000 }))).toBe(true);
    // A 4-second reel: half of it is enough, 2 s < 3 s.
    expect(viewQualifies(DEFAULT_REACH_CONFIG, view({ durationMs: 4000, watchMs: 2000 }))).toBe(
      true,
    );
    expect(viewQualifies(DEFAULT_REACH_CONFIG, view({ durationMs: 4000, watchMs: 1900 }))).toBe(
      false,
    );
  });

  it('needs time on screen for a post', () => {
    expect(
      viewQualifies(DEFAULT_REACH_CONFIG, view({ kind: 'post', durationMs: 0, watchMs: 1999 })),
    ).toBe(false);
    expect(
      viewQualifies(DEFAULT_REACH_CONFIG, view({ kind: 'post', durationMs: 0, watchMs: 2000 })),
    ).toBe(true);
  });

  it('does not count brand-new or unverified accounts', () => {
    expect(
      viewQualifies(DEFAULT_REACH_CONFIG, view({ watchMs: 9000, viewerAccountAgeHours: 23 })),
    ).toBe(false);
    expect(
      viewQualifies(DEFAULT_REACH_CONFIG, view({ watchMs: 9000, viewerVerified: false })),
    ).toBe(false);
    const lax = config((c) => (c.qualification.requireVerifiedViewer = false));
    expect(viewQualifies(lax, view({ watchMs: 9000, viewerVerified: false }))).toBe(true);
  });

  it('holds watch time to the loop limit', () => {
    expect(watchRatio(15_000, 30_000, 3)).toBe(0.5);
    expect(watchRatio(500_000, 30_000, 3)).toBe(1);
    expect(watchRatio(-5, 30_000, 3)).toBe(0);
    expect(watchRatio(5000, 0, 3)).toBe(0);
  });

  it('calls a comment meaningful at the length, and not filler', () => {
    expect(isMeaningfulComment(DEFAULT_REACH_CONFIG, 'great video')).toBe(false); // 11 chars
    expect(isMeaningfulComment(DEFAULT_REACH_CONFIG, 'really enjoyed this one')).toBe(true);
    expect(isMeaningfulComment(DEFAULT_REACH_CONFIG, 'aaaaaaaaaaaaaaaaaaaa')).toBe(false);
    expect(isMeaningfulComment(DEFAULT_REACH_CONFIG, 'ok ok ok ok ok ok ok')).toBe(false);
    expect(isMeaningfulComment(DEFAULT_REACH_CONFIG, '            hi            ')).toBe(false);
  });
});

describe('spotting fake engagement', () => {
  const quiet = {
    eventsByViewerLastMinute: 3,
    eventsByDeviceLastMinute: 3,
    viewersOnDeviceForContentToday: 1,
    sameDeviceAsAuthor: false,
    viewerRisk: 'LOW' as const,
    implausibleWatch: false,
  };

  it('leaves ordinary use alone', () => {
    const r = fraudScore(DEFAULT_REACH_CONFIG, quiet);
    expect(r).toEqual({ score: 0, reasons: [] });
    expect(isExcluded(DEFAULT_REACH_CONFIG, r.score)).toBe(false);
  });

  it('sets aside an author engaging with their own content from their own device', () => {
    const r = fraudScore(DEFAULT_REACH_CONFIG, { ...quiet, sameDeviceAsAuthor: true });
    expect(r.reasons).toEqual(['author_device']);
    expect(isExcluded(DEFAULT_REACH_CONFIG, r.score)).toBe(true);
  });

  it('sets aside many accounts on one device and machine-speed bursts', () => {
    expect(
      isExcluded(
        DEFAULT_REACH_CONFIG,
        fraudScore(DEFAULT_REACH_CONFIG, { ...quiet, viewersOnDeviceForContentToday: 4 }).score,
      ),
    ).toBe(false); // 45 alone is under 60
    const ring = fraudScore(DEFAULT_REACH_CONFIG, {
      ...quiet,
      viewersOnDeviceForContentToday: 4,
      eventsByDeviceLastMinute: 500,
    });
    expect(ring.reasons).toEqual(['device_velocity', 'shared_device']);
    expect(isExcluded(DEFAULT_REACH_CONFIG, ring.score)).toBe(true);
    const burst = fraudScore(DEFAULT_REACH_CONFIG, {
      ...quiet,
      eventsByViewerLastMinute: 500,
      implausibleWatch: true,
    });
    expect(isExcluded(DEFAULT_REACH_CONFIG, burst.score)).toBe(true);
  });

  it('adds up risk signals, capped at 100', () => {
    const everything = fraudScore(DEFAULT_REACH_CONFIG, {
      eventsByViewerLastMinute: 999,
      eventsByDeviceLastMinute: 999,
      viewersOnDeviceForContentToday: 99,
      sameDeviceAsAuthor: true,
      viewerRisk: 'HIGH',
      implausibleWatch: true,
    });
    expect(everything.score).toBe(100);
    expect(everything.reasons).toHaveLength(6);
  });

  it('follows the threshold in the configuration', () => {
    const strict = config((c) => (c.fraud.excludeAtOrAbove = 30));
    const r = fraudScore(strict, { ...quiet, implausibleWatch: true }); // 30
    expect(isExcluded(strict, r.score)).toBe(true);
    expect(isExcluded(DEFAULT_REACH_CONFIG, r.score)).toBe(false);
  });
});
