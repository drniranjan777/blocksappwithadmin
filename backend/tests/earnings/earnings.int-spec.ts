import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CreatorProfileService } from '../../src/earnings/creator-profile.service.js';
import { EarningsService } from '../../src/earnings/earnings.service.js';
import { DEFAULT_REACH_CONFIG, type ReachConfig } from '../../src/reach/reach-config.js';
import { ReachScoringService } from '../../src/reach/reach-scoring.service.js';
import { createTestApp, type TestApp } from '../support/app.js';
import {
  adminCall,
  provisionAdmin,
  signInAdmin,
  staffSession,
  type StaffSession,
} from '../support/admin.js';
import { AUTH_TEST_ENV } from '../support/auth.js';
import { insertReel, person, type Person } from '../support/social.js';

/**
 * A configuration in which only trust counts towards the score (so every aged, verified author
 * scores exactly 100), anyone with one qualified view can earn, and no cap applies. That makes
 * every payment in these tests a plain proportion of qualified views.
 */
const ECON = (c: ReachConfig, cap = 1): ReachConfig => {
  const next = structuredClone(c);
  next.weights = {
    qualifiedViewers: 0,
    watchCompletion: 0,
    shares: 0,
    saves: 0,
    comments: 0,
    geoExpansion: 0,
    trust: 1,
  };
  next.rewards.minScoreForReward = 0;
  next.rewards.maxCreatorShare = cap;
  next.rewards.eligibility = {
    minFollowers: 0,
    minAccountAgeDays: 0,
    minPublishedItems: 1,
    minQualifiedReach30d: 1,
  };
  return next;
};

const DAY = 86_400_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

describe('creator earnings and the ledger', () => {
  let t: TestApp;
  let boss: StaffSession;
  let manager: StaffSession; // opens, changes and closes cycles
  let releaser: StaffSession; // releases a closed cycle into the ledger
  let adjuster: StaffSession;
  let support: StaffSession;
  let tuner: StaffSession;
  let approver: StaffSession;
  let analyst: StaffSession;
  let earnings: EarningsService;
  let scoring: ReachScoringService;
  let creators: CreatorProfileService;

  let ana: Person; // 4 qualified views
  let bo: Person; // 2 qualified views
  let cy: Person; // none
  let anaReel: string;
  let boReel: string;
  const viewers: Person[] = [];

  const row = async (sql: string, args: unknown[] = []) =>
    (await t.db.query<Record<string, any>>(sql, args)).rows;
  const staff =
    (s: StaffSession) =>
    (method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, body?: object) =>
      adminCall(t, method, path.replace(/^\/admin/, ''), {
        token: s.accessToken,
        ...(body ? { body } : {}),
      });
  const aged = (p: Person) =>
    t.db.query("UPDATE users SET created_at = now() - interval '400 days' WHERE id = $1", [p.id]);
  const watch = (p: Person, id: string) =>
    p.api('post', '/reach/events', {
      body: {
        events: [
          {
            kind: 'reel',
            id,
            type: 'WATCH',
            watchMs: 8000,
            eventId: randomUUID().replace(/-/g, ''),
          },
        ],
      },
    });
  const shiftEvents = (days: number) =>
    t.db.query(`UPDATE reach_events SET created_at = created_at - interval '${days} days'`);
  const summary = async (p: Person) =>
    (await p.api('get', '/earnings/summary').expect(200)).body.data;
  const balanceOf = async (p: Person) =>
    (
      await row(
        "SELECT balance FROM ledger_accounts WHERE type = 'CREATOR_PAYABLE' AND owner_user_id = $1",
        [p.id],
      )
    )[0]?.balance as string | undefined;

  const newCycle = (label: string, fromDays: number, toDays: number, pool = '600.00') =>
    staff(manager)('post', '/admin/earnings/cycles', {
      label,
      startsAt: iso(fromDays * DAY),
      endsAt: iso(toDays * DAY),
      poolAmount: pool,
    });

  async function activate(config: ReachConfig, note: string) {
    const draft = (
      await staff(tuner)('post', '/admin/reach/config/versions', { config, note }).expect(201)
    ).body.data;
    await staff(approver)('post', `/admin/reach/config/versions/${draft.id}/activate`, {
      reason: `Activating for the earnings tests: ${note}`,
    }).expect(200);
  }

  beforeAll(async () => {
    t = await createTestApp({
      ...AUTH_TEST_ENV,
      LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? 'silent',
    });
    earnings = t.app.get(EarningsService);
    scoring = t.app.get(ReachScoringService);
    creators = t.app.get(CreatorProfileService);

    boss = await staffSession(t, ['super_admin']);
    for (const [key, permissionKeys] of [
      ['cycle_manager', ['earnings.read', 'earnings.cycles.manage', 'creators.read']],
      ['cycle_releaser', ['earnings.read', 'earnings.cycles.finalize']],
      ['balance_adjuster', ['earnings.read', 'earnings.adjust', 'ledger.read']],
      ['creator_support', ['creators.read', 'creators.monetization.update']],
      ['reach_tuner', ['reach.config.read', 'reach.config.update']],
      ['reach_approver', ['reach.config.read', 'reach.config.activate']],
    ] as const) {
      await adminCall(t, 'post', '/roles', {
        token: boss.accessToken,
        body: { key, name: key, permissionKeys },
      }).expect(201);
    }
    const sign = async (roleKeys: string[]) =>
      signInAdmin(t, await provisionAdmin(t, { roleKeys }));
    manager = await sign(['cycle_manager']);
    releaser = await sign(['cycle_releaser']);
    adjuster = await sign(['balance_adjuster']);
    support = await sign(['creator_support']);
    tuner = await sign(['reach_tuner']);
    approver = await sign(['reach_approver']);
    analyst = await staffSession(t, ['readonly_analyst']);

    await activate(ECON(DEFAULT_REACH_CONFIG), 'trust only, no cap');

    [ana, bo, cy] = [await person(t), await person(t), await person(t)];
    for (const p of [ana, bo, cy]) await aged(p);
    anaReel = await insertReel(t, ana.id);
    boReel = await insertReel(t, bo.id);
    await insertReel(t, cy.id);
    for (let i = 0; i < 4; i++) {
      const v = await person(t);
      await aged(v);
      viewers.push(v);
    }
    for (const v of viewers) await watch(v, anaReel).expect(202); // four qualified views
    for (const v of viewers.slice(0, 2)) await watch(v, boReel).expect(202); // two
    await scoring.scorePending();
    await creators.refreshAll();
    // The views happened a day ago, which is what the cycle below covers.
    await shiftEvents(1);
  }, 300_000);
  afterAll(() => t.close());

  // --------------------------------------------------------------- eligibility --

  describe('who may earn', () => {
    it('is decided by the server from the record: views, content and standing', async () => {
      const a = (await ana.api('get', '/creator/eligibility').expect(200)).body.data;
      expect(a).toMatchObject({ status: 'ELIGIBLE', eligible: true, suspended: null });
      expect(a.requirements.map((r: any) => r.key)).toEqual([
        'followers',
        'accountAgeDays',
        'publishedItems',
        'qualifiedReach30d',
      ]);
      const c = (await cy.api('get', '/creator/eligibility').expect(200)).body.data;
      expect(c).toMatchObject({ status: 'NOT_ELIGIBLE', eligible: false });
      expect(c.requirements.find((r: any) => r.key === 'qualifiedReach30d')).toEqual({
        key: 'qualifiedReach30d',
        have: 0,
        need: 1,
        met: false,
      });
      await t.http.get('/api/v1/creator/eligibility').expect(401);
    });

    it('cannot be claimed by a client: there is nothing to send', async () => {
      await cy
        .api('patch', '/users/me/profile', { body: { monetizationStatus: 'ACTIVE' } })
        .expect(400);
      await cy.api('post', '/creator/eligibility', { body: { eligible: true } }).expect(404);
    });

    it('shows the Creator Studio in one call, kept honest about what is an estimate', async () => {
      const d = (await ana.api('get', '/creator/dashboard').expect(200)).body.data;
      expect(d.monetization).toMatchObject({ status: 'ELIGIBLE', eligible: true });
      expect(d.reach).toMatchObject({ qualifiedReach30d: 4, bestLevel: 'DISTRICT' });
      expect(d.reach.itemsByLevel).toEqual({ district: 1, state: 0, national: 0, global: 0 });
      // One item, on the first rung: it has "reached" District and nothing higher.
      expect(d.reach.coverage).toEqual({ district: 1, state: 0, national: 0, global: 0 });
      expect(d.reach.bestItemQualifiedReach).toBe(4);
      expect(typeof d.followers).toBe('number');
      expect(d.earnings).toMatchObject({
        estimated: null,
        pending: '0.00',
        finalized: '0.00',
        available: '0.00',
        currency: 'INR',
        notice: 'ESTIMATE_NOT_GUARANTEED',
      });
    });

    it('reports what the audience did, the same way qualified reach is counted', async () => {
      const s = (await ana.api('get', '/earnings/summary').expect(200)).body.data;
      expect(s.paidOut).toBe('0.00');
      expect(s.metrics30d).toMatchObject({ qualifiedViews: 4, bestItemQualifiedReach: 4 });
      for (const key of ['watchSeconds', 'shares', 'saves', 'likes', 'comments'] as const) {
        expect(Number.isInteger(s.metrics30d[key])).toBe(true);
        expect(s.metrics30d[key]).toBeGreaterThanOrEqual(0);
      }
      expect(s.metrics30d.engagementRate).toBeGreaterThanOrEqual(0);
      expect(s.metrics30d.engagementRate).toBeLessThanOrEqual(1);
      // Someone else's audience is not counted for this creator.
      const other = (await cy.api('get', '/earnings/summary').expect(200)).body.data;
      expect(other.metrics30d.qualifiedViews).toBe(0);
      expect(other.metrics30d.engagementRate).toBe(0);
      const items = (await ana.api('get', '/creator/content').expect(200)).body.data;
      expect(items[0]).toMatchObject({
        kind: 'reel',
        id: anaReel,
        level: 'DISTRICT',
        qualifiedReach: 4,
        score: 100,
      });
    });
  });

  // ------------------------------------------------------------------- cycles --

  describe('opening cycles', () => {
    it('lets only the people who run cycles open one, with sensible dates and pool', async () => {
      await staff(analyst)('post', '/admin/earnings/cycles', {}).expect(403);
      await staff(releaser)('post', '/admin/earnings/cycles', {
        label: 'x1',
        startsAt: iso(-3 * DAY),
        endsAt: iso(-DAY),
        poolAmount: '1.00',
      }).expect(403);
      await newCycle('bad-order', -1, -2).expect(400);
      await newCycle('too-long', -200, -1).expect(400);
      await newCycle('bad-pool-1', -3, -1, '-5').expect(400);
      await newCycle('bad-pool-2', -3, -1, '10.555').expect(400);
      await newCycle('bad-pool-3', -3, -1, '99999999999').expect(400);
      await newCycle('x', -3, -1).expect(400); // label too short
      const made = await newCycle('cycle-one', -3, -1 / 24).expect(201);
      expect(made.body.data).toMatchObject({
        label: 'cycle-one',
        status: 'OPEN',
        poolAmount: '600.00',
        configVersion: 2,
      });
      cycleOne = made.body.data.id;
    });

    it('refuses overlapping cycles and repeated labels', async () => {
      const clash = await newCycle('overlap', -2, 5).expect(409);
      expect(clash.body.error.message).toMatch(/overlap/i);
      await newCycle('cycle-one', -30, -20).expect(409);
    });

    it('lets an open cycle be changed, but not once it has closed', async () => {
      const changed = await staff(manager)('put', `/admin/earnings/cycles/${cycleOne}`, {
        poolAmount: '600.50',
      }).expect(200);
      expect(changed.body.data.poolAmount).toBe('600.50');
      await staff(manager)('put', `/admin/earnings/cycles/${cycleOne}`, {
        poolAmount: '600.00',
      }).expect(200);
      await staff(manager)('put', `/admin/earnings/cycles/${cycleOne}`, {
        startsAt: iso(-DAY),
        endsAt: iso(-2 * DAY),
      }).expect(400);
    });
  });
  let cycleOne: string;

  // ---------------------------------------------------------------- estimates --

  describe('estimates', () => {
    it('are a projection of each creator’s share so far, and clearly not money', async () => {
      await earnings.refreshEstimates();
      const a = await summary(ana);
      expect(a.estimated).toMatchObject({
        amount: '400.00',
        cycle: { label: 'cycle-one' },
        qualifiedReach: 4,
        level: 'DISTRICT',
      });
      expect(a).toMatchObject({
        pending: '0.00',
        finalized: '0.00',
        available: '0.00',
        notice: 'ESTIMATE_NOT_GUARANTEED',
      });
      const b = await summary(bo);
      expect(b.estimated.amount).toBe('200.00');
      expect((await summary(cy)).estimated).toBeNull();
      // No money has moved.
      expect(await balanceOf(ana)).toBeUndefined();
      expect((await row('SELECT count(*)::int AS n FROM ledger_journals'))[0]!.n).toBe(0);
      const history = (await ana.api('get', '/earnings/history').expect(200)).body.data;
      expect(history[0]).toMatchObject({
        status: 'ESTIMATED',
        amount: '400.00',
        isEstimate: true,
        cycle: { label: 'cycle-one' },
      });
    });

    it('are refreshed, not accumulated, and drop to zero when a claim disappears', async () => {
      await earnings.refreshEstimates();
      await earnings.refreshEstimates();
      expect(
        (
          await row('SELECT count(*)::int AS n FROM creator_earnings WHERE creator_id = $1', [
            ana.id,
          ])
        )[0]!.n,
      ).toBe(1);
      // A fraud finding removes Bo's views...
      await t.db.query(
        'UPDATE reach_events SET excluded = true, fraud_score = 90 WHERE reel_id = $1',
        [boReel],
      );
      await earnings.refreshEstimates();
      expect((await summary(bo)).estimated.amount).toBe('0.00');
      expect((await summary(ana)).estimated.amount).toBe('600.00'); // her share grows to the whole pool
      // ...and restoring them restores the figures.
      await t.db.query(
        'UPDATE reach_events SET excluded = false, fraud_score = 0 WHERE reel_id = $1',
        [boReel],
      );
      await earnings.refreshEstimates();
      expect((await summary(ana)).estimated.amount).toBe('400.00');
    });

    it('cannot be released: only a closed cycle can', async () => {
      await staff(releaser)('post', `/admin/earnings/cycles/${cycleOne}/finalize`).expect(409);
    });
  });

  // ------------------------------------------------------------ close, release --

  describe('closing and releasing a cycle', () => {
    it('cannot be closed before it ends', async () => {
      const future = await newCycle('cycle-future', 1, 5).expect(201);
      const res = await staff(manager)(
        'post',
        `/admin/earnings/cycles/${future.body.data.id}/close`,
      ).expect(409);
      expect(res.body.error.message).toMatch(/end date/i);
      await staff(analyst)('post', `/admin/earnings/cycles/${future.body.data.id}/close`).expect(
        403,
      );
    });

    it('fixes each creator’s share at the close and moves no money', async () => {
      const closed = (
        await staff(manager)('post', `/admin/earnings/cycles/${cycleOne}/close`).expect(200)
      ).body.data;
      expect(closed).toMatchObject({
        status: 'CLOSED',
        summary: {
          pool: '600.00',
          allocated: '600.00',
          unspent: '0.00',
          cappedAway: '0.00',
          creators: 2,
        },
      });
      await staff(manager)('post', `/admin/earnings/cycles/${cycleOne}/close`).expect(409); // already closed
      const a = await summary(ana);
      expect(a).toMatchObject({
        estimated: null,
        pending: '400.00',
        finalized: '0.00',
        available: '0.00',
      });
      expect((await summary(bo)).pending).toBe('200.00');
      expect((await row('SELECT count(*)::int AS n FROM ledger_journals'))[0]!.n).toBe(0);
    });

    it('needs the people who may release, and never the person who closed it', async () => {
      await staff(manager)('post', `/admin/earnings/cycles/${cycleOne}/finalize`).expect(403); // closing is not releasing
      await staff(analyst)('post', `/admin/earnings/cycles/${cycleOne}/finalize`).expect(403);

      // A super admin holds both permissions, so the rule has to be enforced on the person too.
      const solo = (
        await staff(boss)('post', '/admin/earnings/cycles', {
          label: 'cycle-solo',
          startsAt: iso(-8 * DAY),
          endsAt: iso(-7 * DAY),
          poolAmount: '10.00',
        }).expect(201)
      ).body.data;
      await staff(boss)('post', `/admin/earnings/cycles/${solo.id}/close`).expect(200);
      const refused = await staff(boss)(
        'post',
        `/admin/earnings/cycles/${solo.id}/finalize`,
      ).expect(403);
      expect(refused.body.error.message).toMatch(/someone else/i);
      const done = (
        await staff(releaser)('post', `/admin/earnings/cycles/${solo.id}/finalize`).expect(200)
      ).body.data;
      expect(done).toMatchObject({ status: 'FINALIZED', release: { credited: 0, total: '0.00' } }); // nobody earned anything in it
    });

    it('credits each creator exactly once, through the ledger, when a second person releases it', async () => {
      const released = (
        await staff(releaser)('post', `/admin/earnings/cycles/${cycleOne}/finalize`).expect(200)
      ).body.data;
      expect(released).toMatchObject({
        status: 'FINALIZED',
        release: { credited: 2, voided: 0, total: '600.00', remaining: 0 },
      });

      expect(await balanceOf(ana)).toBe('400.00');
      expect(await balanceOf(bo)).toBe('200.00');
      expect(
        (await row("SELECT balance FROM ledger_accounts WHERE type = 'REWARD_POOL'"))[0]!.balance,
      ).toBe('600.00');
      const a = await summary(ana);
      expect(a).toMatchObject({ pending: '0.00', finalized: '400.00', available: '400.00' });

      const lines = (await ana.api('get', '/earnings/ledger').expect(200)).body.data;
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({
        type: 'REWARD_FINALIZED',
        amount: '400.00',
        balanceAfter: '400.00',
        memo: 'Reward for cycle-one',
      });
      const history = (await ana.api('get', '/earnings/history').expect(200)).body.data;
      expect(history[0]).toMatchObject({
        status: 'FINALIZED',
        amount: '400.00',
        isEstimate: false,
      });
    });

    it('does nothing the second time: a released cycle cannot pay anyone twice', async () => {
      const before = (await row('SELECT count(*)::int AS n FROM ledger_journals'))[0]!.n;
      const again = (
        await staff(releaser)('post', `/admin/earnings/cycles/${cycleOne}/finalize`).expect(200)
      ).body.data;
      expect(again.release).toMatchObject({ credited: 0, total: '0.00' });
      expect((await row('SELECT count(*)::int AS n FROM ledger_journals'))[0]!.n).toBe(before);
      expect(await balanceOf(ana)).toBe('400.00');
    });

    it('cannot be tricked into a second payment by anyone going around the API', async () => {
      const earning = (
        await row('SELECT id, journal_id FROM creator_earnings WHERE creator_id = $1', [ana.id])
      )[0]!;
      // The same reward key again is the same journal, and the database refuses a second one.
      await expect(
        t.db.query(
          "INSERT INTO ledger_journals (id, type, idempotency_key, created_by_type) VALUES (gen_random_uuid(), 'REWARD_FINALIZED', $1, 'SYSTEM')",
          [`reward:${cycleOne}:${ana.id}`],
        ),
      ).rejects.toThrow(/duplicate key|unique/i);
      // One earning row per creator per cycle.
      await expect(
        t.db.query(
          "INSERT INTO creator_earnings (id, creator_id, cycle_id, scoring_version, breakdown, updated_at) VALUES (gen_random_uuid(), $1, $2, 2, '{}'::jsonb, now())",
          [ana.id, cycleOne],
        ),
      ).rejects.toThrow(/duplicate key|unique/i);
      expect(earning.journal_id).toBeTruthy();
    });
  });

  // ---------------------------------------------------- concurrency and caps --

  describe('releasing at the same moment from two places', () => {
    it('pays each creator once however many people press the button', async () => {
      await shiftEvents(10); // the same views, now ten days older: they belong to the next window
      const second = (await newCycle('cycle-two', -14, -9, '300.00').expect(201)).body.data.id;
      await staff(manager)('post', `/admin/earnings/cycles/${second}/close`).expect(200);

      const before = await balanceOf(ana);
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          staff(releaser)('post', `/admin/earnings/cycles/${second}/finalize`),
        ),
      );
      for (const r of results) expect([200, 409]).toContain(r.status);
      expect(results.some((r) => r.status === 200)).toBe(true);

      const journals = await row(
        'SELECT count(*)::int AS n FROM ledger_journals WHERE idempotency_key LIKE $1',
        [`reward:${second}:%`],
      );
      expect(journals[0]!.n).toBe(2); // Ana and Bo, once each
      expect(Number(await balanceOf(ana)) - Number(before)).toBeCloseTo(200, 2); // 4 of 6 views of 300.00
      expect(
        (await row('SELECT status FROM reward_cycles WHERE id = $1', [second]))[0]!.status,
      ).toBe('FINALIZED');
    });
  });

  describe('the cap on any one creator', () => {
    it('keeps a creator to their share limit and leaves the rest of the pool unspent', async () => {
      await activate(ECON(DEFAULT_REACH_CONFIG, 0.4), 'trust only, 40% cap');
      await shiftEvents(10);
      const capped = (await newCycle('cycle-capped', -24, -18, '600.00').expect(201)).body.data;
      expect(capped.configVersion).toBe(3);
      const closed = (
        await staff(manager)('post', `/admin/earnings/cycles/${capped.id}/close`).expect(200)
      ).body.data;
      // Ana's claim is two thirds (400.00) but the cap is 40% of 600.00 = 240.00; Bo's 200.00 is under it.
      expect(closed.summary).toMatchObject({
        allocated: '440.00',
        unspent: '160.00',
        cappedAway: '160.00',
        creators: 2,
      });
      const rows = await row(
        'SELECT creator_id, estimated_amount, breakdown FROM creator_earnings WHERE cycle_id = $1',
        [capped.id],
      );
      expect(rows.find((r) => r.creator_id === ana.id)).toMatchObject({
        estimated_amount: '240.00',
        breakdown: { capped: true },
      });
      expect(rows.find((r) => r.creator_id === bo.id)).toMatchObject({
        estimated_amount: '200.00',
        breakdown: { capped: false },
      });
      await staff(releaser)('post', `/admin/earnings/cycles/${capped.id}/finalize`).expect(200);
    });
  });

  // ---------------------------------------------------------------- suspension --

  describe('suspending monetisation', () => {
    it('stops a creator earning, however well they do, and is audited with a reason', async () => {
      await staff(analyst)('post', `/admin/creators/${bo.id}/monetization/suspend`, {
        reason: 'Repeated policy violations',
      }).expect(403);
      await staff(support)('post', `/admin/creators/${bo.id}/monetization/suspend`, {
        reason: 'short',
      }).expect(400);
      const res = await staff(support)('post', `/admin/creators/${bo.id}/monetization/suspend`, {
        reason: 'Repeated policy violations',
      }).expect(200);
      expect(res.body.data).toMatchObject({ status: 'SUSPENDED', eligible: true }); // eligible by record, suspended by staff
      await staff(support)('post', `/admin/creators/${bo.id}/monetization/suspend`, {
        reason: 'Repeated policy violations',
      }).expect(409);
      await creators.refreshAll();
      expect(
        (
          await row('SELECT monetization_status FROM creator_profiles WHERE user_id = $1', [bo.id])
        )[0]!.monetization_status,
      ).toBe('SUSPENDED');
      const logged = await row(
        "SELECT reason FROM audit_logs WHERE action = 'creator.monetization_suspended' AND target_id = $1",
        [bo.id],
      );
      expect(logged).toEqual([{ reason: 'Repeated policy violations' }]);
    });

    it('voids what was already fixed if the creator is suspended before the release', async () => {
      await shiftEvents(10);
      const third = (await newCycle('cycle-void', -34, -28, '300.00').expect(201)).body.data.id;
      // Ana is the only eligible creator now, so she takes the whole claim up to the cap in force.
      await staff(manager)('post', `/admin/earnings/cycles/${third}/close`).expect(200);
      const before = await balanceOf(ana);
      await staff(support)('post', `/admin/creators/${ana.id}/monetization/suspend`, {
        reason: 'Account under investigation',
      }).expect(200);
      const released = (
        await staff(releaser)('post', `/admin/earnings/cycles/${third}/finalize`).expect(200)
      ).body.data;
      expect(released.release).toMatchObject({ credited: 0, voided: 1 });
      expect(await balanceOf(ana)).toBe(before); // no money moved
      expect(
        (
          await row('SELECT status FROM creator_earnings WHERE cycle_id = $1 AND creator_id = $2', [
            third,
            ana.id,
          ])
        )[0]!.status,
      ).toBe('VOID');
    });

    it('can be lifted, after which the record decides again', async () => {
      await staff(support)('post', `/admin/creators/${ana.id}/monetization/restore`, {
        reason: 'Investigation closed',
      }).expect(200);
      await staff(support)('post', `/admin/creators/${ana.id}/monetization/restore`, {
        reason: 'Investigation closed',
      }).expect(409);
      expect(
        (await ana.api('get', '/creator/eligibility').expect(200)).body.data.suspended,
      ).toBeNull();
      await staff(support)('post', `/admin/creators/${bo.id}/monetization/restore`, {
        reason: 'Appeal upheld by the review team',
      }).expect(200);
    });
  });

  // -------------------------------------------------------------- adjustments --

  describe('manual adjustments', () => {
    const adjust = (body: object, who = adjuster) =>
      staff(who)('post', '/admin/earnings/adjustments', body);
    const key = () => `adj-${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    it('add to or take from a balance, through the ledger, with a reason', async () => {
      const before = Number(await balanceOf(ana));
      const k = key();
      const res = await adjust({
        userId: ana.id,
        amount: '50.25',
        reason: 'Goodwill credit for a failed upload',
        idempotencyKey: k,
      }).expect(200);
      expect(res.body.data).toMatchObject({ amount: '50.25', replayed: false });
      expect(Number(await balanceOf(ana)) - before).toBeCloseTo(50.25, 2);
      const down = await adjust({
        userId: ana.id,
        amount: '-20.00',
        reason: 'Correcting a duplicate credit',
        idempotencyKey: key(),
      }).expect(200);
      expect(down.body.data.amount).toBe('-20.00');
      expect(Number(await balanceOf(ana)) - before).toBeCloseTo(30.25, 2);
      const lines = (await ana.api('get', '/earnings/ledger', { query: { limit: 2 } }).expect(200))
        .body.data;
      expect(lines.map((l: any) => [l.type, l.amount])).toEqual([
        ['ADJUSTMENT', '-20.00'],
        ['ADJUSTMENT', '50.25'],
      ]);
      const logged = await row(
        "SELECT reason, after FROM audit_logs WHERE action = 'earnings.adjustment_posted' AND target_id = $1 ORDER BY created_at",
        [ana.id],
      );
      expect(logged[0]!.reason).toBe('Goodwill credit for a failed upload');
    });

    it('are safe to retry: the same key never adjusts twice', async () => {
      const k = key();
      const body = {
        userId: bo.id,
        amount: '10.00',
        reason: 'Support goodwill credit',
        idempotencyKey: k,
      };
      const before = Number(await balanceOf(bo));
      const first = await adjust(body).expect(200);
      const retry = await adjust(body).expect(200);
      expect(retry.body.data).toMatchObject({
        replayed: true,
        journalId: first.body.data.journalId,
      });
      expect(Number(await balanceOf(bo)) - before).toBeCloseTo(10, 2);
      // Concurrently, too.
      const k2 = key();
      await Promise.all(
        Array.from({ length: 5 }, () =>
          adjust({
            userId: bo.id,
            amount: '1.00',
            reason: 'Concurrent retry check',
            idempotencyKey: k2,
          }),
        ),
      );
      expect(Number(await balanceOf(bo)) - before).toBeCloseTo(11, 2);
      // The same key for a different amount is a bug or an attack, not a retry.
      const clash = await adjust({ ...body, amount: '11.00' }).expect(409);
      expect(clash.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    });

    it('can never take a balance below zero', async () => {
      const before = await balanceOf(bo);
      const res = await adjust({
        userId: bo.id,
        amount: '-9999.00',
        reason: 'Trying to overdraw an account',
        idempotencyKey: key(),
      }).expect(409);
      expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
      expect(await balanceOf(bo)).toBe(before);
    });

    it('refuses nonsense, large amounts and anyone without the permission', async () => {
      const ok = {
        userId: bo.id,
        amount: '5.00',
        reason: 'A perfectly good reason',
        idempotencyKey: key(),
      };
      await adjust({ ...ok, amount: '0' }).expect(400);
      await adjust({ ...ok, amount: '5.555' }).expect(400);
      await adjust({ ...ok, amount: 'five' }).expect(400);
      await adjust({ ...ok, amount: '10000.01' }).expect(400); // over the default limit
      await adjust({ ...ok, reason: 'short' }).expect(400);
      await adjust({ ...ok, idempotencyKey: 'x' }).expect(400);
      await adjust({ ...ok, userId: randomUUID() }).expect(404);
      await adjust(ok, support).expect(403);
      await adjust(ok, manager).expect(403);
      await adjust(ok, analyst).expect(403);
      await t.http.post('/api/v1/admin/earnings/adjustments').send(ok).expect(401);
    });
  });

  // ------------------------------------------------------------------- the ledger --

  describe('the ledger as a whole', () => {
    it('balances: debits equal credits overall and within every journal', async () => {
      const overall = await row(
        "SELECT COALESCE(SUM(CASE direction WHEN 'DEBIT' THEN amount ELSE -amount END), 0) AS net FROM financial_ledger_entries",
      );
      expect(Number(overall[0]!.net)).toBe(0);
      const unbalanced = await row(
        "SELECT journal_id FROM financial_ledger_entries GROUP BY journal_id HAVING SUM(CASE direction WHEN 'DEBIT' THEN amount ELSE -amount END) <> 0",
      );
      expect(unbalanced).toEqual([]);
    });

    it('agrees with itself: every creator’s balance is the sum of their entries', async () => {
      const mismatches = await row(`
        SELECT a.id FROM ledger_accounts a
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(CASE WHEN e.direction = a.normal_side THEN e.amount ELSE -e.amount END), 0) AS total
            FROM financial_ledger_entries e WHERE e.account_id = a.id) s ON true
        WHERE a.balance <> s.total`);
      expect(mismatches).toEqual([]);
      const negative = await row(
        "SELECT id FROM ledger_accounts WHERE type = 'CREATOR_PAYABLE' AND balance < 0",
      );
      expect(negative).toEqual([]);
    });

    it('cannot be altered after the fact, even with direct database access', async () => {
      await expect(
        t.db.query('UPDATE financial_ledger_entries SET amount = 1 WHERE true'),
      ).rejects.toThrow(/append-only|not allowed|immutable/i);
      await expect(t.db.query('DELETE FROM ledger_journals')).rejects.toThrow(
        /append-only|not allowed|immutable/i,
      );
      await expect(
        t.db.query("UPDATE ledger_accounts SET balance = 999999 WHERE type = 'CREATOR_PAYABLE'"),
      ).rejects.toThrow(/only through ledger entries/i);
    });

    it('shows staff a creator’s balance and entries, and only to those who may see them', async () => {
      const view = (await staff(adjuster)('get', `/admin/ledger/creators/${ana.id}`).expect(200))
        .body.data;
      expect(Number(view.balance)).toBeGreaterThan(0);
      expect(view.entries.length).toBeGreaterThan(1);
      await staff(support)('get', `/admin/ledger/creators/${ana.id}`).expect(403);
      await staff(analyst)('get', `/admin/earnings/cycles`).expect(403);
      const cycles = (await staff(manager)('get', '/admin/earnings/cycles').expect(200)).body.data;
      expect(cycles.map((c: any) => c.label)).toEqual(
        expect.arrayContaining(['cycle-one', 'cycle-two', 'cycle-capped', 'cycle-void']),
      );
      const one = (await staff(manager)('get', `/admin/earnings/cycles/${cycleOne}`).expect(200))
        .body.data;
      expect(one.top.map((e: any) => e.finalizedAmount)).toEqual(['400.00', '200.00']);
    });

    it('shows each creator only their own figures', async () => {
      const theirs = (await bo.api('get', '/earnings/ledger').expect(200)).body.data as Array<{
        memo: string;
      }>;
      expect(JSON.stringify(theirs)).not.toContain(ana.id);
      await t.http.get('/api/v1/earnings/summary').expect(401);
      await t.http.get('/api/v1/earnings/ledger').expect(401);
      await ana.api('get', `/admin/ledger/creators/${ana.id}`).expect(401); // a user is not staff
    });
  });
});
