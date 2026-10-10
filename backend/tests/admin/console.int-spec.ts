import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SystemSettingsService } from '../../src/common/settings/system-settings.service.js';
import { MediaWorker } from '../../src/media/processing/media-worker.js';
import { PaymentSettings } from '../../src/payments/payment-settings.js';
import { adminCall, staffSession, type StaffSession } from '../support/admin.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { AUTH_TEST_ENV, logIn } from '../support/auth.js';
import { storageEnv, uploadSmall } from '../support/media.js';
import { person, type Person } from '../support/social.js';
import { makeImage, scratchDir, TOOLS } from '../support/tools.js';

type Method = 'get' | 'post' | 'put';

describe('the staff console: users, dashboard, settings and media review', () => {
  let t: TestApp;
  let boss: StaffSession; // super admin: everything, including full contact details
  let operations: StaffSession; // user_operations
  let support: StaffSession; // support_agent
  let moderator: StaffSession;
  let analyst: StaffSession; // readonly_analyst
  let auditor: StaffSession;
  const fixtures = scratchDir('blocks-console-');

  beforeAll(async () => {
    t = await createTestApp({
      ...AUTH_TEST_ENV,
      ...storageEnv(),
      MEDIA_TEMP_DIR: scratchDir('blocks-work-').dir,
      FFMPEG_PATH: TOOLS.ffmpeg,
      FFPROBE_PATH: TOOLS.ffprobe,
    });
    boss = await staffSession(t, ['super_admin']);
    operations = await staffSession(t, ['user_operations']);
    support = await staffSession(t, ['support_agent']);
    moderator = await staffSession(t, ['moderator']);
    analyst = await staffSession(t, ['readonly_analyst']);
    auditor = await staffSession(t, ['auditor']);
    await makeImage(join(fixtures.dir, 'photo.jpg'), { width: 800, height: 600 });
  }, 240_000);
  afterAll(async () => {
    fixtures.remove();
    await t.close();
  });

  /** Calls the staff API as one of the signed-in staff members. */
  const as =
    (s: StaffSession) =>
    (
      method: Method,
      path: string,
      o: { body?: object; query?: Record<string, string | number | boolean> } = {},
    ) =>
      adminCall(t, method, path, { token: s.accessToken, ...o });
  const rows = async (sql: string, args: unknown[] = []) =>
    (await t.db.query<Record<string, any>>(sql, args)).rows;
  const setting = async (key: string, value: unknown) => {
    await t.db.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value: value as never },
      update: { value: value as never },
    });
    t.app.get(SystemSettingsService, { strict: false }).invalidate();
  };
  const clearSetting = async (key: string) => {
    await t.db.prisma.systemSetting.deleteMany({ where: { key } });
    t.app.get(SystemSettingsService, { strict: false }).invalidate();
  };

  // ------------------------------------------------------------------- users --

  describe('app users', () => {
    let target: Person;

    beforeAll(async () => {
      target = await person(t, { state: 'Telangana', district: 'Hyderabad' });
      await Promise.all([person(t), person(t), person(t)]); // so there is something to page through
    });

    it('may be listed by staff who can read users, and by nobody else', async () => {
      for (const s of [operations, support, moderator, auditor, boss]) {
        expect((await as(s)('get', '/users')).status).toBe(200);
      }
      expect((await as(analyst)('get', '/users')).status).toBe(403); // analytics is not user data
      expect((await adminCall(t, 'get', '/users')).status).toBe(401);
    });

    it('searches by username, name or an exact e-mail, and never by part of a contact detail', async () => {
      const byName = await as(operations)('get', '/users', { query: { q: target.username } });
      expect(byName.body.data.map((u: any) => u.id)).toContain(target.id);
      const byEmail = await as(operations)('get', '/users', { query: { q: target.email } });
      expect(byEmail.body.data.map((u: any) => u.id)).toEqual([target.id]);
      expect(byEmail.body.data[0].email).toBe(`${target.email[0]}***@example.test`);
      expect(JSON.stringify(byEmail.body)).not.toContain(target.email); // masked in the result
      const partial = await as(operations)('get', '/users', {
        query: { q: target.email.slice(2, -3) }, // not a username prefix, not the whole address
      });
      expect(partial.body.data.map((u: any) => u.id)).not.toContain(target.id);
      expect((await as(operations)('get', '/users', { query: { status: 'NOPE' } })).status).toBe(
        400,
      );
    });

    it('pages with a cursor, newest first, without repeating anyone', async () => {
      const first = await as(operations)('get', '/users', { query: { limit: 2 } });
      expect(first.body.data).toHaveLength(2);
      expect(first.body.meta.hasMore).toBe(true);
      const second = await as(operations)('get', '/users', {
        query: { limit: 2, cursor: first.body.meta.nextCursor },
      });
      const seen = new Set(first.body.data.map((u: any) => u.id));
      expect(second.body.data.length).toBeGreaterThan(0);
      for (const u of second.body.data) expect(seen.has(u.id)).toBe(false);
    });

    it('shows full contact details only to those with that permission, and records every such look', async () => {
      const masked = (await as(operations)('get', `/users/${target.id}`)).body.data;
      expect(masked.email).toBe(`${target.email[0]}***@example.test`);
      expect(masked).toMatchObject({
        username: target.username,
        status: 'ACTIVE',
        emailVerified: true,
        identity: 'NOT_STARTED',
        monetization: 'NOT_ELIGIBLE',
        location: { state: 'Telangana', district: 'Hyderabad' },
      });
      const looks = () =>
        rows(
          "SELECT sensitive FROM audit_logs WHERE action = 'user.contact_viewed' AND target_id = $1",
          [target.id],
        );
      expect(await looks()).toEqual([]); // seeing masked details leaves no sensitive trace
      const full = (await as(boss)('get', `/users/${target.id}`)).body.data;
      expect(full.email).toBe(target.email);
      expect(await looks()).toEqual([{ sensitive: true }]);
      const missing = await as(operations)('get', '/users/00000000-0000-4000-8000-000000000000');
      expect(missing.status).toBe(404);
    });

    it('suspends with a reason, signs the person out everywhere, and shows it in their own history', async () => {
      const id = target.id;
      expect((await target.api('get', '/users/me/profile')).status).toBe(200);
      const byAgent = await as(support)('post', `/users/${id}/suspend`, {
        body: { reason: 'Support cannot suspend accounts' },
      });
      expect(byAgent.status).toBe(403);
      const brief = await as(operations)('post', `/users/${id}/suspend`, {
        body: { reason: 'short' },
      });
      expect(brief.status).toBe(400);

      const res = await as(operations)('post', `/users/${id}/suspend`, {
        body: { reason: 'Repeated harassment reports' },
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.data).toMatchObject({
        status: 'SUSPENDED',
        statusReason: 'Repeated harassment reports',
        activeSessions: 0,
      });
      // Their phone's token stops working at once, and they cannot sign back in.
      expect((await target.api('get', '/users/me/profile')).status).toBe(401);
      const again = await logIn(t, target);
      expect(again.status).toBe(403);
      expect(again.body.error.code).toBe('ACCOUNT_SUSPENDED');

      const [logged] = await rows(
        "SELECT reason, before, after FROM audit_logs WHERE action = 'user.suspend' AND target_id = $1",
        [id],
      );
      expect(logged).toMatchObject({
        reason: 'Repeated harassment reports',
        before: { status: 'ACTIVE' },
        after: { status: 'SUSPENDED' },
      });
      const events = await rows(
        "SELECT severity FROM security_events WHERE user_id = $1 AND type = 'ADMIN_ACTION'",
        [id],
      );
      expect(events).toEqual([{ severity: 'WARNING' }]);

      // A second suspension is a conflict, not a silent no-op.
      const twice = await as(operations)('post', `/users/${id}/suspend`, {
        body: { reason: 'Suspending them a second time' },
      });
      expect(twice.status).toBe(409);
      // And the list can be filtered to them.
      const filtered = await as(operations)('get', '/users', { query: { status: 'SUSPENDED' } });
      expect(filtered.body.data.map((u: any) => u.id)).toContain(id);
      expect(filtered.body.data.every((u: any) => u.status === 'SUSPENDED')).toBe(true);
    });

    it('restores with a reason, after which they can sign in again', async () => {
      const id = target.id;
      const restored = await as(operations)('post', `/users/${id}/restore`, {
        body: { reason: 'Appeal upheld by the review team' },
      });
      expect(restored.body.data.status).toBe('ACTIVE');
      expect((await logIn(t, target)).status).toBe(200);
      const twice = await as(operations)('post', `/users/${id}/restore`, {
        body: { reason: 'Restoring an account that is active' },
      });
      expect(twice.status).toBe(409);
    });

    it('restricts without signing out: the person stays in and can read, but cannot publish', async () => {
      const p = await person(t);
      const res = await as(operations)('post', `/users/${p.id}/restrict`, {
        body: { reason: 'Spam pattern under review' },
      });
      expect(res.body.data.status).toBe('RESTRICTED');
      expect((await p.api('get', '/users/me/profile')).status).toBe(200);
      for (const [path, body] of [
        ['/posts', { type: 'TEXT', caption: 'hello' }],
        ['/stories', { mediaId: '01990000-0000-7000-8000-000000000001' }],
      ] as const) {
        const blocked = await p.api('post', path, { body });
        expect(blocked.status, path).toBe(403);
        expect(blocked.body.error.code).toBe('ACCOUNT_RESTRICTED');
      }
      // Restoring lifts it.
      await as(operations)('post', `/users/${p.id}/restore`, {
        body: { reason: 'Review found no spam' },
      });
      const posted = await p.api('post', '/posts', { body: { type: 'TEXT', caption: 'hello' } });
      expect(posted.status).toBe(201);
      // Only an active account can be restricted.
      const q = await person(t);
      await as(operations)('post', `/users/${q.id}/suspend`, {
        body: { reason: 'Escalated straight to suspension' },
      });
      const bad = await as(operations)('post', `/users/${q.id}/restrict`, {
        body: { reason: 'Cannot restrict a suspended account' },
      });
      expect(bad.status).toBe(409);
    });

    it('signs a person out of every device on request, and keeps internal notes for those who may see them', async () => {
      const p = await person(t);
      const out = await as(operations)('post', `/users/${p.id}/sessions/revoke`, {
        body: { reason: 'Reported account takeover' },
      });
      expect(out.body.data.revoked).toBeGreaterThanOrEqual(1);
      expect((await p.api('get', '/users/me/profile')).status).toBe(401);
      const noReason = await as(operations)('post', `/users/${p.id}/sessions/revoke`, {
        body: { reason: 'x' },
      });
      expect(noReason.status).toBe(400);

      const note = await as(support)('post', `/users/${p.id}/notes`, {
        body: { body: 'Called back, identity confirmed' },
      });
      expect(note.status).toBe(201);
      const notes = (await as(support)('get', `/users/${p.id}/notes`)).body.data;
      expect(notes[0]).toMatchObject({
        body: 'Called back, identity confirmed',
        by: support.admin.name,
      });
      expect((await as(analyst)('get', `/users/${p.id}/notes`)).status).toBe(403);
      const unauthorised = await as(moderator)('post', `/users/${p.id}/notes`, {
        body: { body: 'not allowed' },
      });
      expect(unauthorised.status).toBe(403);
    });
  });

  // --------------------------------------------------------------- dashboard --

  describe('the dashboard', () => {
    it('counts real data, and each role gets only the sections it may read', async () => {
      const all = (await as(boss)('get', '/dashboard')).body.data;
      expect(Object.keys(all).sort()).toEqual([
        'content',
        'generatedAt',
        'money',
        'queues',
        'reach',
        'users',
      ]);
      const total = (
        await rows('SELECT count(*)::int AS n FROM users WHERE deleted_at IS NULL')
      )[0]!;
      expect(all.users.total).toBe(total.n);
      expect(all.users.signupsPerDay).toHaveLength(14);
      expect(all.users.signupsPerDay.at(-1).day).toBe(new Date().toISOString().slice(0, 10));
      const recent = (
        await rows(
          "SELECT count(*)::int AS n FROM users WHERE created_at >= now() - interval '14 days'",
        )
      )[0]!;
      const sum = all.users.signupsPerDay.reduce((s: number, d: any) => s + d.count, 0);
      expect(sum).toBeLessThanOrEqual(recent.n); // the oldest day is only partly inside the window
      expect(sum).toBeGreaterThan(0);
      expect(all.reach.activeConfigVersion).toBeGreaterThanOrEqual(1);
      expect(all.money).toMatchObject({
        currency: 'INR',
        owedToCreators: '0.00',
        payoutsInFlight: '0.00',
      });
      expect(Object.keys(all.queues).sort()).toEqual([
        'appealsOpen',
        'bankAccountsToReview',
        'campaignsInReview',
        'identityUnderReview',
        'incidentsOpen',
        'licencesEndingSoon',
        'mediaAwaitingReview',
        'mediaJobsFailed',
        'payoutsOnHold',
        'payoutsToReview',
        'reportsOpen',
        'verificationsPending',
      ]);

      // The analyst reads aggregates and the media queues, but never money or identity.
      const a = (await as(analyst)('get', '/dashboard')).body.data;
      expect(Object.keys(a).sort()).toEqual(['content', 'generatedAt', 'queues', 'reach', 'users']);
      expect(Object.keys(a.queues).sort()).toEqual([
        'licencesEndingSoon',
        'mediaAwaitingReview',
        'mediaJobsFailed',
      ]);
      expect(JSON.stringify(a)).not.toMatch(/owedToCreators|identityUnderReview/);

      // Support sees user counts and the reports and appeals queues, and nothing else.
      const s = (await as(support)('get', '/dashboard')).body.data;
      expect(Object.keys(s).sort()).toEqual(['generatedAt', 'queues', 'users']);
      expect(Object.keys(s.queues).sort()).toEqual(['appealsOpen', 'reportsOpen']);
      expect((await adminCall(t, 'get', '/dashboard')).status).toBe(401);
    });
  });

  // ---------------------------------------------------------------- settings --

  describe('settings', () => {
    it('are a closed list that people with settings.read can see, with their defaults', async () => {
      expect((await as(support)('get', '/settings')).status).toBe(403);
      const list = (await as(auditor)('get', '/settings')).body.data as any[];
      expect(list.find((s) => s.key === 'payouts.min_amount')).toMatchObject({
        value: '100.00',
        default: '100.00',
        isDefault: true,
        group: 'Payouts',
        version: 0,
      });
      const keys = list.map((s) => s.key);
      expect(keys).toEqual(
        expect.arrayContaining(['moderation.blocked_terms', 'stories.ttl_hours', 'kyc.valid_days']),
      );
      expect(keys).not.toContain('moderation.dev_decision'); // a developer-only knob
    });

    it('can be changed only by those who may, with a reason, and the change is audited', async () => {
      const put = (s: StaffSession, body: object) =>
        as(s)('put', '/settings/stories.ttl_hours', { body });
      expect((await put(auditor, { value: 12, reason: 'Shorter stories please' })).status).toBe(
        403,
      );
      expect((await put(boss, { value: 12 })).status).toBe(400); // no reason
      expect((await put(boss, { value: 12, reason: 'short' })).status).toBe(400);

      const done = await put(boss, { value: 12, reason: 'Shorter stories as an experiment' });
      expect(done.status, JSON.stringify(done.body)).toBe(200);
      expect(done.body.data).toMatchObject({ value: 12, isDefault: false, version: 1 });
      const [logged] = await rows(
        "SELECT reason, before, after FROM audit_logs WHERE action = 'settings.changed' AND target_id = 'stories.ttl_hours'",
      );
      expect(logged).toMatchObject({
        reason: 'Shorter stories as an experiment',
        before: { value: 24 },
        after: { value: 12 },
      });
      const next = await put(boss, { value: 6, reason: 'Trying an even shorter life' });
      expect(next.body.data.version).toBe(2);
    });

    it('refuses unknown keys and values that do not fit', async () => {
      const put = (key: string, value: unknown) =>
        as(boss)('put', `/settings/${key}`, { body: { value, reason: 'Testing what is refused' } });
      expect((await put('users.can_do_anything', true)).status).toBe(404);
      expect((await put('stories.ttl_hours', 500)).status).toBe(400);
      expect((await put('stories.ttl_hours', 'a day')).status).toBe(400);
      expect((await put('payouts.min_amount', '10.555')).status).toBe(400); // a fraction of a paisa
      expect((await put('payouts.min_amount', 100)).status).toBe(400); // an amount is a string
      expect((await put('moderation.blocked_terms', ['ok', 'x'])).status).toBe(400); // one term too short
    });

    it('keeps the payout limits consistent with each other', async () => {
      const cases: Array<[string, string]> = [
        ['payouts.min_amount', '60000.00'], // above the largest payout
        ['payouts.max_amount', '50.00'], // below the smallest
        ['payouts.daily_limit', '1000.00'], // below the largest single payout
        ['payouts.dual_approval_amount', '90000.00'], // would never apply
        ['payouts.review_amount', '55000.00'], // later than two approvers would be needed
      ];
      for (const [key, value] of cases) {
        const res = await as(boss)('put', `/settings/${key}`, {
          body: { value, reason: 'Testing that limits stay consistent' },
        });
        expect(res.status, `${key}=${value}`).toBe(400);
        expect(res.body.error.details[0].reasons[0], key).toMatch(/cannot|must/i);
      }
      // None of them was stored.
      expect(await rows("SELECT key FROM system_settings WHERE key LIKE 'payouts.%'")).toEqual([]);
    });

    it('take effect straight away where they are used', async () => {
      const limits = t.app.get(PaymentSettings, { strict: false });
      expect((await limits.payoutLimits()).min).toBe(10_000n);
      const raised = await as(boss)('put', '/settings/payouts.min_amount', {
        body: { value: '250.00', reason: 'Raising the minimum payout' },
      });
      expect(raised.status).toBe(200);
      expect((await limits.payoutLimits()).min).toBe(25_000n);
      const terms = await as(boss)('put', '/settings/moderation.blocked_terms', {
        body: { value: ['forbidden phrase'], reason: 'Adding a blocked term' },
      });
      expect(terms.status).toBe(200);
      const read = t.app.get(SystemSettingsService, { strict: false });
      expect(await read.get('moderation.blocked_terms', [])).toEqual(['forbidden phrase']);
    });
  });

  // ------------------------------------------------------------------- media --

  describe('media review', () => {
    let owner: Person;
    const photo = () => readFileSync(join(fixtures.dir, 'photo.jpg'));
    const processed = async () => {
      const { assetId } = await uploadSmall(t, owner, { bytes: photo() });
      await t.app.get(MediaWorker).drain();
      return assetId;
    };

    beforeAll(async () => {
      owner = await person(t);
      await setting('moderation.dev_decision', 'REVIEW'); // every photo waits for a person
    });
    afterAll(() => clearSetting('moderation.dev_decision'));

    it('shows what waits for a person, and lets a moderator decide, releasing what depends on it', async () => {
      const [a, b] = [await processed(), await processed()];
      const post = await owner.api('post', '/posts', {
        body: { type: 'PHOTO', caption: 'two photos', mediaIds: [a, b] },
      });
      expect(post.status, JSON.stringify(post.body)).toBe(201);
      expect(post.body.data.moderation).toEqual({ status: 'PENDING', held: true });

      expect((await as(support)('get', '/media/review')).status).toBe(403);
      const queue = (await as(moderator)('get', '/media/review')).body.data as any[];
      const mine = queue.filter((q) => q.ownerId === owner.id);
      expect(mine.map((q) => q.id).sort()).toEqual([a, b].sort());
      // The reviewer sees a processed copy, never the original.
      expect(mine[0].media.thumbnailUrl).toEqual(expect.any(String));
      expect(JSON.stringify(queue)).not.toContain('orig/');

      const decide = (id: string, decision: string, note: string) =>
        as(moderator)('post', `/media/review/${id}/decision`, { body: { decision, note } });
      expect((await decide(a, 'APPROVE', 'short')).status).toBe(400);
      expect((await decide(a, 'APPROVE', 'Ordinary holiday photo')).status).toBe(200);
      // One of two cleared is not enough for the post.
      const held = await owner.api('get', `/posts/${post.body.data.id}`);
      expect(held.body.data.moderation.held).toBe(true);
      expect((await decide(b, 'APPROVE', 'Ordinary holiday photo, second')).status).toBe(200);
      const released = await owner.api('get', `/posts/${post.body.data.id}`);
      expect(released.body.data.moderation).toEqual({ status: 'APPROVED', held: false });
      // A decision, once made, cannot be silently overturned from the same queue.
      expect((await decide(a, 'REJECT', 'Changing my mind afterwards')).status).toBe(409);
      expect(
        await rows(
          "SELECT reason FROM audit_logs WHERE action = 'media.approve' AND target_id = $1",
          [a],
        ),
      ).toEqual([{ reason: 'Ordinary holiday photo' }]);
      // Nothing of theirs is left in the queue.
      const after = (await as(moderator)('get', '/media/review')).body.data as any[];
      expect(after.filter((q) => q.ownerId === owner.id)).toEqual([]);
    }, 120_000);

    it('takes down whatever uses a refused file, and removes the file', async () => {
      const a = await processed();
      const post = await owner.api('post', '/posts', {
        body: { type: 'PHOTO', caption: 'one photo', mediaIds: [a] },
      });
      const res = await as(moderator)('post', `/media/review/${a}/decision`, {
        body: { decision: 'REJECT', note: 'Shows a private document' },
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const [asset] = await rows(
        'SELECT status, moderation_status FROM media_assets WHERE id = $1',
        [a],
      );
      expect(asset).toEqual({ status: 'REJECTED', moderation_status: 'REMOVED' });
      const gone = await owner.api('get', `/posts/${post.body.data.id}`);
      expect(gone.body.data.moderation.status).toBe('REMOVED');
      const notADecision = await as(moderator)('post', `/media/review/${a}/decision`, {
        body: { decision: 'MAYBE', note: 'Not a decision' },
      });
      expect(notADecision.status).toBe(400);
    }, 120_000);

    it('lists failed jobs and retries them, but not files that were refused', async () => {
      const { assetId: a } = await uploadSmall(t, owner, { bytes: photo() });
      await t.db.query(
        "UPDATE media_jobs SET status = 'FAILED', attempts = 3, last_error = 'ffmpeg failed: out of memory', finished_at = now() WHERE asset_id = $1",
        [a],
      );
      await t.db.query(
        "UPDATE media_assets SET status = 'FAILED', failure_code = 'PROCESSING_FAILED' WHERE id = $1",
        [a],
      );

      const failed = (await as(moderator)('get', '/media/jobs', { query: { status: 'FAILED' } }))
        .body.data as any[];
      const job = failed.find((j) => j.asset.id === a);
      expect(job).toMatchObject({
        type: 'VALIDATE',
        status: 'FAILED',
        attempts: 3,
        lastError: 'ffmpeg failed: out of memory',
      });
      expect((await as(support)('get', '/media/jobs')).status).toBe(403);
      // media.retry is held by someone else.
      expect((await as(moderator)('post', `/media/jobs/${job.id}/retry`)).status).toBe(403);

      expect((await as(boss)('post', `/media/jobs/${job.id}/retry`)).status).toBe(200);
      expect(
        (await rows('SELECT status, attempts FROM media_jobs WHERE id = $1', [job.id]))[0],
      ).toEqual({ status: 'QUEUED', attempts: 0 });
      expect((await rows('SELECT status FROM media_assets WHERE id = $1', [a]))[0]!.status).toBe(
        'UPLOADED',
      );
      expect((await as(boss)('post', `/media/jobs/${job.id}/retry`)).status).toBe(409); // no longer failed
      await t.app.get(MediaWorker).drain();
      expect((await rows('SELECT status FROM media_assets WHERE id = $1', [a]))[0]!.status).toBe(
        'READY',
      );
      expect(
        await rows(
          "SELECT 1 FROM audit_logs WHERE action = 'media.job_retried' AND target_id = $1",
          [job.id],
        ),
      ).toHaveLength(1);

      // A refused file is refused, not broken: retrying cannot change that.
      const { assetId: refused } = await uploadSmall(t, owner, { bytes: photo() });
      await t.db.query("UPDATE media_jobs SET status = 'FAILED' WHERE asset_id = $1", [refused]);
      await t.db.query(
        "UPDATE media_assets SET status = 'REJECTED', failure_code = 'MODERATION_REJECTED' WHERE id = $1",
        [refused],
      );
      const refusedJob = (
        await rows('SELECT id FROM media_jobs WHERE asset_id = $1', [refused])
      )[0]!;
      expect((await as(boss)('post', `/media/jobs/${refusedJob.id}/retry`)).status).toBe(409);
    }, 120_000);
  });
});
