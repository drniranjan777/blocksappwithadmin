import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../support/app.js';
import { AUTH_TEST_ENV } from '../support/auth.js';
import type { StaffSession } from '../support/admin.js';
import { insertMedia, insertReel, makePost, person, type Person } from '../support/social.js';
import { people, report, staffRig, type StaffRig } from '../support/trust.js';

describe('working a report: claiming, deciding, escalating and taking decisions back', () => {
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
  const as = (s: StaffSession) => staff.as(s);
  const claim = (s: StaffSession, id: string) => as(s)('post', `/moderation/reports/${id}/claim`);
  const decide = (s: StaffSession, id: string, body: Record<string, unknown>) =>
    as(s)('post', `/moderation/reports/${id}/decision`, { body });
  const detail = async (s: StaffSession, id: string) =>
    (await as(s)('get', `/moderation/reports/${id}`).expect(200)).body.data;
  const visibleTo = async (viewer: Person, id: string) =>
    (await viewer.api('get', `/posts/${id}`)).status === 200;
  const notices = (userId: string) =>
    db().notification.findMany({
      where: { userId, type: 'MODERATION_DECISION' },
      orderBy: { createdAt: 'asc' },
    });

  /** An author, their post and one or more people who reported it. */
  async function scenario(category = 'HARASSMENT', reporterCount = 1) {
    const author = await person(t);
    const reporters = await people(t, reporterCount);
    const target = { type: 'POST', id: (await makePost(author)).id };
    const reportIds: string[] = [];
    for (const r of reporters) {
      reportIds.push((await report(r, target, category).expect(201)).body.data.id);
    }
    return { author, reporters, target, reportId: reportIds[0]!, reportIds };
  }

  // ================================================================== taking it ==

  describe('claiming, assigning and releasing', () => {
    it('lets one moderator take a report, and refuses the second', async () => {
      const { reportId } = await scenario();
      const first = await claim(staff.mod, reportId).expect(200);
      expect(first.body.data).toMatchObject({
        status: 'IN_REVIEW',
        assignedTo: { id: staff.mod.admin.id, name: 'Mina Moderator' },
      });
      // Taking your own again changes nothing.
      await claim(staff.mod, reportId).expect(200);
      const second = await claim(staff.mod2, reportId).expect(409);
      expect(second.body.error.code).toBe('CONFLICT');
      expect(second.body.error.details).toEqual({ assignedToId: staff.mod.admin.id });
      const audits = await db().auditLog.findMany({
        where: { action: 'report.claim', targetId: reportId },
      });
      expect(audits).toHaveLength(1); // the repeat was not a second event
    });

    it('lets exactly one of two moderators win a race', async () => {
      const { reportId } = await scenario();
      const [a, b] = await Promise.all([claim(staff.mod, reportId), claim(staff.mod2, reportId)]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const row = await db().report.findUniqueOrThrow({ where: { id: reportId } });
      expect([staff.mod.admin.id, staff.mod2.admin.id]).toContain(row.assignedToId);
    });

    it('lets only the holder, or a senior, put it back', async () => {
      const { reportId } = await scenario();
      await claim(staff.mod, reportId).expect(200);
      await as(staff.mod2)('post', `/moderation/reports/${reportId}/release`).expect(403);
      const back = await as(staff.mod)('post', `/moderation/reports/${reportId}/release`).expect(
        200,
      );
      expect(back.body.data).toMatchObject({ status: 'OPEN', assignedTo: null });
      await claim(staff.mod, reportId).expect(200);
      await as(staff.senior)('post', `/moderation/reports/${reportId}/release`).expect(200);
      expect((await detail(staff.mod, reportId)).assignedTo).toBeNull();
    });

    it('hands a report to someone able to decide it, and only a senior takes one off a colleague', async () => {
      const { reportId } = await scenario();
      const given = await as(staff.mod)('post', `/moderation/reports/${reportId}/assign`, {
        body: { adminId: staff.mod2.admin.id },
      }).expect(200);
      expect(given.body.data).toMatchObject({
        status: 'IN_REVIEW',
        assignedTo: { id: staff.mod2.admin.id },
      });
      // A support agent cannot decide reports, so cannot be given one.
      const toSupport = await as(staff.senior)('post', `/moderation/reports/${reportId}/assign`, {
        body: { adminId: staff.support.admin.id },
      }).expect(400);
      expect(toSupport.body.error.details).toEqual([
        { field: 'adminId', reasons: ['cannot_handle_this_report'] },
      ]);
      // Taking it off mod2 is for seniors.
      await as(staff.mod)('post', `/moderation/reports/${reportId}/assign`, {
        body: { adminId: staff.mod.admin.id },
      }).expect(403);
      await as(staff.senior)('post', `/moderation/reports/${reportId}/assign`, {
        body: { adminId: staff.senior.admin.id },
      }).expect(200);
      expect((await detail(staff.mod, reportId)).assignedTo.id).toBe(staff.senior.admin.id);
      // Not a real member of staff.
      await as(staff.senior)('post', `/moderation/reports/${reportId}/assign`, {
        body: { adminId: '01900000-0000-7000-8000-000000000009' },
      }).expect(400);
    });

    it('does not let someone else decide a report you hold', async () => {
      const { reportId, target } = await scenario();
      await claim(staff.mod, reportId).expect(200);
      const res = await decide(staff.mod2, reportId, {
        action: 'REMOVE',
        policyReason: 'harassment_bullying',
      }).expect(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(
        (await db().post.findUniqueOrThrow({ where: { id: target.id } })).moderationStatus,
      ).toBe('APPROVED');
    });

    it('takes an unclaimed report for you when you decide it', async () => {
      const { reportId } = await scenario();
      const res = await decide(staff.mod, reportId, {
        action: 'WARN',
        policyReason: 'harassment_bullying',
      }).expect(200);
      expect(res.body.data.assignedTo.id).toBe(staff.mod.admin.id);
    });
  });

  // ================================================================== deciding ==

  describe('deciding', () => {
    it('removes content under a published rule, records it, audits it, and tells the right people', async () => {
      const { author, reporters, target, reportId } = await scenario('HARASSMENT', 3);
      const [r1, r2, r3] = reporters as [Person, Person, Person];
      await claim(staff.mod, reportId).expect(200);
      const res = await decide(staff.mod, reportId, {
        action: 'REMOVE',
        policyReason: 'harassment_bullying',
        notes: 'Calls her names across several comments. Internal only.',
      }).expect(200);

      expect(res.body.data).toMatchObject({
        status: 'RESOLVED',
        resolution: 'Calls her names across several comments. Internal only.',
        target: { state: 'REMOVED' },
      });
      expect(res.body.data.resolvedAt).toEqual(expect.any(String));
      expect(
        (await db().post.findUniqueOrThrow({ where: { id: target.id } })).moderationStatus,
      ).toBe('REMOVED');
      expect(await visibleTo(r1, target.id)).toBe(false);

      // The decision is recorded with the rule it enforced and who made it.
      const action = await db().moderationAction.findFirstOrThrow({
        where: { targetId: target.id, action: 'REMOVE' },
      });
      expect(action).toMatchObject({
        adminId: staff.mod.admin.id,
        source: 'ADMIN',
        reportId,
        targetUserId: author.id,
        policyReason: 'harassment_bullying',
      });
      // ... and audited in the same step.
      const audit = await db().auditLog.findFirstOrThrow({
        where: { action: 'moderation.remove', targetId: reportId },
      });
      expect(audit).toMatchObject({
        actorId: staff.mod.admin.id,
        reason: 'Calls her names across several comments. Internal only.',
      });
      expect((audit.after as any).moderationActionId).toBe(action.id);

      // The other two reports about the same item, same reason, were answered by the same decision.
      const rows = await db().report.findMany({ where: { targetId: target.id } });
      expect(rows.map((r) => r.status)).toEqual(['RESOLVED', 'RESOLVED', 'RESOLVED']);
      expect(
        rows.filter((r) => r.id !== reportId).every((r) => r.resolution?.includes(reportId)),
      ).toBe(true);
      expect(res.body.data.history[0]).toMatchObject({
        action: 'REMOVE',
        by: { name: 'Mina Moderator' },
      });

      // Each person who reported is told it was looked at, and nothing more.
      for (const r of [r1, r2, r3]) {
        const got = await notices(r.id);
        expect(got).toHaveLength(1);
        expect(got[0]!.body).toMatch(/took action/);
        expect(got[0]!.body).not.toContain(author.username);
      }
      // The author is told, with the rule, how to appeal, and not who reported or what staff wrote.
      const told = await notices(author.id);
      expect(told).toHaveLength(1);
      expect(told[0]!.body).toMatch(/removed/);
      expect(told[0]!.body).toMatch(/appeal/);
      expect(JSON.stringify(told)).not.toMatch(
        new RegExp(`${r1.username}|${r2.username}|${r3.username}|names across|Internal only`),
      );
      expect((told[0]!.data as any).actionId).toBe(action.id);
    });

    it('refuses a decision whose rule does not fit it', async () => {
      const { reportId } = await scenario();
      const bad = async (body: Record<string, unknown>) => {
        const res = await decide(staff.mod, reportId, body).expect(400);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
        return res.body.error.details;
      };
      // Nothing is removed for "no violation", and nothing is cleared for a rule breach.
      expect(await bad({ action: 'REMOVE', policyReason: 'no_violation' })).toEqual([
        { field: 'policyReason', reasons: ['does_not_fit_this_decision'] },
      ]);
      await bad({ action: 'APPROVE', policyReason: 'spam' });
      await bad({ action: 'REMOVE', policyReason: 'report_in_bad_faith' });
      await bad({ action: 'REMOVE', policyReason: 'auto_hold_pending_review' }); // the system's own code
      await bad({ action: 'REMOVE', policyReason: 'made_up' });
      // Account standing is for decisions about the account.
      await bad({ action: 'REMOVE', policyReason: 'account_standing' });
      await bad({ action: 'ESCALATE', policyReason: 'spam' } as never);
      await bad({ action: 'REMOVE' });
      const row = await db().report.findUniqueOrThrow({ where: { id: reportId } });
      expect(row.status).toBe('OPEN');
    });

    it('needs the permission for what the decision does, on top of being able to decide', async () => {
      const { reportId, author } = await scenario();
      // A moderator can hide and remove content, not act on the account.
      await decide(staff.mod, reportId, {
        action: 'SUSPEND_USER',
        policyReason: 'account_standing',
      }).expect(403);
      await decide(staff.mod, reportId, {
        action: 'RESTRICT_USER',
        policyReason: 'account_standing',
      }).expect(403);
      // Support can read reports but not decide them.
      await decide(staff.support, reportId, {
        action: 'WARN',
        policyReason: 'harassment_bullying',
      }).expect(403);
      await decide(staff.analyst, reportId, {
        action: 'WARN',
        policyReason: 'harassment_bullying',
      }).expect(403);
      expect((await db().user.findUniqueOrThrow({ where: { id: author.id } })).status).toBe(
        'ACTIVE',
      );
      expect((await db().report.findUniqueOrThrow({ where: { id: reportId } })).status).toBe(
        'OPEN',
      );
    });

    it('lets a senior suspend an account: signed out everywhere, recorded, told, and reversible', async () => {
      const { author, reportId } = await scenario('FRAUD');
      expect((await author.api('get', '/notifications')).status).toBe(200);
      const res = await decide(staff.senior, reportId, {
        action: 'SUSPEND_USER',
        policyReason: 'fraud_scams',
        notes: 'Runs the same fake giveaway from three accounts',
      }).expect(200);
      expect(res.body.data).toMatchObject({ status: 'RESOLVED' });
      expect((await db().user.findUniqueOrThrow({ where: { id: author.id } })).status).toBe(
        'SUSPENDED',
      );
      // Their token stops working at once.
      expect((await author.api('get', '/notifications')).status).toBe(401);

      const action = await db().moderationAction.findFirstOrThrow({
        where: { targetUserId: author.id, action: 'SUSPEND_USER' },
      });
      expect(action).toMatchObject({
        adminId: staff.senior.admin.id,
        reportId,
        targetType: 'USER',
        targetId: author.id,
        policyReason: 'fraud_scams',
      });
      const told = await notices(author.id);
      expect(told.map((n) => n.title)).toEqual(['Your BLOCKS account was suspended']);

      // A moderator cannot undo it; a senior can, and it appears in history as a reversal.
      await as(staff.mod)('post', `/moderation/actions/${action.id}/reverse`, {
        body: { reason: 'Looks wrong to me' },
      }).expect(403);
      const back = await as(staff.senior)('post', `/moderation/actions/${action.id}/reverse`, {
        body: { reason: 'Verified with the account owner that it was a mistake' },
      }).expect(200);
      expect(back.body.data).toMatchObject({ id: action.id, reversed: true });
      expect((await db().user.findUniqueOrThrow({ where: { id: author.id } })).status).toBe(
        'ACTIVE',
      );
      const reversal = await db().moderationAction.findFirstOrThrow({
        where: { reversalOfId: action.id },
      });
      expect(reversal).toMatchObject({ action: 'REACTIVATE_USER', adminId: staff.senior.admin.id });
      await as(staff.senior)('post', `/moderation/actions/${action.id}/reverse`, {
        body: { reason: 'Again, for good measure' },
      }).expect(409);
    });

    it('restricts an account so it can read but not publish, until it is lifted', async () => {
      const { author, reportId } = await scenario('SPAM');
      await decide(staff.senior, reportId, {
        action: 'RESTRICT_USER',
        policyReason: 'spam',
      }).expect(200);
      expect((await author.api('get', '/notifications')).status).toBe(200);
      const blocked = await author
        .api('post', '/posts', { body: { type: 'TEXT', caption: 'Hello again' } })
        .expect(403);
      expect(blocked.body.error.code).toBe('ACCOUNT_RESTRICTED');
      // Their existing content is not shown to others meanwhile.
      const action = await db().moderationAction.findFirstOrThrow({
        where: { targetUserId: author.id, action: 'RESTRICT_USER' },
      });
      await as(staff.senior)('post', `/moderation/actions/${action.id}/reverse`, {
        body: { reason: 'Restriction served; lifting it' },
      }).expect(200);
      await author
        .api('post', '/posts', { body: { type: 'TEXT', caption: 'Back again' } })
        .expect(201);
    });

    it('warns without taking anything down', async () => {
      const { author, target, reportId } = await scenario('MISINFORMATION');
      const res = await decide(staff.mod, reportId, {
        action: 'WARN',
        policyReason: 'misinformation',
        notes: 'First offence',
      }).expect(200);
      expect(res.body.data.status).toBe('RESOLVED');
      expect(
        (await db().post.findUniqueOrThrow({ where: { id: target.id } })).moderationStatus,
      ).toBe('APPROVED');
      const told = await notices(author.id);
      expect(told).toHaveLength(1);
      expect(told[0]!.title).toBe('A warning about your post');
      expect(told[0]!.body).toContain('Harmful misinformation');
      expect(told[0]!.body).not.toContain('First offence');
    });

    it('records a finding of no violation, and tells the reporter it does not break the guidelines', async () => {
      const { reporters, target, reportId } = await scenario('HARASSMENT');
      const res = await decide(staff.mod, reportId, {
        action: 'APPROVE',
        policyReason: 'no_violation',
      }).expect(200);
      expect(res.body.data.status).toBe('DISMISSED');
      expect(
        await db().moderationAction.findFirstOrThrow({ where: { targetId: target.id } }),
      ).toMatchObject({
        action: 'APPROVE',
        policyReason: 'no_violation',
        adminId: staff.mod.admin.id,
      });
      const got = await notices(reporters[0]!.id);
      expect(got[0]!.body).toMatch(/does not break/);
      // A report made in bad faith is dismissed, not approved.
      const other = await scenario('HARASSMENT');
      const dismissed = await decide(staff.mod, other.reportId, {
        action: 'DISMISS_REPORT',
        policyReason: 'report_in_bad_faith',
      }).expect(200);
      expect(dismissed.body.data.status).toBe('DISMISSED');
    });

    it('answers other reports about the same item only when the decision covers them', async () => {
      const author = await person(t);
      const [a, b, c] = await people(t, 3);
      const target = { type: 'POST', id: (await makePost(author)).id };
      const same = (await report(a, target, 'HARASSMENT').expect(201)).body.data.id;
      const same2 = (await report(b, target, 'HARASSMENT').expect(201)).body.data.id;
      const other = (await report(c, target, 'COPYRIGHT').expect(201)).body.data.id;
      // Hiding it for harassment answers the harassment reports, not the copyright one.
      await decide(staff.mod, same, {
        action: 'RESTRICT',
        policyReason: 'harassment_bullying',
      }).expect(200);
      const status = async (id: string) =>
        (await db().report.findUniqueOrThrow({ where: { id } })).status;
      expect(await status(same2)).toBe('RESOLVED');
      expect(await status(other)).toBe('OPEN');
      // Removing it answers everything about it.
      await decide(staff.mod, other, { action: 'REMOVE', policyReason: 'copyright' }).expect(200);
      const rows = await db().report.findMany({ where: { targetId: target.id } });
      expect(rows.every((r) => r.status === 'RESOLVED')).toBe(true);
    });

    it('does not decide a report twice, and refuses what is already the case', async () => {
      const { reportId, target } = await scenario();
      await decide(staff.mod, reportId, {
        action: 'RESTRICT',
        policyReason: 'harassment_bullying',
      }).expect(200);
      await decide(staff.mod, reportId, {
        action: 'REMOVE',
        policyReason: 'harassment_bullying',
      }).expect(409);
      // A second report about something already hidden cannot hide it again.
      const [r2] = await people(t, 1);
      const again = (await report(r2, target, 'HARASSMENT')).body;
      // Hidden content cannot be reported by someone who cannot see it.
      expect(again.error.code).toBe('NOT_FOUND');
      // But staff can flag it.
      const flagged = await as(staff.mod)('post', '/moderation/reports', {
        body: { targetType: 'POST', targetId: target.id, category: 'HARASSMENT' },
      }).expect(201);
      const res = await decide(staff.mod, flagged.body.data.id, {
        action: 'RESTRICT',
        policyReason: 'harassment_bullying',
      }).expect(409);
      expect(res.body.error.message).toMatch(/already restricted/);
    });

    it('cannot remove something its author has already deleted, but can still close the report', async () => {
      const { author, target, reportId } = await scenario();
      await author.api('delete', `/posts/${target.id}`).expect(204);
      await decide(staff.mod, reportId, {
        action: 'REMOVE',
        policyReason: 'harassment_bullying',
      }).expect(409);
      const detailBefore = await detail(staff.mod, reportId);
      expect(detailBefore.target.available).toBe(false);
      await decide(staff.mod, reportId, {
        action: 'DISMISS_REPORT',
        policyReason: 'no_violation',
      }).expect(200);
    });

    it('shows the account’s standing growing as decisions are made', async () => {
      const author = await person(t);
      const [r1] = await people(t, 1);
      for (let i = 0; i < 2; i++) {
        const target = { type: 'POST', id: (await makePost(author)).id };
        const id = (await report(r1, target, 'SPAM').expect(201)).body.data.id;
        await decide(staff.mod, id, {
          action: i === 0 ? 'WARN' : 'REMOVE',
          policyReason: 'spam',
        }).expect(200);
      }
      const target = { type: 'POST', id: (await makePost(author)).id };
      const id = (await report(r1, target, 'SPAM').expect(201)).body.data.id;
      const d = await detail(staff.mod, id);
      expect(d.standing).toMatchObject({
        user: { id: author.id, status: 'ACTIVE' },
        reportsAgainst: 3,
        last90Days: { warnings: 1, removed: 1, restricted: 0, suspensions: 0 },
      });
      expect(d.history.map((h: any) => h.action)).toEqual(['REMOVE', 'WARN']);
    });
  });

  // ================================================================= escalating ==

  describe('escalation', () => {
    it('hands a report to the senior queue, where only seniors can work it', async () => {
      const { reportId, target } = await scenario('VIOLENCE');
      const before = await db().report.findUniqueOrThrow({ where: { id: reportId } });
      await claim(staff.mod, reportId).expect(200);
      const res = await as(staff.mod)('post', `/moderation/reports/${reportId}/escalate`, {
        body: { reason: 'Possible threat against a named person; need a second opinion' },
      }).expect(200);
      expect(res.body.data).toMatchObject({ status: 'ESCALATED', assignedTo: null });
      expect(res.body.data.priority).toBe(before.priority + 10);
      expect(res.body.data.history[0]).toMatchObject({
        action: 'ESCALATE',
        by: { name: 'Mina Moderator' },
      });
      // Escalating twice is refused.
      await as(staff.mod)('post', `/moderation/reports/${reportId}/escalate`, {
        body: { reason: 'Escalating again to be sure' },
      }).expect(409);
      // A moderator can neither take it nor decide it, nor be given it.
      await claim(staff.mod, reportId).expect(403);
      await claim(staff.mod2, reportId).expect(403);
      await decide(staff.mod, reportId, {
        action: 'REMOVE',
        policyReason: 'violence_threats',
      }).expect(403);
      await as(staff.senior)('post', `/moderation/reports/${reportId}/assign`, {
        body: { adminId: staff.mod2.admin.id },
      }).expect(400);
      // The detail tells each of them what they may do.
      expect((await detail(staff.mod, reportId)).allowed).toMatchObject({
        claim: false,
        actions: [],
      });
      expect((await detail(staff.senior, reportId)).allowed.claim).toBe(true);

      await claim(staff.senior, reportId).expect(200);
      const decided = await decide(staff.senior, reportId, {
        action: 'REMOVE',
        policyReason: 'violence_threats',
      }).expect(200);
      expect(decided.body.data.status).toBe('RESOLVED');
      expect(
        (await db().post.findUniqueOrThrow({ where: { id: target.id } })).moderationStatus,
      ).toBe('REMOVED');
    });

    it('does not let someone escalate a report a colleague holds, or one already closed', async () => {
      const { reportId } = await scenario();
      await claim(staff.mod, reportId).expect(200);
      await as(staff.mod2)('post', `/moderation/reports/${reportId}/escalate`, {
        body: { reason: 'Not mine but I want it escalated' },
      }).expect(409);
      await decide(staff.mod, reportId, {
        action: 'WARN',
        policyReason: 'harassment_bullying',
      }).expect(200);
      await as(staff.mod)('post', `/moderation/reports/${reportId}/escalate`, {
        body: { reason: 'Too late to escalate this one' },
      }).expect(409);
      await claim(staff.mod, reportId).expect(409);
    });
  });

  // ============================================= automatic holds, and lifting them ==

  describe('automatic holds', () => {
    /** A post hidden automatically by three different people's nudity reports. */
    async function heldPost() {
      const author = await person(t);
      const reporters = await people(t, 3);
      const target = { type: 'POST', id: (await makePost(author)).id };
      const ids: string[] = [];
      for (const r of reporters)
        ids.push((await report(r, target, 'NUDITY').expect(201)).body.data.id);
      expect(
        (await db().post.findUniqueOrThrow({ where: { id: target.id } })).moderationStatus,
      ).toBe('RESTRICTED');
      return { author, reporters, target, ids };
    }

    it('lifts an automatic hold when a moderator finds no violation, and says so to its author', async () => {
      const { author, reporters, target, ids } = await heldPost();
      const res = await decide(staff.mod, ids[0]!, {
        action: 'APPROVE',
        policyReason: 'no_violation',
      }).expect(200);
      expect(res.body.data.target.state).toBe('APPROVED');
      expect(await visibleTo(reporters[0]!, target.id)).toBe(true);
      const auto = await db().moderationAction.findFirstOrThrow({
        where: { targetId: target.id, source: 'AUTOMATED' },
      });
      const lifted = await db().moderationAction.findFirstOrThrow({
        where: { reversalOfId: auto.id },
      });
      expect(lifted).toMatchObject({
        action: 'APPROVE',
        adminId: staff.mod.admin.id,
        reportId: ids[0],
      });
      const told = await notices(author.id);
      expect(told.map((n) => n.title)).toEqual([
        'Something you shared is hidden',
        'Your content is back',
      ]);
    });

    it('lifts it when the last report is dismissed, but not while something else is still waiting', async () => {
      const a = await heldPost();
      // Closing the three reports one decision at a time leaves it held until the last is closed.
      await decide(staff.mod, a.ids[0]!, {
        action: 'DISMISS_REPORT',
        policyReason: 'no_violation',
      }).expect(200);
      // All three were the same category, so one decision answered them all, and nothing is waiting.
      expect(
        (await db().post.findUniqueOrThrow({ where: { id: a.target.id } })).moderationStatus,
      ).toBe('APPROVED');
      expect(
        await db().moderationAction.count({ where: { targetId: a.target.id, action: 'RESTORE' } }),
      ).toBe(1);

      // With another category waiting, the hold stays.
      const b = await heldPost();
      const other = await person(t);
      const extra = (await report(other, b.target, 'FRAUD')).status;
      // It is hidden, so a stranger cannot report it: staff flag it instead.
      expect(extra).toBe(404);
      const flagged = await as(staff.mod)('post', '/moderation/reports', {
        body: { targetType: 'POST', targetId: b.target.id, category: 'FRAUD' },
      }).expect(201);
      await decide(staff.mod, b.ids[0]!, {
        action: 'DISMISS_REPORT',
        policyReason: 'no_violation',
      }).expect(200);
      expect(
        (await db().post.findUniqueOrThrow({ where: { id: b.target.id } })).moderationStatus,
      ).toBe('RESTRICTED');
      await decide(staff.mod, flagged.body.data.id, {
        action: 'DISMISS_REPORT',
        policyReason: 'no_violation',
      }).expect(200);
      expect(
        (await db().post.findUniqueOrThrow({ where: { id: b.target.id } })).moderationStatus,
      ).toBe('APPROVED');
    });

    it('will not let a no-violation finding override another moderator’s deliberate decision', async () => {
      const { reportId, target } = await scenario();
      await decide(staff.mod, reportId, {
        action: 'RESTRICT',
        policyReason: 'harassment_bullying',
      }).expect(200);
      const flagged = await as(staff.mod2)('post', '/moderation/reports', {
        body: { targetType: 'POST', targetId: target.id, category: 'SPAM' },
      }).expect(201);
      const res = await decide(staff.mod2, flagged.body.data.id, {
        action: 'APPROVE',
        policyReason: 'no_violation',
      }).expect(409);
      expect(res.body.error.message).toMatch(/reverse that decision/);
      expect(
        (await db().post.findUniqueOrThrow({ where: { id: target.id } })).moderationStatus,
      ).toBe('RESTRICTED');
    });
  });

  // ================================================================== reversing ==

  describe('taking a decision back', () => {
    it('restores removed content, keeps the history true, and tells its author', async () => {
      const { author, reporters, target, reportId } = await scenario();
      await decide(staff.mod, reportId, {
        action: 'REMOVE',
        policyReason: 'harassment_bullying',
      }).expect(200);
      const action = await db().moderationAction.findFirstOrThrow({
        where: { targetId: target.id, action: 'REMOVE' },
      });
      expect(await visibleTo(reporters[0]!, target.id)).toBe(false);

      // A moderator does not hold the permission to restore.
      await as(staff.mod)('post', `/moderation/actions/${action.id}/reverse`, {
        body: { reason: 'I changed my mind about this one' },
      }).expect(403);
      // The reason is required.
      await as(staff.senior)('post', `/moderation/actions/${action.id}/reverse`, {
        body: { reason: 'no' },
      }).expect(400);
      const res = await as(staff.senior)('post', `/moderation/actions/${action.id}/reverse`, {
        body: { reason: 'Context shows it was a joke between friends' },
      }).expect(200);
      expect(res.body.data).toMatchObject({ id: action.id, reversed: true });
      expect(await visibleTo(reporters[0]!, target.id)).toBe(true);

      const restore = await db().moderationAction.findFirstOrThrow({
        where: { reversalOfId: action.id },
      });
      expect(restore).toMatchObject({
        action: 'RESTORE',
        adminId: staff.senior.admin.id,
        notes: 'Context shows it was a joke between friends',
      });
      // The original is still there, now marked as taken back, and nothing was erased.
      const history = (await detail(staff.mod, reportId)).history;
      expect(history.map((h: any) => [h.action, h.reversed])).toEqual([
        ['RESTORE', false],
        ['REMOVE', true],
      ]);
      expect((await notices(author.id)).map((n) => n.title)).toEqual([
        'Something you shared was removed',
        'Your content is back',
      ]);
      const audit = await db().auditLog.findFirstOrThrow({
        where: { action: 'moderation.reverse', targetId: action.id },
      });
      expect(audit.reason).toBe('Context shows it was a joke between friends');
      // Only once.
      await as(staff.senior)('post', `/moderation/actions/${action.id}/reverse`, {
        body: { reason: 'Trying to restore it a second time' },
      }).expect(409);
    });

    it('only undoes the latest decision on an item', async () => {
      const { target, reportId } = await scenario();
      await decide(staff.mod, reportId, {
        action: 'RESTRICT',
        policyReason: 'harassment_bullying',
      }).expect(200);
      const first = await db().moderationAction.findFirstOrThrow({
        where: { targetId: target.id, action: 'RESTRICT' },
      });
      const flagged = await as(staff.mod)('post', '/moderation/reports', {
        body: { targetType: 'POST', targetId: target.id, category: 'HARASSMENT' },
      }).expect(201);
      await decide(staff.mod, flagged.body.data.id, {
        action: 'REMOVE',
        policyReason: 'harassment_bullying',
      }).expect(200);
      const second = await db().moderationAction.findFirstOrThrow({
        where: { targetId: target.id, action: 'REMOVE' },
      });

      const refused = await as(staff.senior)('post', `/moderation/actions/${first.id}/reverse`, {
        body: { reason: 'Undo the first one only' },
      }).expect(409);
      expect(refused.body.error.message).toMatch(/later decision/);
      await as(staff.senior)('post', `/moderation/actions/${second.id}/reverse`, {
        body: { reason: 'Removal was too harsh' },
      }).expect(200);
      // Taking back the removal puts it back where the first decision left it: hidden, not public.
      expect(
        (await db().post.findUniqueOrThrow({ where: { id: target.id } })).moderationStatus,
      ).toBe('RESTRICTED');
      await as(staff.senior)('post', `/moderation/actions/${first.id}/reverse`, {
        body: { reason: 'And the first one too, in the end' },
      }).expect(200);
      expect(
        (await db().post.findUniqueOrThrow({ where: { id: target.id } })).moderationStatus,
      ).toBe('APPROVED');
    });

    it('refuses to undo a decision that cannot be undone, and one that is not there', async () => {
      const { reportId } = await scenario();
      await decide(staff.mod, reportId, {
        action: 'DISMISS_REPORT',
        policyReason: 'no_violation',
      }).expect(200);
      const dismissal = await db().moderationAction.findFirstOrThrow({
        where: { reportId, action: 'DISMISS_REPORT' },
      });
      await as(staff.senior)('post', `/moderation/actions/${dismissal.id}/reverse`, {
        body: { reason: 'A dismissal is not reversible' },
      }).expect(409);
      await as(staff.senior)(
        'post',
        '/moderation/actions/01900000-0000-7000-8000-000000000004/reverse',
        {
          body: { reason: 'There is no such decision' },
        },
      ).expect(404);
    });

    it('refuses to restore a post whose picture media review rejected', async () => {
      const { target, reportId } = await scenario();
      await decide(staff.mod, reportId, {
        action: 'REMOVE',
        policyReason: 'harassment_bullying',
      }).expect(200);
      const owner = (await db().post.findUniqueOrThrow({ where: { id: target.id } })).authorId;
      const assetId = await insertMedia(t, owner, { status: 'REJECTED', moderation: 'REMOVED' });
      await db().postMedia.create({
        data: { postId: target.id, mediaAssetId: assetId, position: 0 },
      });
      const action = await db().moderationAction.findFirstOrThrow({
        where: { targetId: target.id, action: 'REMOVE' },
      });
      const res = await as(staff.senior)('post', `/moderation/actions/${action.id}/reverse`, {
        body: { reason: 'Put it back, please, thanks' },
      }).expect(409);
      expect(res.body.error.message).toMatch(/Media review/);
      expect(
        (await db().post.findUniqueOrThrow({ where: { id: target.id } })).moderationStatus,
      ).toBe('REMOVED');
    });
  });

  // ================================================== comments, reels and live reports ==

  describe('other kinds of thing', () => {
    it('hides and removes a comment with the counts staying right, and restores it', async () => {
      const [owner, commenter, reporter] = await people(t, 3);
      const postId = (await makePost(owner)).id;
      const c = (
        await commenter
          .api('post', `/posts/${postId}/comments`, { body: { body: 'rude words' } })
          .expect(201)
      ).body.data.id as string;
      const count = async () =>
        (await db().post.findUniqueOrThrow({ where: { id: postId } })).commentsCount;
      expect(await count()).toBe(1);

      const id = (await report(reporter, { type: 'COMMENT', id: c }, 'HARASSMENT').expect(201)).body
        .data.id;
      await decide(staff.mod, id, {
        action: 'RESTRICT',
        policyReason: 'harassment_bullying',
      }).expect(200);
      expect((await db().comment.findUniqueOrThrow({ where: { id: c } })).status).toBe('HIDDEN');
      expect(await count()).toBe(0);

      // Hidden is not public, so a second report comes from staff, and escalates to removal.
      const flagged = await as(staff.mod)('post', '/moderation/reports', {
        body: { targetType: 'COMMENT', targetId: c, category: 'HARASSMENT' },
      }).expect(201);
      await decide(staff.mod, flagged.body.data.id, {
        action: 'REMOVE',
        policyReason: 'harassment_bullying',
      }).expect(200);
      const removed = await db().comment.findUniqueOrThrow({ where: { id: c } });
      expect(removed).toMatchObject({ status: 'REMOVED' });
      expect(removed.deletedAt).not.toBeNull();
      expect(await count()).toBe(0); // it was already not counted

      const removal = await db().moderationAction.findFirstOrThrow({
        where: { targetId: c, action: 'REMOVE' },
      });
      await as(staff.senior)('post', `/moderation/actions/${removal.id}/reverse`, {
        body: { reason: 'Reviewed again; the removal was too much' },
      }).expect(200);
      // Taking back the removal returns it to hidden, where the first decision left it.
      expect(await db().comment.findUniqueOrThrow({ where: { id: c } })).toMatchObject({
        status: 'HIDDEN',
        deletedAt: null,
      });
      expect(await count()).toBe(0);
      const hiding = await db().moderationAction.findFirstOrThrow({
        where: { targetId: c, action: 'RESTRICT' },
      });
      await as(staff.senior)('post', `/moderation/actions/${hiding.id}/reverse`, {
        body: { reason: 'And the hiding too; it was fine' },
      }).expect(200);
      expect(await db().comment.findUniqueOrThrow({ where: { id: c } })).toMatchObject({
        status: 'VISIBLE',
        deletedAt: null,
      });
      expect(await count()).toBe(1);
    });

    it('removes a visible comment and its replies, and counts them out', async () => {
      const [owner, commenter, replier, reporter] = await people(t, 4);
      const postId = (await makePost(owner)).id;
      const parent = (
        await commenter
          .api('post', `/posts/${postId}/comments`, { body: { body: 'a comment' } })
          .expect(201)
      ).body.data.id as string;
      await replier
        .api('post', `/posts/${postId}/comments`, { body: { body: 'a reply', parentId: parent } })
        .expect(201);
      const count = async () =>
        (await db().post.findUniqueOrThrow({ where: { id: postId } })).commentsCount;
      expect(await count()).toBe(2);
      const id = (await report(reporter, { type: 'COMMENT', id: parent }, 'SPAM').expect(201)).body
        .data.id;
      await decide(staff.mod, id, { action: 'REMOVE', policyReason: 'spam' }).expect(200);
      expect(await count()).toBe(0);
      expect(await db().comment.count({ where: { postId, status: 'REMOVED' } })).toBe(2);
    });

    it('removes a reel and brings it back', async () => {
      const [author, reporter] = await people(t, 2);
      const reelId = await insertReel(t, author.id);
      expect((await reporter.api('get', `/reels/${reelId}`)).status).toBe(200);
      const id = (
        await report(reporter, { type: 'REEL', id: reelId }, 'MISINFORMATION').expect(201)
      ).body.data.id;
      await decide(staff.mod, id, { action: 'REMOVE', policyReason: 'misinformation' }).expect(200);
      expect(await db().reel.findUniqueOrThrow({ where: { id: reelId } })).toMatchObject({
        moderationStatus: 'REMOVED',
        publishStatus: 'REMOVED',
      });
      expect((await reporter.api('get', `/reels/${reelId}`)).status).toBe(404);
      const action = await db().moderationAction.findFirstOrThrow({
        where: { targetId: reelId, action: 'REMOVE' },
      });
      await as(staff.senior)('post', `/moderation/actions/${action.id}/reverse`, {
        body: { reason: 'Source turned out to be reliable' },
      }).expect(200);
      expect(await db().reel.findUniqueOrThrow({ where: { id: reelId } })).toMatchObject({
        moderationStatus: 'APPROVED',
        publishStatus: 'PUBLISHED',
      });
      expect((await reporter.api('get', `/reels/${reelId}`)).status).toBe(200);
    });

    it('lets a report about an account lead to a warning or a restriction, never a content removal', async () => {
      const [target, reporter] = await people(t, 2);
      const id = (await report(reporter, { type: 'USER', id: target.id }, 'HARASSMENT').expect(201))
        .body.data.id;
      const d = await detail(staff.senior, id);
      expect(d.allowed.actions).toEqual(
        expect.arrayContaining(['WARN', 'RESTRICT_USER', 'SUSPEND_USER', 'DISMISS_REPORT']),
      );
      expect(d.allowed.actions).not.toContain('REMOVE');
      await decide(staff.senior, id, {
        action: 'REMOVE',
        policyReason: 'harassment_bullying',
      }).expect(400);
      await decide(staff.senior, id, {
        action: 'WARN',
        policyReason: 'harassment_bullying',
      }).expect(200);
      expect((await notices(target.id))[0]!.title).toBe('A warning about your account');
    });
  });
});
