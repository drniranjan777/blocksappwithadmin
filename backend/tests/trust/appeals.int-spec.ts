import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SystemSettingsService } from '../../src/common/settings/system-settings.service.js';
import { staffSession, type StaffSession } from '../support/admin.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { AUTH_TEST_ENV, call } from '../support/auth.js';
import { makePost, person, type Person } from '../support/social.js';
import { people, report, staffRig, type StaffRig } from '../support/trust.js';

describe('appeals', () => {
  let t: TestApp;
  let staff: StaffRig;
  let senior2: StaffSession;

  beforeAll(async () => {
    t = await createTestApp({ ...AUTH_TEST_ENV });
    staff = await staffRig(t);
    senior2 = await staffSession(t, ['senior_moderator'], 'Saul Senior');
  }, 240_000);
  afterAll(async () => {
    await t.close();
  });

  const db = () => t.db.prisma;
  const as = (s: StaffSession) => staff.as(s);
  const notices = (userId: string) =>
    db().notification.findMany({
      where: { userId, type: 'MODERATION_DECISION' },
      orderBy: { createdAt: 'asc' },
    });
  const claim = (s: StaffSession, id: string) => as(s)('post', `/appeals/${id}/claim`);
  const decide = (
    s: StaffSession,
    id: string,
    decision: string,
    note = 'We looked at it again, carefully.',
  ) => as(s)('post', `/appeals/${id}/decision`, { body: { decision, note } });
  const appeal = (
    p: Person,
    decisionId: string,
    reason = 'I think this was a mistake because it was a joke',
  ) => p.api('post', '/appeals', { body: { moderationActionId: decisionId, reason } });
  const visibleTo = async (viewer: Person, id: string) =>
    (await viewer.api('get', `/posts/${id}`)).status === 200;

  /** Someone's post is reported and a staff member takes a decision on it. */
  async function decided(
    o: {
      action?: 'REMOVE' | 'RESTRICT' | 'WARN' | 'RESTRICT_USER' | 'SUSPEND_USER';
      by?: StaffSession;
      reason?: string;
    } = {},
  ) {
    const action = o.action ?? 'REMOVE';
    const author = await person(t);
    const [reporter] = await people(t, 1);
    const target = { type: 'POST', id: (await makePost(author)).id };
    const reportId = (await report(reporter, target, 'HARASSMENT').expect(201)).body.data
      .id as string;
    await as(o.by ?? staff.senior)('post', `/moderation/reports/${reportId}/decision`, {
      body: {
        action,
        policyReason: action.endsWith('_USER') ? 'account_standing' : 'harassment_bullying',
        notes: 'Internal: repeat offender, see ticket 4417',
      },
    }).expect(200);
    const decision = await db().moderationAction.findFirstOrThrow({
      where: { targetUserId: author.id, action },
    });
    return { author, reporter, target, reportId, decision };
  }

  // ================================================================== the person ==

  describe('the person who was moderated', () => {
    it('sees the decisions about them, the rule, and whether they can still appeal', async () => {
      const { author, reporter, decision, target } = await decided();
      const res = await author.api('get', '/moderation/decisions').expect(200);
      expect(res.body.data).toEqual([
        {
          id: decision.id,
          kind: 'REMOVED',
          targetType: 'POST',
          targetId: target.id,
          rule: 'Harassment and bullying',
          decidedAt: expect.any(String),
          reversed: false,
          appeal: null,
          canAppeal: true,
          appealUntil: expect.any(String),
        },
      ]);
      // Staff notes and who decided are never shown.
      expect(JSON.stringify(res.body)).not.toMatch(/repeat offender|ticket 4417|Sena|admin/i);
      // Nobody else sees it.
      expect((await reporter.api('get', '/moderation/decisions').expect(200)).body.data).toEqual(
        [],
      );
      await call(t, 'get', '/moderation/decisions').expect(401);
    });

    it('appeals once, is told it was received, and can follow it', async () => {
      const { author, decision } = await decided();
      const res = await appeal(author, decision.id).expect(201);
      expect(res.body.data).toMatchObject({
        status: 'OPEN',
        kind: 'MODERATION',
        reason: 'I think this was a mistake because it was a joke',
        decision: { id: decision.id, kind: 'REMOVED', rule: 'Harassment and bullying' },
        outcomeNote: null,
        decidedAt: null,
      });
      const row = await db().appeal.findUniqueOrThrow({ where: { id: res.body.data.id } });
      expect(row.userId).toBe(author.id);
      const hours = (row.slaDueAt!.getTime() - row.createdAt.getTime()) / 3_600_000;
      expect(hours).toBeCloseTo(72, 0);
      expect((await notices(author.id)).map((n) => n.title)).toContain('We got your appeal');

      const list = await author.api('get', '/appeals').expect(200);
      expect(list.body.data.map((a: any) => a.id)).toEqual([res.body.data.id]);
      await author.api('get', `/appeals/${res.body.data.id}`).expect(200);
      // The decision now shows the appeal, and no longer offers another.
      const decisions = await author.api('get', '/moderation/decisions').expect(200);
      expect(decisions.body.data[0]).toMatchObject({
        canAppeal: false,
        appeal: { id: res.body.data.id, status: 'OPEN' },
      });
      // A second attempt on the same decision is refused.
      const again = await appeal(author, decision.id).expect(409);
      expect(again.body.error.message).toMatch(/already appealed/);
    });

    it('lets only one of two simultaneous appeals through', async () => {
      const { author, decision } = await decided();
      const [a, b] = await Promise.all([appeal(author, decision.id), appeal(author, decision.id)]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      expect(await db().appeal.count({ where: { moderationActionId: decision.id } })).toBe(1);
    });

    it('cannot appeal someone else’s decision, or one that does not exist, or one that is not appealable', async () => {
      const { decision } = await decided();
      const stranger = await person(t);
      const theirs = await appeal(stranger, decision.id).expect(404);
      const none = await appeal(stranger, '01900000-0000-7000-8000-000000000005').expect(404);
      expect(theirs.body.error).toMatchObject({
        code: 'NOT_FOUND',
        message: none.body.error.message,
      });
      // Short reasons are refused.
      const mine = await decided();
      await appeal(mine.author, mine.decision.id, 'no').expect(400);
    });

    it('cannot appeal a finding of no violation, which is not a decision against anyone', async () => {
      const author = await person(t);
      const [reporter] = await people(t, 1);
      const target = { type: 'POST', id: (await makePost(author)).id };
      const reportId = (await report(reporter, target, 'SPAM').expect(201)).body.data.id as string;
      await as(staff.mod)('post', `/moderation/reports/${reportId}/decision`, {
        body: { action: 'APPROVE', policyReason: 'no_violation' },
      }).expect(200);
      const cleared = await db().moderationAction.findFirstOrThrow({
        where: { targetUserId: author.id },
      });
      const res = await appeal(author, cleared.id).expect(409);
      expect(res.body.error.message).toMatch(/cannot be appealed/);
      expect((await author.api('get', '/moderation/decisions').expect(200)).body.data).toEqual([]);
    });

    it('cannot appeal a decision that was already reversed, or one that is too old', async () => {
      const reversed = await decided();
      await as(staff.senior)('post', `/moderation/actions/${reversed.decision.id}/reverse`, {
        body: { reason: 'Reversed before they asked' },
      }).expect(200);
      const res = await appeal(reversed.author, reversed.decision.id).expect(409);
      expect(res.body.error.message).toMatch(/already reversed/);
      const listed = await reversed.author.api('get', '/moderation/decisions').expect(200);
      expect(listed.body.data[0]).toMatchObject({ reversed: true, canAppeal: false });

      const old = await decided();
      await db().moderationAction.update({
        where: { id: old.decision.id },
        data: { createdAt: new Date(Date.now() - 31 * 24 * 3_600_000) },
      });
      const late = await appeal(old.author, old.decision.id).expect(409);
      expect(late.body.error.message).toMatch(/time to appeal/);
      expect(
        (await old.author.api('get', '/moderation/decisions').expect(200)).body.data[0].canAppeal,
      ).toBe(false);

      // The window is policy: lengthen it and the same decision can be appealed.
      await db().systemSetting.upsert({
        where: { key: 'moderation.appeal_window_days' },
        create: { key: 'moderation.appeal_window_days', value: 90 },
        update: { value: 90 },
      });
      t.app.get(SystemSettingsService, { strict: false }).invalidate();
      try {
        await appeal(old.author, old.decision.id).expect(201);
      } finally {
        await db().systemSetting.deleteMany({ where: { key: 'moderation.appeal_window_days' } });
        t.app.get(SystemSettingsService, { strict: false }).invalidate();
      }
    });

    it('lets a restricted account appeal the restriction, but a suspended one cannot sign in to', async () => {
      const restricted = await decided({ action: 'RESTRICT_USER' });
      const res = await appeal(restricted.author, restricted.decision.id).expect(201);
      expect(res.body.data).toMatchObject({
        kind: 'ACCOUNT',
        decision: { kind: 'ACCOUNT_RESTRICTED' },
      });

      const suspended = await decided({ action: 'SUSPEND_USER' });
      await appeal(suspended.author, suspended.decision.id).expect(401);
    });

    it('only shows a person their own appeals', async () => {
      const a = await decided();
      const b = await decided();
      const mine = (await appeal(a.author, a.decision.id).expect(201)).body.data.id;
      await b.author.api('get', `/appeals/${mine}`).expect(404);
      expect((await b.author.api('get', '/appeals').expect(200)).body.data).toEqual([]);
    });
  });

  // ========================================================================= staff ==

  describe('reviewing', () => {
    it('lets people read appeals according to their role, and only seniors decide them', async () => {
      const { author, decision } = await decided();
      const id = (await appeal(author, decision.id).expect(201)).body.data.id as string;
      for (const s of [staff.mod, staff.senior, staff.support]) {
        await as(s)('get', '/appeals').expect(200);
        await as(s)('get', `/appeals/${id}`).expect(200);
      }
      await as(staff.analyst)('get', '/appeals').expect(403);
      // A moderator and a support agent can read but not take or decide.
      await claim(staff.mod, id).expect(403);
      await claim(staff.support, id).expect(403);
      await decide(staff.mod, id, 'UPHELD').expect(403);
    });

    it('lists the waiting ones oldest first, and the decided ones newest first', async () => {
      const made: string[] = [];
      for (let i = 0; i < 3; i++) {
        const d = await decided();
        made.push((await appeal(d.author, d.decision.id).expect(201)).body.data.id);
      }
      const waiting = (
        await as(staff.senior)('get', '/appeals', { query: { limit: 50 } }).expect(200)
      ).body.data;
      const mine = waiting.filter((a: any) => made.includes(a.id)).map((a: any) => a.id);
      expect(mine).toEqual(made);
      expect(waiting[0]).toMatchObject({ user: { username: expect.any(String) } });
      await claim(senior2, made[0]!).expect(200);
      await decide(
        senior2,
        made[0]!,
        'REJECTED',
        'This appeal has no grounds we can act on.',
      ).expect(200);
      const decidedList = (
        await as(staff.senior)('get', '/appeals', { query: { scope: 'decided' } }).expect(200)
      ).body.data;
      expect(decidedList[0]).toMatchObject({ id: made[0], status: 'REJECTED' });
      // Page through the waiting ones two at a time.
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 50; i++) {
        const page = await as(staff.senior)('get', '/appeals', {
          query: { limit: 2, ...(cursor ? { cursor } : {}) },
        }).expect(200);
        seen.push(...page.body.data.map((a: any) => a.id));
        cursor = page.body.meta?.nextCursor ?? undefined;
        if (!page.body.meta?.hasMore) break;
      }
      expect(new Set(seen).size).toBe(seen.length);
      expect(seen).toEqual(expect.arrayContaining(made.slice(1)));
    });

    it('does not let someone review a decision they made', async () => {
      const { author, decision } = await decided({ by: staff.senior });
      const id = (await appeal(author, decision.id).expect(201)).body.data.id as string;
      const detail = (await as(staff.senior)('get', `/appeals/${id}`).expect(200)).body.data;
      expect(detail.you).toEqual({
        madeTheOriginalDecision: true,
        canClaim: false,
        canDecide: false,
      });
      // They can see the notes they wrote, and the others cannot be hidden from staff.
      expect(detail.original).toMatchObject({
        notes: 'Internal: repeat offender, see ticket 4417',
        by: { name: 'Sena Senior' },
        policyTitle: 'Harassment and bullying',
      });
      const refused = await claim(staff.senior, id).expect(403);
      expect(refused.body.error.message).toMatch(/someone else has to review/);
      await decide(staff.senior, id, 'OVERTURNED').expect(403);
      // The database refuses it too, whatever the application did.
      await expect(
        db().appeal.update({ where: { id }, data: { assignedToId: staff.senior.admin.id } }),
      ).rejects.toThrow(/cannot be reviewed by the person who made the decision/);
      await expect(
        db().appeal.update({
          where: { id },
          data: { status: 'UPHELD', decidedById: staff.senior.admin.id, decidedAt: new Date() },
        }),
      ).rejects.toThrow();
      // Someone else can.
      expect((await claim(senior2, id).expect(200)).body.data.you.canDecide).toBe(true);
    });

    it('needs the appeal to be taken before it is decided, and by one person at a time', async () => {
      const { author, decision } = await decided();
      const id = (await appeal(author, decision.id).expect(201)).body.data.id as string;
      const early = await decide(senior2, id, 'UPHELD').expect(409);
      expect(early.body.error.message).toMatch(/Take this appeal/);
      await claim(senior2, id).expect(200);
      await claim(senior2, id).expect(200); // taking it again changes nothing
      await claim(staff.boss, id).expect(409);
      await decide(staff.boss, id, 'UPHELD').expect(409);
      // Only the reviewer can put it back.
      await as(staff.boss)('post', `/appeals/${id}/release`).expect(409);
      const back = await as(senior2)('post', `/appeals/${id}/release`).expect(200);
      expect(back.body.data).toMatchObject({ status: 'OPEN', assignedTo: null });
      await claim(staff.boss, id).expect(200);
    });

    it('upholds a decision: it stands, and the person is told with a note written for them', async () => {
      const { author, target, decision } = await decided();
      const id = (await appeal(author, decision.id).expect(201)).body.data.id as string;
      await claim(senior2, id).expect(200);
      const res = await decide(
        senior2,
        id,
        'UPHELD',
        'The comments were aimed at one person repeatedly.',
      ).expect(200);
      expect(res.body.data).toMatchObject({
        status: 'UPHELD',
        decidedBy: { name: 'Saul Senior' },
        decisionNote: 'The comments were aimed at one person repeatedly.',
      });
      expect(
        (await db().post.findUniqueOrThrow({ where: { id: target.id } })).moderationStatus,
      ).toBe('REMOVED');
      const mine = (await author.api('get', `/appeals/${id}`).expect(200)).body.data;
      expect(mine).toMatchObject({
        status: 'UPHELD',
        outcomeNote: 'The comments were aimed at one person repeatedly.',
        decidedAt: expect.any(String),
      });
      const told = await notices(author.id);
      expect(told.at(-1)).toMatchObject({ title: 'Your appeal was decided' });
      expect(told.at(-1)!.body).toMatch(/stands/);
      // Done is done.
      await decide(senior2, id, 'OVERTURNED').expect(409);
      const audit = await db().auditLog.findFirstOrThrow({
        where: { action: 'appeal.upheld', targetId: id },
      });
      expect(audit).toMatchObject({
        actorId: senior2.admin.id,
        reason: 'The comments were aimed at one person repeatedly.',
      });
    });

    it('overturns a decision: the content is restored, the history says why, and the person is told', async () => {
      const { author, reporter, target, decision } = await decided();
      const id = (await appeal(author, decision.id).expect(201)).body.data.id as string;
      expect(await visibleTo(reporter, target.id)).toBe(false);
      await claim(senior2, id).expect(200);
      const res = await decide(
        senior2,
        id,
        'OVERTURNED',
        'On a second look this was banter between friends.',
      ).expect(200);
      expect(res.body.data.status).toBe('OVERTURNED');
      expect(await visibleTo(reporter, target.id)).toBe(true);

      const reversal = await db().moderationAction.findFirstOrThrow({
        where: { reversalOfId: decision.id },
      });
      expect(reversal).toMatchObject({
        action: 'RESTORE',
        adminId: senior2.admin.id,
        policyReason: 'appeal_overturned',
        targetId: target.id,
      });
      const audit = await db().auditLog.findFirstOrThrow({
        where: { action: 'appeal.overturned', targetId: id },
      });
      expect((audit.after as any).reversalId).toBe(reversal.id);
      expect((await notices(author.id)).map((n) => n.title)).toEqual(
        expect.arrayContaining(['Your content is back', 'Your appeal was decided']),
      );
      // And the decision shows as reversed in the person's list.
      expect(
        (await author.api('get', '/moderation/decisions').expect(200)).body.data[0],
      ).toMatchObject({
        reversed: true,
        appeal: { status: 'OVERTURNED' },
      });
    });

    it('overturns an account restriction, reactivating the account', async () => {
      const { author, decision } = await decided({ action: 'RESTRICT_USER' });
      const id = (await appeal(author, decision.id).expect(201)).body.data.id as string;
      await claim(senior2, id).expect(200);
      await decide(
        senior2,
        id,
        'OVERTURNED',
        'The restriction was based on a mistaken identity.',
      ).expect(200);
      expect((await db().user.findUniqueOrThrow({ where: { id: author.id } })).status).toBe(
        'ACTIVE',
      );
      expect(
        await db().moderationAction.count({
          where: { reversalOfId: decision.id, action: 'REACTIVATE_USER' },
        }),
      ).toBe(1);
    });

    it('rejects an appeal without changing anything', async () => {
      const { author, target, decision } = await decided();
      const id = (await appeal(author, decision.id).expect(201)).body.data.id as string;
      await claim(senior2, id).expect(200);
      await decide(senior2, id, 'REJECTED', 'This is not a reason we can act on.').expect(200);
      expect(
        (await db().post.findUniqueOrThrow({ where: { id: target.id } })).moderationStatus,
      ).toBe('REMOVED');
      expect((await notices(author.id)).at(-1)!.body).toMatch(/could not take this appeal forward/);
    });

    it('needs a note, and only the three outcomes', async () => {
      const { author, decision } = await decided();
      const id = (await appeal(author, decision.id).expect(201)).body.data.id as string;
      await claim(senior2, id).expect(200);
      await as(senior2)('post', `/appeals/${id}/decision`, {
        body: { decision: 'UPHELD', note: 'ok' },
      }).expect(400);
      await as(senior2)('post', `/appeals/${id}/decision`, {
        body: { decision: 'MAYBE', note: 'Not sure about this' },
      }).expect(400);
      await as(senior2)('post', `/appeals/${id}/decision`, { body: { decision: 'UPHELD' } }).expect(
        400,
      );
    });

    it('closes a waiting appeal as overturned when the decision is taken back directly', async () => {
      const { author, decision } = await decided();
      const id = (await appeal(author, decision.id).expect(201)).body.data.id as string;
      await as(staff.senior)('post', `/moderation/actions/${decision.id}/reverse`, {
        body: { reason: 'Spotted the mistake while reviewing the queue' },
      }).expect(200);
      const row = await db().appeal.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({ status: 'OVERTURNED', decidedById: null });
      expect(row.decidedAt).not.toBeNull();
      expect((await author.api('get', `/appeals/${id}`).expect(200)).body.data).toMatchObject({
        status: 'OVERTURNED',
        outcomeNote: 'The decision was taken back before the appeal was reviewed.',
      });
      expect((await notices(author.id)).at(-1)).toMatchObject({ title: 'Your appeal was decided' });
    });

    it('does not half-overturn: if the decision cannot be undone, the appeal stays open', async () => {
      const { author, target, decision } = await decided({ action: 'RESTRICT' });
      const id = (await appeal(author, decision.id).expect(201)).body.data.id as string;
      // A later decision on the same item means this one cannot be undone on its own.
      const flagged = await as(staff.mod)('post', '/moderation/reports', {
        body: { targetType: 'POST', targetId: target.id, category: 'HARASSMENT' },
      }).expect(201);
      await as(staff.mod)('post', `/moderation/reports/${flagged.body.data.id}/decision`, {
        body: { action: 'REMOVE', policyReason: 'harassment_bullying' },
      }).expect(200);
      await claim(senior2, id).expect(200);
      const res = await decide(senior2, id, 'OVERTURNED').expect(409);
      expect(res.body.error.message).toMatch(/later decision/);
      const row = await db().appeal.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({ status: 'IN_REVIEW', decidedAt: null });
      expect(
        (await db().post.findUniqueOrThrow({ where: { id: target.id } })).moderationStatus,
      ).toBe('REMOVED');
    });

    it('lets an automatic hold be appealed and overturned like any other decision', async () => {
      const author = await person(t);
      const reporters = await people(t, 3);
      const target = { type: 'POST', id: (await makePost(author)).id };
      for (const r of reporters) await report(r, target, 'NUDITY').expect(201);
      const auto = await db().moderationAction.findFirstOrThrow({
        where: { targetId: target.id, source: 'AUTOMATED' },
      });
      const id = (await appeal(author, auto.id).expect(201)).body.data.id as string;
      // Nobody made it, so nobody is excluded from reviewing it.
      const detail = (await as(staff.boss)('get', `/appeals/${id}`).expect(200)).body.data;
      expect(detail.original).toMatchObject({ source: 'AUTOMATED', by: null });
      await claim(staff.boss, id).expect(200);
      await decide(staff.boss, id, 'OVERTURNED', 'Reviewed by hand: the post is fine.').expect(200);
      expect(
        (await db().post.findUniqueOrThrow({ where: { id: target.id } })).moderationStatus,
      ).toBe('APPROVED');
    });

    it('shows appeals that are past their time as overdue', async () => {
      const { author, decision } = await decided();
      const id = (await appeal(author, decision.id).expect(201)).body.data.id as string;
      await db().appeal.update({
        where: { id },
        data: { slaDueAt: new Date(Date.now() - 60_000) },
      });
      const late = (
        await as(staff.senior)('get', '/appeals', { query: { overdue: true } }).expect(200)
      ).body.data;
      expect(late.find((a: any) => a.id === id)).toMatchObject({ overdue: true });
      const summary = (await as(staff.senior)('get', '/moderation/summary').expect(200)).body.data;
      expect(summary.appeals.overdue).toBeGreaterThanOrEqual(1);
    });
  });
});
