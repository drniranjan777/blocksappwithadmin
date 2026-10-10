import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SystemSettingsService } from '../../src/common/settings/system-settings.service.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { AUTH_TEST_ENV, call } from '../support/auth.js';
import { insertReel, makePost, person, type Person } from '../support/social.js';
import { people, report, staffRig, type StaffRig } from '../support/trust.js';

describe('reporting, automatic holds and the moderation queue', () => {
  let t: TestApp;
  let staff: StaffRig;

  beforeAll(async () => {
    t = await createTestApp({ ...AUTH_TEST_ENV });
    staff = await staffRig(t);
  }, 240_000);
  afterAll(async () => {
    await t.close();
  });

  const db = () => t.db.prisma;
  const setting = async (key: string, value: unknown) => {
    await db().systemSetting.upsert({
      where: { key },
      create: { key, value: value as never },
      update: { value: value as never },
    });
    t.app.get(SystemSettingsService, { strict: false }).invalidate();
  };
  const clearSetting = async (key: string) => {
    await db().systemSetting.deleteMany({ where: { key } });
    t.app.get(SystemSettingsService, { strict: false }).invalidate();
  };
  const post = async (author: Person) => ({ type: 'POST', id: (await makePost(author)).id });
  /** Can `viewer` open the post? */
  const visible = async (viewer: Person, id: string) =>
    (await viewer.api('get', `/posts/${id}`)).status === 200;
  const open = (id: string) =>
    db().report.findMany({ where: { targetId: id }, orderBy: { createdAt: 'asc' } });

  // ===================================================================== reporting ==

  describe('a person reporting something', () => {
    let author: Person;
    let a: Person;
    let b: Person;

    beforeAll(async () => {
      [author, a, b] = await people(t, 3);
    });

    it('records the report with its severity, response time and a copy of what was reported', async () => {
      const target = await post(author);
      const res = await report(a, target, 'HARASSMENT', { description: 'Keeps tagging me' }).expect(
        201,
      );
      expect(res.body.data).toEqual({
        id: expect.any(String),
        status: 'RECEIVED',
        duplicate: false,
      });
      const [row] = await open(target.id);
      expect(row).toMatchObject({
        reporterId: a.id,
        source: 'USER',
        targetType: 'POST',
        targetUserId: author.id,
        category: 'HARASSMENT',
        severity: 'MEDIUM',
        status: 'OPEN',
        description: 'Keeps tagging me',
      });
      // HARASSMENT is answered within 24 hours.
      const hours = (row!.slaDueAt!.getTime() - row!.createdAt.getTime()) / 3_600_000;
      expect(hours).toBeCloseTo(24, 0);
      // What it was about is kept, in case the author edits or deletes it afterwards.
      expect((row!.evidence as any).snapshot).toMatchObject({
        ownerUsername: author.username,
        excerpt: expect.stringContaining('A post'),
      });
    });

    it('answers the same report again with the first one, so a double tap changes nothing', async () => {
      const target = await post(author);
      const first = await report(a, target, 'SPAM').expect(201);
      const second = await report(a, target, 'SPAM').expect(201);
      expect(second.body.data).toMatchObject({ id: first.body.data.id, duplicate: true });
      expect(await open(target.id)).toHaveLength(1);
      // A different reason is a different report.
      await report(a, target, 'FRAUD').expect(201);
      expect(await open(target.id)).toHaveLength(2);
    });

    it('survives two taps racing each other', async () => {
      const target = await post(author);
      const [x, y] = await Promise.all([report(a, target, 'SPAM'), report(a, target, 'SPAM')]);
      expect([x.status, y.status]).toEqual([201, 201]);
      expect(x.body.data.id).toBe(y.body.data.id);
      expect(await open(target.id)).toHaveLength(1);
    });

    it('does not let you report yourself', async () => {
      const own = await post(author);
      const res = await report(author, own).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details).toEqual([
        { field: 'targetId', reasons: ['cannot_report_yourself'] },
      ]);
      expect(await open(own.id)).toHaveLength(0);
    });

    it('treats something you cannot see exactly like something that does not exist', async () => {
      const hidden = await person(t, { private: true });
      const secret = await post(hidden);
      const gone = { type: 'POST', id: '01900000-0000-7000-8000-000000000001' };
      const a1 = await report(a, secret).expect(404);
      const a2 = await report(a, gone).expect(404);
      expect(a1.body.error.code).toBe(a2.body.error.code);
      expect(a1.body.error.message).toBe(a2.body.error.message);
      expect(await open(secret.id)).toHaveLength(0);
    });

    it('refuses what is not reportable, and bad input, without echoing it', async () => {
      const target = await post(author);
      // Messages do not exist yet.
      await report(a, { type: 'MESSAGE', id: target.id }).expect(400);
      await report(a, target, 'NOT_A_CATEGORY').expect(400);
      await report(a, { type: 'POST', id: 'nope' }).expect(400);
      await report(a, target, 'SPAM', { description: 'x'.repeat(1001) }).expect(400);
      await report(a, target, 'SPAM', {
        evidence: Array.from({ length: 6 }, () => ({
          kind: 'POST',
          id: '01900000-0000-7000-8000-000000000002',
        })),
      }).expect(400);
      // Unknown fields are refused, not ignored.
      await report(a, target, 'SPAM', { severity: 'CRITICAL', priority: 999 }).expect(400);
      expect(await open(target.id)).toHaveLength(0);
    });

    it('needs a signed-in person', async () => {
      const target = await post(author);
      await call(t, 'post', '/reports', {
        body: { targetType: 'POST', targetId: target.id, category: 'SPAM' },
      }).expect(401);
    });

    it('keeps evidence references, without duplicates', async () => {
      const target = await post(author);
      const other = await post(author);
      await report(a, target, 'HARASSMENT', {
        evidence: [
          { kind: 'POST', id: other.id },
          { kind: 'POST', id: other.id },
        ],
      }).expect(201);
      const [row] = await open(target.id);
      expect((row!.evidence as any).refs).toEqual([{ kind: 'POST', id: other.id }]);
    });

    it('stops one person flooding the queue', async () => {
      const flooder = await person(t);
      await setting('moderation.reports_per_day', 2);
      try {
        await report(flooder, await post(author)).expect(201);
        await report(flooder, await post(author)).expect(201);
        const third = await report(flooder, await post(author)).expect(429);
        expect(third.body.error.code).toBe('RATE_LIMITED');
        expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);
        // A repeat of one already made is not a new report, so it still gets its answer.
        const again = await db().report.findFirst({ where: { reporterId: flooder.id } });
        await report(
          flooder,
          { type: again!.targetType, id: again!.targetId },
          again!.category,
        ).expect(201);
      } finally {
        await clearSetting('moderation.reports_per_day');
      }
    });

    it('reports a comment, an account and a reel', async () => {
      const target = await post(author);
      const comment = await b
        .api('post', `/posts/${target.id}/comments`, { body: { body: 'rude words' } })
        .expect(201);
      await report(a, { type: 'COMMENT', id: comment.body.data.id }, 'HARASSMENT').expect(201);
      await report(a, { type: 'USER', id: b.id }, 'HARASSMENT').expect(201);
      const reelId = await insertReel(t, author.id);
      await report(a, { type: 'REEL', id: reelId }, 'MISINFORMATION').expect(201);
      const rows = await db().report.findMany({ where: { reporterId: a.id } });
      expect(rows.map((r) => r.targetType)).toEqual(
        expect.arrayContaining(['COMMENT', 'USER', 'REEL']),
      );
      expect(rows.find((r) => r.targetType === 'COMMENT')?.targetUserId).toBe(b.id);
    });

    it('shows you that your report was received, then reviewed, and nothing about the outcome', async () => {
      const [reporter, writer] = await people(t, 2);
      const target = await post(writer);
      const made = await report(reporter, target, 'SPAM').expect(201);
      let mine = await reporter.api('get', '/reports/mine').expect(200);
      expect(mine.body.data).toEqual([
        expect.objectContaining({ id: made.body.data.id, status: 'RECEIVED', reviewedAt: null }),
      ]);
      const claim = await staff.as(staff.mod)(
        'post',
        `/moderation/reports/${made.body.data.id}/claim`,
      );
      expect(claim.status).toBe(200);
      await staff
        .as(staff.mod)('post', `/moderation/reports/${made.body.data.id}/decision`, {
          body: { action: 'REMOVE', policyReason: 'spam' },
        })
        .expect(200);
      mine = await reporter.api('get', '/reports/mine').expect(200);
      expect(mine.body.data[0]).toMatchObject({ status: 'REVIEWED' });
      expect(JSON.stringify(mine.body)).not.toMatch(/REMOVE|RESOLVED|moderator|spam rule/i);
      // Another person's list does not include it.
      expect((await writer.api('get', '/reports/mine').expect(200)).body.data).toEqual([]);
    });
  });

  // ===================================================== priority and automatic holds ==

  describe('priority, automatic holds and incidents', () => {
    let author: Person;

    beforeAll(async () => {
      author = await person(t);
    });

    it('raises priority as different people report the same thing, never above a more severe one', async () => {
      const [r1, r2, r3] = await people(t, 3);
      const target = await post(author);
      await report(r1, target, 'HARASSMENT').expect(201);
      await report(r2, target, 'HARASSMENT').expect(201);
      await report(r3, target, 'HARASSMENT').expect(201);
      const rows = await open(target.id);
      // MEDIUM is 20, plus one point for each person beyond the first.
      expect(rows.map((r) => r.priority)).toEqual([22, 22, 22]);
      // One person reporting twice (two reasons) still counts as one person.
      const [solo] = await people(t, 1);
      const t2 = await post(author);
      await report(solo!, t2, 'HARASSMENT').expect(201);
      await report(solo!, t2, 'FRAUD').expect(201);
      expect((await open(t2.id)).map((r) => r.priority)).toEqual([20, 20]);
      // A critical report outranks any amount of low-severity ones.
      const crit = await post(author);
      await report(r1, crit, 'SELF_HARM').expect(201);
      expect((await open(crit.id))[0]!.priority).toBeGreaterThan(22);
    });

    it('hides content once enough different people report it, and tells its author', async () => {
      const [r1, r2, r3, viewer] = await people(t, 4);
      const target = await post(author);
      expect(await visible(viewer!, target.id)).toBe(true);
      await report(r1!, target, 'NUDITY').expect(201);
      await report(r2!, target, 'NUDITY').expect(201);
      // The same person again does not count twice.
      await report(r2!, target, 'NUDITY').expect(201);
      expect(await visible(viewer!, target.id)).toBe(true);
      await report(r3!, target, 'NUDITY').expect(201);

      expect(await visible(viewer!, target.id)).toBe(false);
      expect(await visible(author, target.id)).toBe(true); // its author still sees it
      const stored = await db().post.findUnique({ where: { id: target.id } });
      expect(stored!.moderationStatus).toBe('RESTRICTED');
      const action = await db().moderationAction.findFirstOrThrow({
        where: { targetId: target.id },
      });
      expect(action).toMatchObject({
        source: 'AUTOMATED',
        action: 'RESTRICT',
        adminId: null,
        policyReason: 'auto_hold_pending_review',
        targetUserId: author.id,
      });
      const audit = await db().auditLog.findFirst({
        where: { action: 'moderation.auto_hold', targetId: target.id },
      });
      expect(audit).toMatchObject({ actorType: 'SYSTEM', actorId: null });
      const told = await db().notification.findMany({
        where: {
          userId: author.id,
          type: 'MODERATION_DECISION',
          dedupeKey: `mod-action:${action.id}`,
        },
      });
      expect(told).toHaveLength(1);
      // It does not say who reported.
      expect(told[0]!.body).not.toContain(r1!.username);
    });

    it('does not hide anything for a category whose policy says not to', async () => {
      const rs = await people(t, 6);
      const target = await post(author);
      for (const r of rs) await report(r, target, 'SPAM').expect(201);
      expect((await db().post.findUnique({ where: { id: target.id } }))!.moderationStatus).toBe(
        'APPROVED',
      );
    });

    it('hides a child-safety report at once and opens one incident, however many follow', async () => {
      const [r1, r2] = await people(t, 2);
      const target = await post(author);
      await report(r1!, target, 'CHILD_SAFETY').expect(201);
      expect((await db().post.findUnique({ where: { id: target.id } }))!.moderationStatus).toBe(
        'RESTRICTED',
      );
      const first = await db().safetyIncident.findMany({
        where: { userId: author.id, type: 'CHILD_SAFETY' },
      });
      expect(first).toHaveLength(1);
      expect(first[0]).toMatchObject({
        type: 'CHILD_SAFETY',
        status: 'OPEN',
        severity: 'CRITICAL',
      });
      // The incident's summary points to the report; it carries no content.
      expect(first[0]!.summary).toContain('child safety');
      // Hidden content cannot be reported by someone who cannot see it; a report about another of
      // this person's posts adds to the same incident instead of opening a second.
      await report(r2!, target, 'CHILD_SAFETY').expect(404);
      await report(r2!, await post(author), 'CHILD_SAFETY').expect(201);
      const after = await db().safetyIncident.findMany({
        where: { userId: author.id, type: 'CHILD_SAFETY' },
        include: { events: true },
      });
      expect(after).toHaveLength(1);
      expect(after[0]!.events.map((e) => e.kind)).toEqual(['OPENED', 'NOTE']);
    });

    it('opens an incident for a self-harm report, and leaves the content up', async () => {
      const [r1] = await people(t, 1);
      const other = await person(t);
      const target = await post(other);
      await report(r1!, target, 'SELF_HARM').expect(201);
      expect((await db().post.findUnique({ where: { id: target.id } }))!.moderationStatus).toBe(
        'APPROVED',
      );
      const incident = await db().safetyIncident.findFirstOrThrow({ where: { userId: other.id } });
      expect(incident).toMatchObject({ type: 'SELF_HARM', status: 'OPEN' });
    });

    it('counts people, not reports, towards a hold, even across categories', async () => {
      // One account reporting for two reasons is still one person.
      const [r1] = await people(t, 1);
      const target = await post(author);
      for (const category of ['NUDITY', 'VIOLENCE'] as const) await report(r1!, target, category);
      await report(r1!, target, 'NUDITY'); // duplicate
      expect((await db().post.findUnique({ where: { id: target.id } }))!.moderationStatus).toBe(
        'APPROVED',
      );
    });
  });

  // ================================================================== the queue ==

  describe('the moderation queue', () => {
    let author: Person;
    let reporters: Person[];
    const ids: Record<string, string> = {};

    beforeAll(async () => {
      author = await person(t);
      reporters = await people(t, 2);
      const spam = await post(author);
      const harass = await post(author);
      const selfHarm = await post(author);
      const violent = await post(author);
      ids.spam = (await report(reporters[0]!, spam, 'SPAM').expect(201)).body.data.id;
      ids.harass = (await report(reporters[0]!, harass, 'HARASSMENT').expect(201)).body.data.id;
      ids.selfHarm = (await report(reporters[1]!, selfHarm, 'SELF_HARM').expect(201)).body.data.id;
      ids.violent = (await report(reporters[1]!, violent, 'VIOLENCE').expect(201)).body.data.id;
    });

    const queue = async (s = staff.mod, query: Record<string, string | number | boolean> = {}) =>
      (await staff.as(s)('get', '/moderation/reports', { query }).expect(200)).body;

    it('puts the most urgent first', async () => {
      const body = await queue(staff.mod, { limit: 50, targetUserId: author.id });
      const mine = body.data.filter((r: any) => Object.values(ids).includes(r.id));
      expect(mine.map((r: any) => r.category)).toEqual([
        'SELF_HARM', // critical
        'VIOLENCE', // high
        'HARASSMENT', // medium
        'SPAM', // low
      ]);
      expect(mine[0]).toMatchObject({
        severity: 'CRITICAL',
        status: 'OPEN',
        assignedTo: null,
        overdue: false,
        reportsOnTarget: 1,
        targetUser: { id: author.id, username: author.username },
        reporter: { username: reporters[1]!.username },
      });
    });

    it('pages without repeating or skipping anything', async () => {
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 100; i++) {
        const res = await staff
          .as(staff.mod)('get', '/moderation/reports', {
            query: { limit: 2, targetUserId: author.id, ...(cursor ? { cursor } : {}) },
          })
          .expect(200);
        seen.push(...res.body.data.map((r: any) => r.id));
        cursor = res.body.meta?.nextCursor ?? undefined;
        if (!res.body.meta?.hasMore) break;
      }
      const expected = await db().report.count({
        where: { targetUserId: author.id, status: { in: ['OPEN', 'IN_REVIEW', 'ESCALATED'] } },
      });
      expect(seen).toHaveLength(expected);
      expect(new Set(seen).size).toBe(seen.length);
    });

    it('filters by severity, category, kind, assignee and overdue', async () => {
      const bySeverity = await queue(staff.mod, { severity: 'CRITICAL', targetUserId: author.id });
      expect(bySeverity.data.every((r: any) => r.severity === 'CRITICAL')).toBe(true);
      const byCategory = await queue(staff.mod, { category: 'SPAM', targetUserId: author.id });
      expect(byCategory.data.map((r: any) => r.id)).toContain(ids.spam);
      expect(
        (await queue(staff.mod, { targetType: 'USER', targetUserId: author.id })).data,
      ).toEqual([]);
      const unassigned = await queue(staff.mod, {
        assignee: 'unassigned',
        targetUserId: author.id,
      });
      expect(unassigned.data.length).toBeGreaterThanOrEqual(4);
      expect((await queue(staff.mod, { assignee: 'me', targetUserId: author.id })).data).toEqual(
        [],
      );

      await db().report.update({
        where: { id: ids.spam! },
        data: { slaDueAt: new Date(Date.now() - 60_000) },
      });
      const late = await queue(staff.mod, { overdue: true, targetUserId: author.id });
      expect(late.data.map((r: any) => r.id)).toEqual([ids.spam]);
      expect(late.data[0].overdue).toBe(true);
      // "false" means false.
      const notLate = await queue(staff.mod, { overdue: false, targetUserId: author.id });
      expect(notLate.data.length).toBeGreaterThan(1);
      await staff
        .as(staff.mod)('get', '/moderation/reports', { query: { overdue: 'maybe' } })
        .expect(400);
    });

    it('lets people with reports.read read it, and nobody else', async () => {
      await staff.as(staff.support)('get', '/moderation/reports').expect(200);
      await staff.as(staff.analyst)('get', '/moderation/reports').expect(403);
      await staff.as(staff.analyst)('get', '/moderation/summary').expect(403);
      await call(t, 'get', '/admin/moderation/reports').expect(401);
      // An app user's token is not a staff token.
      await call(t, 'get', '/admin/moderation/reports', { token: author.accessToken }).expect(401);
      // Support can look but not take.
      await staff.as(staff.support)('post', `/moderation/reports/${ids.harass}/claim`).expect(403);
    });

    it('shows one report with what is needed to decide it, and only the options this person has', async () => {
      const target = await post(author);
      const [r1, r2] = reporters;
      const first = await report(r1!, target, 'HARASSMENT', { description: 'Targeted me' }).expect(
        201,
      );
      await report(r2!, target, 'FRAUD').expect(201);
      const res = await staff
        .as(staff.mod)('get', `/moderation/reports/${first.body.data.id}`)
        .expect(200);
      const d = res.body.data;
      expect(d).toMatchObject({
        id: first.body.data.id,
        category: 'HARASSMENT',
        description: 'Targeted me',
        reportsOnTarget: 2,
        target: {
          type: 'POST',
          available: true,
          state: 'APPROVED',
          owner: { id: author.id, username: author.username },
        },
        standing: { user: { id: author.id }, reportsAgainst: expect.any(Number) },
        evidence: { refs: [], snapshot: { ownerUsername: author.username } },
      });
      expect(d.otherReports).toHaveLength(1);
      expect(d.otherReports[0]).toMatchObject({ category: 'FRAUD' });
      // A moderator can hide, remove and warn but not suspend an account.
      expect(d.allowed.actions).toEqual(
        expect.arrayContaining(['APPROVE', 'DISMISS_REPORT', 'WARN', 'RESTRICT', 'REMOVE']),
      );
      expect(d.allowed.actions).not.toContain('SUSPEND_USER');
      expect(d.allowed.actions).not.toContain('RESTRICT_USER');
      expect(d.allowed).toMatchObject({ claim: true, release: false, escalate: true });
      const senior = await staff
        .as(staff.senior)('get', `/moderation/reports/${first.body.data.id}`)
        .expect(200);
      expect(senior.body.data.allowed.actions).toEqual(
        expect.arrayContaining(['SUSPEND_USER', 'RESTRICT_USER']),
      );
      // Support sees it but is offered nothing to do.
      const support = await staff
        .as(staff.support)('get', `/moderation/reports/${first.body.data.id}`)
        .expect(200);
      expect(support.body.data.allowed).toMatchObject({
        claim: false,
        escalate: false,
        actions: [],
      });
      // Unknown report.
      await staff
        .as(staff.mod)('get', '/moderation/reports/01900000-0000-7000-8000-000000000003')
        .expect(404);
    });

    it('lets staff flag something themselves, and says so', async () => {
      const target = await post(author);
      const res = await staff
        .as(staff.mod)('post', '/moderation/reports', {
          body: { targetType: 'POST', targetId: target.id, category: 'MISINFORMATION' },
        })
        .expect(201);
      expect(res.body.data).toMatchObject({ source: 'ADMIN', reporter: null, status: 'OPEN' });
      await staff
        .as(staff.support)('post', '/moderation/reports', {
          body: { targetType: 'POST', targetId: target.id, category: 'SPAM' },
        })
        .expect(403);
    });

    it('summarises the queue, limited to what the reader may see', async () => {
      const mod = (await staff.as(staff.mod)('get', '/moderation/summary').expect(200)).body.data;
      expect(mod.reports.active).toBeGreaterThan(0);
      expect(mod.reports.bySeverity.CRITICAL).toBeGreaterThan(0);
      expect(mod.reports.overdue).toBeGreaterThanOrEqual(1);
      expect(mod.appeals).toEqual({
        open: expect.any(Number),
        inReview: expect.any(Number),
        overdue: expect.any(Number),
      });
      expect(mod.incidents).not.toBeNull();
      const support = (await staff.as(staff.support)('get', '/moderation/summary').expect(200)).body
        .data;
      // Support may read appeals, but not incidents or live sessions.
      expect(support.appeals).not.toBeNull();
      expect(support.incidents).toBeNull();
      expect(support.live).toBeNull();
    });

    it('lists the published rules a decision can cite', async () => {
      const res = await staff.as(staff.mod)('get', '/moderation/rules').expect(200);
      expect(res.body.data.rules.map((r: any) => r.code)).toEqual(
        expect.arrayContaining(['harassment_bullying', 'no_violation', 'child_safety']),
      );
      expect(res.body.data.rules.map((r: any) => r.code)).not.toContain('auto_hold_pending_review');
    });
  });
});
