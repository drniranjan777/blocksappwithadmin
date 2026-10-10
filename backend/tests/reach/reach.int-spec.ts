import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_REACH_CONFIG, type ReachConfig } from '../../src/reach/reach-config.js';
import { ReachConfigService } from '../../src/reach/reach-config.service.js';
import { ReachScoringService } from '../../src/reach/reach-scoring.service.js';
import { computeScore, type ReachAggregates } from '../../src/reach/reach-score.js';
import { createTestApp, type TestApp } from '../support/app.js';
import {
  adminCall,
  provisionAdmin,
  signInAdmin,
  staffSession,
  type StaffSession,
} from '../support/admin.js';
import { AUTH_TEST_ENV } from '../support/auth.js';
import { insertReel, makePost, person, type Person } from '../support/social.js';

/** A ladder small enough to climb with a handful of test accounts. Everything else is the default. */
const SMALL_LADDER = (c: ReachConfig): ReachConfig => {
  const next = structuredClone(c);
  next.levels = {
    district: { minQualifiedReach: 0, minScore: 0 },
    state: { minQualifiedReach: 3, minScore: 0, minDistinctDistricts: 2 },
    national: { minQualifiedReach: 5, minScore: 0, minDistinctStates: 2 },
    global: {
      minQualifiedReach: 7,
      minScore: 0,
      minDistinctCountries: 2,
      minInternationalViewers: 1,
    },
  };
  next.fraud.excludeAtOrAbove = 50;
  return next;
};

describe('the Reach Ladder', () => {
  let t: TestApp;
  let boss: StaffSession;
  let tuner: StaffSession; // drafts configurations
  let approver: StaffSession; // activates them
  let analyst: StaffSession; // read-only
  let configs: ReachConfigService;
  let scoring: ReachScoringService;

  beforeAll(async () => {
    t = await createTestApp({
      ...AUTH_TEST_ENV,
      LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? 'silent',
    });
    configs = t.app.get(ReachConfigService);
    scoring = t.app.get(ReachScoringService);
    boss = await staffSession(t, ['super_admin']);
    for (const [key, permissionKeys] of [
      ['reach_tuner', ['reach.config.read', 'reach.config.update']],
      ['reach_approver', ['reach.config.read', 'reach.config.activate']],
    ] as const) {
      await adminCall(t, 'post', '/roles', {
        token: boss.accessToken,
        body: { key, name: key, permissionKeys },
      }).expect(201);
    }
    tuner = await signInAdmin(t, await provisionAdmin(t, { roleKeys: ['reach_tuner'] }));
    approver = await signInAdmin(t, await provisionAdmin(t, { roleKeys: ['reach_approver'] }));
    analyst = await staffSession(t, ['readonly_analyst']);
  }, 180_000);
  afterAll(() => t.close());

  const staff =
    (s: StaffSession) =>
    (method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, body?: object) =>
      adminCall(t, method, `/reach${path}`, { token: s.accessToken, ...(body ? { body } : {}) });
  const row = async (sql: string, args: unknown[] = []) =>
    (await t.db.query<Record<string, any>>(sql, args)).rows;

  // -------------------------------------------------------------- configuration --

  describe('the configuration', () => {
    let draftId: string;

    it('starts with a default version the system made, live from the first moment', async () => {
      const versions = (await staff(boss)('get', '/config/versions').expect(200)).body.data;
      expect(versions).toHaveLength(1);
      expect(versions[0]).toMatchObject({ version: 1, status: 'ACTIVE', createdBy: 'system' });
      expect(versions[0].config).toBeUndefined(); // the list is a summary
      const full = (await staff(boss)('get', `/config/versions/${versions[0].id}`).expect(200)).body
        .data;
      expect(full.config).toEqual(DEFAULT_REACH_CONFIG);
    });

    it('shows the app only the ladder, never the weights', async () => {
      const person1 = await person(t);
      const ladder = (await person1.api('get', '/reach/ladder').expect(200)).body.data;
      expect(ladder).toEqual({
        version: 1,
        levels: [
          { key: 'DISTRICT', minQualifiedReach: 0 },
          { key: 'STATE', minQualifiedReach: 10_001 },
          { key: 'NATIONAL', minQualifiedReach: 100_001 },
          { key: 'GLOBAL', minQualifiedReach: 1_000_001 },
        ],
      });
      await t.http.get('/api/v1/reach/ladder').expect(401);
    });

    it('lets one role draft and another activate, and no one else do either', async () => {
      await staff(analyst)('get', '/config/versions').expect(403);
      await staff(analyst)('post', '/config/versions', {}).expect(403);
      await staff(approver)('post', '/config/versions', {}).expect(403);
      await staff(tuner)('get', '/config/versions').expect(200);
      const draft = (
        await staff(tuner)('post', '/config/versions', {
          note: 'Smaller ladder for testing',
        }).expect(201)
      ).body.data;
      draftId = draft.id;
      expect(draft).toMatchObject({
        version: 2,
        status: 'DRAFT',
        createdBy: expect.any(String),
        changesFromActive: [],
      });
      await staff(tuner)('post', `/config/versions/${draftId}/activate`, {
        reason: 'I drafted this myself',
      }).expect(403);
    });

    it('refuses an invalid configuration with every problem named', async () => {
      const bad = structuredClone(DEFAULT_REACH_CONFIG);
      bad.weights.shares = 0.9;
      bad.levels.state.minQualifiedReach = 0;
      bad.rewards.levelMultipliers.national = 0.1;
      const res = await staff(tuner)('put', `/config/versions/${draftId}`, { config: bad }).expect(
        400,
      );
      const fields = (res.body.error.details as Array<{ field: string }>).map((d) => d.field);
      expect(fields).toEqual(
        expect.arrayContaining([
          'weights',
          'levels.state.minQualifiedReach',
          'rewards.levelMultipliers',
        ]),
      );
      await staff(tuner)('put', `/config/versions/${draftId}`, { config: { weights: {} } }).expect(
        400,
      );
      await staff(tuner)('put', `/config/versions/${draftId}`, { config: 'nope' }).expect(400);
      // The draft is untouched.
      const after = (await staff(tuner)('get', `/config/versions/${draftId}`).expect(200)).body
        .data;
      expect(after.config).toEqual(DEFAULT_REACH_CONFIG);
    });

    it('shows what a draft would change, then needs a second person and a reason to go live', async () => {
      const updated = (
        await staff(tuner)('put', `/config/versions/${draftId}`, {
          config: SMALL_LADDER(DEFAULT_REACH_CONFIG),
        }).expect(200)
      ).body.data;
      const paths = (
        updated.changesFromActive ??
        (await staff(tuner)('get', `/config/versions/${draftId}`)).body.data.changesFromActive
      ).map((c: any) => c.path);
      expect(paths).toEqual(
        expect.arrayContaining(['levels.state.minQualifiedReach', 'fraud.excludeAtOrAbove']),
      );

      await staff(approver)('post', `/config/versions/${draftId}/activate`, {}).expect(400); // no reason
      await staff(approver)('post', `/config/versions/${draftId}/activate`, {
        reason: 'ok',
      }).expect(400); // too short
      const live = (
        await staff(approver)('post', `/config/versions/${draftId}/activate`, {
          reason: 'Tested on staging traffic',
        }).expect(200)
      ).body.data;
      expect(live).toMatchObject({ version: 2, status: 'ACTIVE' });

      const versions = (await staff(boss)('get', '/config/versions').expect(200)).body.data;
      expect(versions.map((v: any) => [v.version, v.status])).toEqual([
        [2, 'ACTIVE'],
        [1, 'ARCHIVED'],
      ]);
      // The app sees the new numbers at once.
      const p = await person(t);
      expect((await p.api('get', '/reach/ladder').expect(200)).body.data).toMatchObject({
        version: 2,
        levels: [{}, { minQualifiedReach: 3 }, { minQualifiedReach: 5 }, { minQualifiedReach: 7 }],
      });
    });

    it('never lets the person who drafted a version activate it, even a super admin', async () => {
      const draft = (await staff(boss)('post', '/config/versions', {}).expect(201)).body.data;
      const res = await staff(boss)('post', `/config/versions/${draft.id}/activate`, {
        reason: 'Activating my own draft',
      }).expect(403);
      expect(res.body.error.message).toMatch(/someone else/i);
      await staff(boss)('delete', `/config/versions/${draft.id}`).expect(204);
    });

    it('never edits or deletes a version once it has been live', async () => {
      const active = (await staff(boss)('get', '/config/versions').expect(200)).body.data.find(
        (v: any) => v.status === 'ACTIVE',
      );
      await staff(tuner)('put', `/config/versions/${active.id}`, { note: 'sneaky' }).expect(409);
      await staff(tuner)('delete', `/config/versions/${active.id}`).expect(409);
      // Nor can it be done around the API: the database refuses.
      await expect(
        t.db.query("UPDATE reach_config_versions SET config = '{}'::jsonb WHERE id = $1", [
          active.id,
        ]),
      ).rejects.toThrow(/no longer a draft/);
      const archived = (await staff(boss)('get', '/config/versions').expect(200)).body.data.find(
        (v: any) => v.status === 'ARCHIVED',
      );
      await expect(
        t.db.query("UPDATE reach_config_versions SET config = '{}'::jsonb WHERE id = $1", [
          archived.id,
        ]),
      ).rejects.toThrow(/no longer a draft/);
    });

    it('records every step in the audit trail with what changed', async () => {
      const rows = await row(
        "SELECT action, reason, after FROM audit_logs WHERE target_type = 'reach_config' ORDER BY created_at",
      );
      const actions = rows.map((r) => r.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'reach.config_drafted',
          'reach.config_updated',
          'reach.config_activated',
          'reach.config_deleted',
        ]),
      );
      const activated = rows.find((r) => r.action === 'reach.config_activated')!;
      expect(activated.reason).toBe('Tested on staging traffic');
      expect(activated.after.activeVersion).toBe(2);
      expect(activated.after.changes.map((c: any) => c.path)).toContain(
        'levels.state.minQualifiedReach',
      );
    });
  });

  // ------------------------------------------------------- events and scoring --

  describe('counting views and climbing the ladder', () => {
    let author: Person;
    let reelId: string;
    const viewers: Person[] = [];

    const aged = (p: Person) =>
      t.db.query("UPDATE users SET created_at = now() - interval '3 days' WHERE id = $1", [p.id]);
    const watch = (
      p: Person,
      id: string,
      watchMs: number,
      eventId = randomUUID().replace(/-/g, ''),
    ) =>
      p.api('post', '/reach/events', {
        body: { events: [{ kind: 'reel', id, type: 'WATCH', watchMs, eventId }] },
      });
    const rowsOf = (viewer: Person, id = reelId) =>
      row(
        'SELECT type, excluded, fraud_score, watch_ms, viewer_state, viewer_district, viewer_country, device_hash FROM reach_events WHERE viewer_id = $1 AND reel_id = $2 ORDER BY created_at, id',
        [viewer.id, id],
      );
    const levelOf = async (id = reelId) =>
      (await row('SELECT reach_level, qualified_reach FROM reels WHERE id = $1', [id]))[0]!;

    beforeAll(async () => {
      author = await person(t, { state: 'Telangana', district: 'Hyderabad' });
      reelId = await insertReel(t, author.id);
      const places: Array<[string, string]> = [
        ['Telangana', 'Hyderabad'],
        ['Telangana', 'Warangal'],
        ['Maharashtra', 'Mumbai'],
        ['Maharashtra', 'Pune'],
        ['Karnataka', 'Bengaluru'],
        ['Delhi', 'New Delhi'],
        ['Kerala', 'Kochi'],
      ];
      for (const [state, district] of places) {
        const v = await person(t, { state, district });
        await aged(v);
        viewers.push(v);
      }
      // One of them lives abroad.
      await t.db.query(
        "UPDATE profiles SET country = 'US', state = NULL, district = NULL WHERE user_id = $1",
        [viewers[6]!.id],
      );
    }, 240_000);

    it('takes a view report, decides itself that it qualified, and takes the place from the profile', async () => {
      const v = viewers[0]!;
      const res = await watch(v, reelId, 5000).expect(202);
      expect(res.body.data).toEqual({ received: 1 });
      const rows = await rowsOf(v);
      expect(rows.map((r) => r.type)).toEqual(['WATCH', 'QUALIFIED_VIEW']);
      expect(rows[1]).toMatchObject({
        excluded: false,
        watch_ms: 5000,
        viewer_state: 'Telangana',
        viewer_district: 'Hyderabad',
        viewer_country: 'IN',
      });
      // The device is recognised only by a keyed hash.
      expect(rows[0]!.device_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(rows[0]!.device_hash).not.toContain(v.deviceId);
    });

    it('counts a person once however often they watch, and a retried report not at all', async () => {
      const v = viewers[0]!;
      const id = `retry${Date.now()}x`;
      await watch(v, reelId, 6000, id).expect(202);
      await watch(v, reelId, 6000, id).expect(202); // the same report again
      await watch(v, reelId, 7000).expect(202); // a new viewing
      const rows = await rowsOf(v);
      expect(rows.filter((r) => r.type === 'QUALIFIED_VIEW')).toHaveLength(1);
      expect(rows.filter((r) => r.type === 'WATCH')).toHaveLength(3);
    });

    it('lets a phone report only what it saw: no qualified views, completions, places or levels of its own', async () => {
      const v = viewers[1]!;
      const send = (extra: object) =>
        v.api('post', '/reach/events', {
          body: {
            events: [
              {
                kind: 'reel',
                id: reelId,
                type: 'WATCH',
                watchMs: 5000,
                eventId: randomUUID().replace(/-/g, ''),
                ...extra,
              },
            ],
          },
        });
      await send({ type: 'QUALIFIED_VIEW' }).expect(400);
      await send({ type: 'COMPLETE' }).expect(400);
      await send({ reachLevel: 'GLOBAL' }).expect(400);
      await send({ qualified: true }).expect(400);
      await send({ viewerState: 'Goa', viewerDistrict: 'Panaji' }).expect(400);
      await send({ fraudScore: 0 }).expect(400);
      await send({ watchMs: -1 }).expect(400);
      await send({ watchMs: 99_999_999 }).expect(400);
      await send({ id: 'not-a-uuid' }).expect(400);
      await send({ eventId: 'short' }).expect(400);
      await v.api('post', '/reach/events', { body: { events: [] } }).expect(400);
      await v
        .api('post', '/reach/events', {
          body: {
            events: Array.from({ length: 51 }, () => ({
              kind: 'reel',
              id: reelId,
              type: 'IMPRESSION',
              eventId: randomUUID().replace(/-/g, ''),
            })),
          },
        })
        .expect(400);
      expect((await rowsOf(v)).length).toBe(0);
    });

    it('ignores views of your own content, of content you cannot see, and of things that do not exist', async () => {
      expect((await watch(author, reelId, 9000).expect(202)).body.data.received).toBe(0);
      expect(
        await row('SELECT 1 FROM reach_events WHERE viewer_id = $1', [author.id]),
      ).toHaveLength(0);

      const privateAuthor = await person(t, { private: true });
      const hidden = await insertReel(t, privateAuthor.id);
      const stranger = viewers[2]!;
      expect((await watch(stranger, hidden, 9000).expect(202)).body.data.received).toBe(0);
      const unpublished = await insertReel(t, author.id, { published: false });
      expect((await watch(stranger, unpublished, 9000).expect(202)).body.data.received).toBe(0);
      expect((await watch(stranger, randomUUID(), 9000).expect(202)).body.data.received).toBe(0);
      expect(await rowsOf(stranger, hidden)).toHaveLength(0);
    });

    it('does not count a view that is too short, or one from a brand-new account', async () => {
      const short = viewers[3]!;
      await watch(short, reelId, 1500).expect(202);
      expect((await rowsOf(short)).map((r) => r.type)).toEqual(['WATCH']);

      const fresh = await person(t, { state: 'Goa', district: 'Panaji' }); // not aged
      await watch(fresh, reelId, 9000).expect(202);
      expect((await rowsOf(fresh)).map((r) => r.type)).toEqual(['WATCH']);
    });

    it('holds a runaway watch time to what the reel could allow, and will not believe it enough to count it', async () => {
      const v = await person(t, { state: 'Goa', district: 'Panaji' });
      await aged(v);
      await watch(v, reelId, 3_000_000).expect(202);
      const rows = await rowsOf(v);
      expect(rows.map((r) => r.type)).toEqual(['WATCH']); // evidence only: no qualified view
      expect(rows[0]!.watch_ms).toBeLessThanOrEqual(15_000 * 3);
      expect(rows[0]!.fraud_score).toBeGreaterThanOrEqual(30);
    });

    it('climbs the ladder as qualified viewers arrive from more places, one rung at a time', async () => {
      // Three qualified viewers so far would be v0 only; add the rest in order.
      await scoring.scorePending();
      expect(await levelOf()).toMatchObject({ reach_level: 'DISTRICT', qualified_reach: 1 });

      await watch(viewers[1]!, reelId, 6000).expect(202); // Warangal: second district
      await watch(viewers[2]!, reelId, 6000).expect(202); // Mumbai
      await scoring.scorePending();
      expect(await levelOf()).toMatchObject({ reach_level: 'STATE', qualified_reach: 3 });

      await watch(viewers[3]!, reelId, 6000).expect(202); // Pune
      await watch(viewers[4]!, reelId, 6000).expect(202); // Bengaluru
      await scoring.scorePending();
      expect(await levelOf()).toMatchObject({ reach_level: 'NATIONAL', qualified_reach: 5 });

      // Seven qualified viewers is not enough for Global: it also needs an international audience.
      await watch(viewers[5]!, reelId, 6000).expect(202);
      await watch(viewers[6]!, reelId, 6000).expect(202); // the one abroad
      await scoring.scorePending();
      expect(await levelOf()).toMatchObject({ reach_level: 'GLOBAL', qualified_reach: 7 });
    });

    it('tells the author when they move up, once per rung', async () => {
      const notices = (
        await author.api('get', '/notifications', { query: { limit: 50 } }).expect(200)
      ).body.data as Array<{ type: string; data: Record<string, string> }>;
      const ups = notices.filter(
        (n) => n.type === 'REACH_MILESTONE' && n.data['reelId'] === reelId,
      );
      expect(ups.map((n) => n.data['level']).sort()).toEqual(['GLOBAL', 'NATIONAL', 'STATE']);
    });

    it('stores every score with the counts it came from, so it can be reproduced exactly', async () => {
      const scores = await row(
        'SELECT s.score, s.signals, s.level, s.config_version_id, s.qualified_reach, v.version FROM reach_scores s JOIN reach_config_versions v ON v.id = s.config_version_id WHERE s.reel_id = $1 ORDER BY s.computed_at',
        [reelId],
      );
      expect(scores.length).toBeGreaterThanOrEqual(4);
      expect(scores.every((s) => s.version === 2)).toBe(true);
      const last = scores[scores.length - 1]!;
      const stored = await configs.byId(last.config_version_id);
      const again = computeScore(stored!.config, last.signals.inputs as ReachAggregates);
      expect(again.score).toBe(Number(last.score));
      expect(again.level.toUpperCase()).toBe(last.level);
      expect(again.qualifiedReach).toBe(last.qualified_reach);
      // And the parts add up to the whole.
      const contributions = Object.values(
        last.signals.signals.contributions as Record<string, number>,
      );
      expect(contributions.reduce((a, b) => a + b, 0)).toBeCloseTo(Number(last.score), 1);
    });

    it('does not score again when nothing has changed', async () => {
      const before = (
        await row('SELECT count(*)::int AS n FROM reach_scores WHERE reel_id = $1', [reelId])
      )[0]!.n;
      expect(await scoring.scorePending()).toBe(0);
      expect(
        (await row('SELECT count(*)::int AS n FROM reach_scores WHERE reel_id = $1', [reelId]))[0]!
          .n,
      ).toBe(before);
    });

    it('lets only the author see the progress, with what is left for the next rung', async () => {
      const mine = (await author.api('get', `/reach/content/reel/${reelId}`).expect(200)).body.data;
      expect(mine).toMatchObject({ kind: 'reel', level: 'GLOBAL', qualifiedReach: 7, next: null });
      expect(mine.signals.map((s: any) => s.key)).toEqual([
        'qualifiedViewers',
        'watchCompletion',
        'shares',
        'saves',
        'comments',
        'geoExpansion',
        'trust',
      ]);
      expect(JSON.stringify(mine)).not.toMatch(/excluded|fraud/i);

      const other = await insertReel(t, author.id);
      const early = (await author.api('get', `/reach/content/reel/${other}`).expect(200)).body.data;
      expect(early).toMatchObject({ level: 'DISTRICT', score: null });
      expect(early.next.level).toBe('STATE');
      expect(early.next.requirements.map((r: any) => r.key)).toEqual([
        'qualifiedReach',
        'score',
        'districts',
      ]);

      await viewers[0]!.api('get', `/reach/content/reel/${reelId}`).expect(404); // not theirs
      await author.api('get', `/reach/content/video/${reelId}`).expect(404);
      await t.http.get(`/api/v1/reach/content/reel/${reelId}`).expect(401);
    });

    it('lets staff read the score history, and no one else', async () => {
      const hist = (await staff(analyst)('get', `/content/reel/${reelId}`).expect(200)).body.data;
      expect(hist[0]).toMatchObject({ configVersion: 2, level: 'GLOBAL' });
      await staff(tuner)('get', `/content/reel/${reelId}`).expect(403);
      await author.api('get', `/admin/reach/content/reel/${reelId}`).expect(401);
    });

    it('keeps a rung once earned when the rules get stricter, but re-scores under the new version', async () => {
      const strict = structuredClone(SMALL_LADDER(DEFAULT_REACH_CONFIG));
      strict.levels.state.minQualifiedReach = 500;
      strict.levels.national.minQualifiedReach = 5000;
      strict.levels.global.minQualifiedReach = 50_000;
      const draft = (
        await staff(tuner)('post', '/config/versions', { config: strict, note: 'Stricter' }).expect(
          201,
        )
      ).body.data;
      await staff(approver)('post', `/config/versions/${draft.id}/activate`, {
        reason: 'Raising the bar for launch',
      }).expect(200);

      expect(await scoring.scorePending()).toBeGreaterThanOrEqual(1);
      expect(await levelOf()).toMatchObject({ reach_level: 'GLOBAL' }); // not demoted
      const last = (
        await row(
          'SELECT v.version FROM reach_scores s JOIN reach_config_versions v ON v.id = s.config_version_id WHERE s.reel_id = $1 ORDER BY s.computed_at DESC LIMIT 1',
          [reelId],
        )
      )[0]!;
      expect(last.version).toBe(3);
      // A new piece of content, under the stricter rules, would not have got there.
      const fresh = await insertReel(t, author.id);
      for (const v of viewers.slice(0, 3)) await watch(v, fresh, 6000).expect(202);
      await scoring.scorePending();
      expect(await levelOf(fresh)).toMatchObject({ reach_level: 'DISTRICT', qualified_reach: 3 });
    });
  });

  // ----------------------------------------------------------- fake engagement --

  describe('suspected fake engagement', () => {
    it('sets aside engagement from the author’s own device, and it counts for nothing', async () => {
      const author = await person(t, {
        state: 'Telangana',
        district: 'Hyderabad',
        deviceId: 'shared-phone-1',
      });
      const sock = await person(t, {
        state: 'Kerala',
        district: 'Kochi',
        deviceId: 'shared-phone-1',
      });
      await t.db.query("UPDATE users SET created_at = now() - interval '3 days' WHERE id = $1", [
        sock.id,
      ]);
      const reel = await insertReel(t, author.id);
      await sock
        .api('post', '/reach/events', {
          body: {
            events: [
              {
                kind: 'reel',
                id: reel,
                type: 'WATCH',
                watchMs: 9000,
                eventId: randomUUID().replace(/-/g, ''),
              },
            ],
          },
        })
        .expect(202);
      const rows = await row(
        'SELECT type, excluded, fraud_score FROM reach_events WHERE viewer_id = $1',
        [sock.id],
      );
      expect(rows).toEqual([{ type: 'WATCH', excluded: true, fraud_score: 60 }]); // kept as evidence, no qualified view
      await sock.api('post', `/reels/${reel}/like`).expect(200);
      expect(
        (
          await row("SELECT excluded FROM reach_events WHERE viewer_id = $1 AND type = 'LIKE'", [
            sock.id,
          ])
        )[0],
      ).toEqual({ excluded: true });

      await scoring.scorePending();
      const reelRow = (
        await row('SELECT reach_level, qualified_reach FROM reels WHERE id = $1', [reel])
      )[0]!;
      expect(reelRow).toMatchObject({ qualified_reach: 0, reach_level: 'DISTRICT' });
      const score = (
        await row('SELECT excluded_events, signals FROM reach_scores WHERE reel_id = $1', [reel])
      )[0];
      // Nothing counted, but the evidence of what was set aside is on record.
      if (score) expect(score.excluded_events).toBeGreaterThanOrEqual(2);
    });

    it('sets aside a machine-speed burst from one account', async () => {
      const author = await person(t);
      const bot = await person(t, { state: 'Goa', district: 'Panaji' });
      await t.db.query("UPDATE users SET created_at = now() - interval '3 days' WHERE id = $1", [
        bot.id,
      ]);
      const reel = await insertReel(t, author.id);
      const batch = () =>
        bot.api('post', '/reach/events', {
          body: {
            events: Array.from({ length: 50 }, () => ({
              kind: 'reel',
              id: reel,
              type: 'WATCH',
              watchMs: 4000,
              eventId: randomUUID().replace(/-/g, ''),
            })),
          },
        });
      await batch().expect(202);
      await batch().expect(202);
      const rows = await row('SELECT type, excluded FROM reach_events WHERE viewer_id = $1', [
        bot.id,
      ]);
      expect(rows.filter((r) => r.excluded).length).toBeGreaterThan(0);
      expect(rows.filter((r) => r.type === 'QUALIFIED_VIEW' && !r.excluded)).toHaveLength(1); // still just one person
    });

    it('lowers a rung that fake engagement pushed content up to, once it is found out', async () => {
      const author = await person(t);
      const reel = await insertReel(t, author.id);
      const crowd: Person[] = [];
      for (const [state, district] of [
        ['Goa', 'Panaji'],
        ['Kerala', 'Kochi'],
        ['Assam', 'Guwahati'],
      ] as const) {
        const v = await person(t, { state, district });
        await t.db.query("UPDATE users SET created_at = now() - interval '3 days' WHERE id = $1", [
          v.id,
        ]);
        crowd.push(v);
        await v
          .api('post', '/reach/events', {
            body: {
              events: [
                {
                  kind: 'reel',
                  id: reel,
                  type: 'WATCH',
                  watchMs: 6000,
                  eventId: randomUUID().replace(/-/g, ''),
                },
              ],
            },
          })
          .expect(202);
      }
      await scoring.scorePending();
      expect((await row('SELECT reach_level FROM reels WHERE id = $1', [reel]))[0]).toEqual({
        reach_level: 'DISTRICT',
      }); // stricter v3 is active here
      // Lower the bar so the crowd would unlock State, score, then find two of them were fake.
      const easy = structuredClone(SMALL_LADDER(DEFAULT_REACH_CONFIG));
      const draft = (await staff(tuner)('post', '/config/versions', { config: easy }).expect(201))
        .body.data;
      await staff(approver)('post', `/config/versions/${draft.id}/activate`, {
        reason: 'Back to the small test ladder',
      }).expect(200);
      await scoring.scorePending();
      expect((await row('SELECT reach_level FROM reels WHERE id = $1', [reel]))[0]).toEqual({
        reach_level: 'STATE',
      });

      await t.db.query(
        'UPDATE reach_events SET excluded = true, fraud_score = 90 WHERE reel_id = $1 AND viewer_id IN ($2, $3)',
        [reel, crowd[0]!.id, crowd[1]!.id],
      );
      await scoring.scoreContent('reel', reel);
      expect(
        (await row('SELECT reach_level, qualified_reach FROM reels WHERE id = $1', [reel]))[0],
      ).toEqual({ reach_level: 'DISTRICT', qualified_reach: 1 });
    });
  });

  // ------------------------------------------------------- likes, saves, shares --

  describe('actions the server notices itself', () => {
    let author: Person;
    let fan: Person;
    let reel: string;
    let post: string;
    const kinds = async (viewerId: string) =>
      (
        await row(
          "SELECT type FROM reach_events WHERE viewer_id = $1 AND type IN ('LIKE','SAVE','SHARE','COMMENT')",
          [viewerId],
        )
      )
        .map((r) => r.type as string)
        .sort();

    beforeAll(async () => {
      author = await person(t);
      fan = await person(t, { state: 'Kerala', district: 'Kochi' });
      await t.db.query("UPDATE users SET created_at = now() - interval '3 days' WHERE id = $1", [
        fan.id,
      ]);
      reel = await insertReel(t, author.id);
      post = (await makePost(author)).id;
    });

    it('records a like, a save and a share once each, however often they are repeated or undone', async () => {
      for (let i = 0; i < 3; i++) {
        await fan.api('post', `/reels/${reel}/like`).expect(200);
        await fan.api('delete', `/reels/${reel}/like`).expect(200);
        await fan.api('post', `/reels/${reel}/like`).expect(200);
      }
      await fan.api('post', `/reels/${reel}/save`).expect(200);
      await fan.api('delete', `/reels/${reel}/save`).expect(200);
      await fan.api('post', `/reels/${reel}/save`).expect(200);
      await fan.api('post', `/reels/${reel}/share`, { body: { channel: 'LINK' } }).expect(200);
      expect(await kinds(fan.id)).toEqual(['LIKE', 'SAVE', 'SHARE']);
    });

    it('records only a meaningful comment, once, and not one on its own post', async () => {
      await fan.api('post', `/reels/${reel}/comments`, { body: { body: 'nice one' } }).expect(201); // too short
      expect(await kinds(fan.id)).not.toContain('COMMENT');
      await fan
        .api('post', `/reels/${reel}/comments`, { body: { body: 'aaaaaaaaaaaaaaaaaaaaaaaa' } })
        .expect(201); // filler
      expect(await kinds(fan.id)).not.toContain('COMMENT');
      await fan
        .api('post', `/reels/${reel}/comments`, {
          body: { body: 'really enjoyed the editing on this' },
        })
        .expect(201);
      await fan
        .api('post', `/reels/${reel}/comments`, {
          body: { body: 'and the music choice was great too' },
        })
        .expect(201);
      expect((await kinds(fan.id)).filter((k) => k === 'COMMENT')).toHaveLength(1);

      await author.api('post', `/reels/${reel}/like`).expect(200);
      await author
        .api('post', `/reels/${reel}/comments`, {
          body: { body: 'thanks everyone for the support' },
        })
        .expect(201);
      expect(await kinds(author.id)).toEqual([]);
    });

    it('records them for posts too, and counts nothing from an unverified-age account', async () => {
      await fan.api('post', `/posts/${post}/like`).expect(200);
      expect(
        (
          await row(
            'SELECT count(*)::int AS n FROM reach_events WHERE viewer_id = $1 AND post_id = $2',
            [fan.id, post],
          )
        )[0]!.n,
      ).toBe(1);
      const newcomer = await person(t);
      await newcomer.api('post', `/reels/${reel}/like`).expect(200);
      expect(await kinds(newcomer.id)).toEqual([]); // a brand-new account's likes do not count
    });
  });
});
