import { describe, expect, it } from 'vitest';
import { allocate, capShares, formatRupees, fromDatabase, parseRupees } from '../ledger/money.js';
import { DEFAULT_REACH_CONFIG, type ReachConfig } from '../reach/reach-config.js';
import {
  type ContentContribution,
  creatorWeights,
  distributePool,
  evaluateEligibility,
} from './earnings-calc.js';

const config = (patch: (c: ReachConfig) => void = () => undefined): ReachConfig => {
  const c = structuredClone(DEFAULT_REACH_CONFIG);
  patch(c);
  return c;
};

describe('money', () => {
  it('reads and writes amounts exactly', () => {
    expect(parseRupees('123.45')).toBe(12_345n);
    expect(parseRupees('123.4')).toBe(12_340n);
    expect(parseRupees('123')).toBe(12_300n);
    expect(parseRupees('0.05')).toBe(5n);
    expect(parseRupees('-7.50')).toBe(-750n);
    expect(formatRupees(12_345n)).toBe('123.45');
    expect(formatRupees(5n)).toBe('0.05');
    expect(formatRupees(0n)).toBe('0.00');
    expect(formatRupees(-750n)).toBe('-7.50');
    expect(formatRupees(parseRupees('99999999999999.99'))).toBe('99999999999999.99');
  });

  it('refuses what is not an amount instead of rounding it', () => {
    for (const bad of [
      '1.234',
      '1e3',
      '',
      'abc',
      '1,000',
      '--5',
      '1.',
      '.5',
      '0x10',
      '99999999999999999.00',
    ]) {
      expect(() => parseRupees(bad), bad).toThrow(RangeError);
    }
  });

  it('has no floating-point drift: 0.1 + 0.2 is 0.30', () => {
    expect(formatRupees(parseRupees('0.10') + parseRupees('0.20'))).toBe('0.30');
    let total = 0n;
    for (let i = 0; i < 1000; i++) total += parseRupees('0.10');
    expect(formatRupees(total)).toBe('100.00');
  });

  it('reads database values in any of their forms', () => {
    expect(fromDatabase('1234.50')).toBe(123_450n);
    expect(fromDatabase('1234.5')).toBe(123_450n);
    expect(fromDatabase('1234')).toBe(123_400n);
    expect(fromDatabase({ toString: () => '0.07' })).toBe(7n);
    expect(fromDatabase(null)).toBe(0n);
  });
});

describe('sharing a pool', () => {
  it('splits in proportion and adds up to the pool exactly', () => {
    const { shares, leftover } = allocate(10_000n, [1, 1, 1]);
    expect(shares.reduce((a, b) => a + b, 0n)).toBe(10_000n);
    expect(leftover).toBe(0n);
    // 100.00 over three equal claims: the odd paisa goes somewhere, deterministically.
    expect([...shares].sort()).toEqual([3333n, 3333n, 3334n]);
    expect(allocate(10_000n, [1, 1, 1]).shares).toEqual(shares);
  });

  it('never loses or invents a paisa, for any pool and any weights', () => {
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let run = 0; run < 500; run++) {
      const n = 1 + Math.floor(rand() * 40);
      const weights = Array.from({ length: n }, () => (rand() < 0.2 ? 0 : rand() * 10_000));
      const pool = BigInt(Math.floor(rand() * 5_000_000));
      const { shares, leftover } = allocate(pool, weights);
      const total = shares.reduce((a, b) => a + b, 0n) + leftover;
      expect(total).toBe(pool);
      shares.forEach((s, i) => {
        expect(s).toBeGreaterThanOrEqual(0n);
        if (weights[i] === 0) expect(s).toBe(0n); // no claim, nothing paid
      });
    }
  });

  it('gives more to bigger claims', () => {
    const { shares } = allocate(100_000n, [1, 2, 7]);
    expect(shares).toEqual([10_000n, 20_000n, 70_000n]);
  });

  it('leaves everything unspent when nobody has a claim, or there is nothing to share', () => {
    expect(allocate(5000n, [0, 0, 0])).toEqual({ shares: [0n, 0n, 0n], leftover: 5000n });
    expect(allocate(5000n, [])).toEqual({ shares: [], leftover: 5000n });
    expect(allocate(0n, [1, 2])).toEqual({ shares: [0n, 0n], leftover: 0n });
    expect(
      allocate(5000n, [Number.NaN, -3, Number.POSITIVE_INFINITY]).shares.every((s) => s === 0n),
    ).toBe(true);
  });

  it('caps a share and reports what was taken off', () => {
    expect(capShares([100n, 5000n, 20n], 1000n)).toEqual({
      shares: [100n, 1000n, 20n],
      removed: 4000n,
    });
    expect(capShares([1n], 5n)).toEqual({ shares: [1n], removed: 0n });
  });
});

describe('what content earns a claim to', () => {
  const c = (over: Partial<ContentContribution> = {}): ContentContribution => ({
    creatorId: 'a',
    level: 'district',
    score: 100,
    qualifiedViews: 1000,
    ...over,
  });

  it('is views x rung x quality, not raw plays', () => {
    const [w] = creatorWeights(DEFAULT_REACH_CONFIG, [
      c({ level: 'national', score: 50, qualifiedViews: 2000 }),
    ]);
    expect(w!.weight).toBeCloseTo(2000 * 2.5 * 0.5, 9);
    expect(w).toMatchObject({ qualifiedReach: 2000, bestLevel: 'national', contentCount: 1 });
  });

  it('pays a higher rung more for the same audience', () => {
    const weights = ['district', 'state', 'national', 'global'].map(
      (level) => creatorWeights(DEFAULT_REACH_CONFIG, [c({ level: level as never })])[0]!.weight,
    );
    expect(weights).toEqual([...weights].sort((a, b) => a - b));
    expect(new Set(weights).size).toBe(4);
  });

  it('pays nothing for content below the minimum quality, however far it spread', () => {
    const low = creatorWeights(DEFAULT_REACH_CONFIG, [
      c({ score: 19.99, qualifiedViews: 9_000_000, level: 'global' }),
    ]);
    expect(low[0]!.weight).toBe(0);
    expect(creatorWeights(DEFAULT_REACH_CONFIG, [c({ score: 20 })])[0]!.weight).toBeGreaterThan(0);
  });

  it('adds a creator’s content together and keeps creators apart', () => {
    const all = creatorWeights(DEFAULT_REACH_CONFIG, [
      c({ creatorId: 'b', qualifiedViews: 100 }),
      c({ creatorId: 'a', qualifiedViews: 100 }),
      c({ creatorId: 'a', qualifiedViews: 300, level: 'state' }),
      c({ creatorId: 'z', qualifiedViews: 0 }), // no views: no claim
    ]);
    expect(all.map((w) => w.creatorId)).toEqual(['a', 'b']);
    const a = all[0]!;
    expect(a.qualifiedReach).toBe(400);
    expect(a.contentCount).toBe(2);
    expect(a.byLevel.state.views).toBe(300);
    expect(a.bestLevel).toBe('state');
  });

  it('follows the configuration', () => {
    const generous = config((x) => (x.rewards.levelMultipliers.global = 10));
    expect(creatorWeights(generous, [c({ level: 'global' })])[0]!.weight).toBe(10_000);
  });
});

describe('paying out a cycle', () => {
  const pool = parseRupees('100000.00');
  const claims = (n: number) =>
    creatorWeights(
      DEFAULT_REACH_CONFIG,
      Array.from({ length: n }, (_, i) => ({
        creatorId: `c${String(i).padStart(3, '0')}`,
        level: 'district' as const,
        score: 80,
        qualifiedViews: 1000 + i * 37,
      })),
    );

  it('shares the pool exactly among creators and keeps the unspent part separate', () => {
    const d = distributePool(DEFAULT_REACH_CONFIG, pool, claims(7));
    const paid = d.allocations.reduce((s, a) => s + a.amount, 0n);
    expect(paid + d.unspent).toBe(pool);
    expect(d.allocations.every((a) => a.amount > 0n)).toBe(true);
    expect(d.totalWeight).toBeGreaterThan(0);
  });

  it('never lets one creator take more than the cap', () => {
    const whale = creatorWeights(DEFAULT_REACH_CONFIG, [
      { creatorId: 'whale', level: 'global', score: 100, qualifiedViews: 9_000_000 },
      { creatorId: 'minnow', level: 'district', score: 100, qualifiedViews: 1000 },
    ]);
    const d = distributePool(DEFAULT_REACH_CONFIG, pool, whale);
    const capPaise = pool / 4n; // 25% by default
    for (const a of d.allocations) expect(a.amount).toBeLessThanOrEqual(capPaise);
    const w = d.allocations.find((a) => a.creatorId === 'whale')!;
    expect(w).toMatchObject({ amount: capPaise, capped: true });
    // What the cap took off is not handed to someone else: it stays in the pool.
    expect(d.cappedAway).toBeGreaterThan(0n);
    expect(d.allocations.reduce((s, a) => s + a.amount, 0n) + d.unspent).toBe(pool);
  });

  it('pays nothing and keeps the whole pool when no one has earned a claim', () => {
    const d = distributePool(DEFAULT_REACH_CONFIG, pool, []);
    expect(d).toMatchObject({ allocations: [], unspent: pool, cappedAway: 0n });
  });

  it('is repeatable: the same inputs give the same payments', () => {
    const a = distributePool(DEFAULT_REACH_CONFIG, pool, claims(25));
    const b = distributePool(structuredClone(DEFAULT_REACH_CONFIG), pool, claims(25));
    expect(a.allocations.map((x) => [x.creatorId, x.amount])).toEqual(
      b.allocations.map((x) => [x.creatorId, x.amount]),
    );
  });

  it('holds the total even for awkward pools', () => {
    for (const rupees of ['0.01', '0.03', '1.00', '99.99', '1234567.89']) {
      const d = distributePool(DEFAULT_REACH_CONFIG, parseRupees(rupees), claims(11));
      expect(d.allocations.reduce((s, x) => s + x.amount, 0n) + d.unspent).toBe(
        parseRupees(rupees),
      );
    }
  });
});

describe('who may earn', () => {
  const ok = {
    followers: 500,
    accountAgeDays: 90,
    publishedItems: 12,
    qualifiedReach30d: 5000,
    accountActive: true,
  };

  it('needs every condition, and says which are missing and by how much', () => {
    expect(evaluateEligibility(DEFAULT_REACH_CONFIG, ok).eligible).toBe(true);
    const short = evaluateEligibility(DEFAULT_REACH_CONFIG, {
      ...ok,
      followers: 40,
      qualifiedReach30d: 10,
    });
    expect(short.eligible).toBe(false);
    expect(short.requirements.filter((r) => !r.met)).toEqual([
      { key: 'followers', have: 40, need: 100, met: false },
      { key: 'qualifiedReach30d', have: 10, need: 1000, met: false },
    ]);
  });

  it('is met exactly at the threshold, not below it', () => {
    const edge = {
      followers: 100,
      accountAgeDays: 30,
      publishedItems: 3,
      qualifiedReach30d: 1000,
      accountActive: true,
    };
    expect(evaluateEligibility(DEFAULT_REACH_CONFIG, edge).eligible).toBe(true);
    expect(evaluateEligibility(DEFAULT_REACH_CONFIG, { ...edge, followers: 99 }).eligible).toBe(
      false,
    );
    expect(
      evaluateEligibility(DEFAULT_REACH_CONFIG, { ...edge, accountAgeDays: 29.9 }).eligible,
    ).toBe(false);
  });

  it('never applies to an account that is not in good standing', () => {
    expect(
      evaluateEligibility(DEFAULT_REACH_CONFIG, { ...ok, accountActive: false }).eligible,
    ).toBe(false);
  });
});
