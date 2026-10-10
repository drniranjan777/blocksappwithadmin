import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LiveProvider } from '../../src/trust/live/live-provider.js';
import type { StaffSession } from '../support/admin.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { AUTH_TEST_ENV, call } from '../support/auth.js';
import { makePost, person, type Person } from '../support/social.js';
import { people, report, staffRig, type StaffRig } from '../support/trust.js';

/** Stands in for the live service that does not exist yet. */
const provider = {
  mode: 'none' as 'none' | 'confirm' | 'fail',
  calls: [] as Array<{ id: string; reason: string }>,
  async terminate(id: string, reason: string) {
    provider.calls.push({ id, reason });
    if (provider.mode === 'fail') throw new Error('the live service is unreachable');
    return { confirmed: provider.mode === 'confirm' };
  },
};

describe('safety incidents, live-session safety and policy configuration', () => {
  let t: TestApp;
  let staff: StaffRig;

  beforeAll(async () => {
    t = await createTestApp({ ...AUTH_TEST_ENV }, (b) =>
      b.overrideProvider(LiveProvider).useValue(provider),
    );
    staff = await staffRig(t);
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

  // ================================================================== incidents ==

  describe('safety incidents', () => {
    let subject: Person;
    const open = async (body: Record<string, unknown> = {}, by = staff.mod) =>
      (
        await as(by)('post', '/safety/incidents', {
          body: {
            type: 'SELF_HARM',
            summary: 'A viewer reported a person saying they may hurt themselves.',
            userId: subject.id,
            ...body,
          },
        }).expect(201)
      ).body.data;

    beforeAll(async () => {
      subject = await person(t);
    });

    it('is opened by staff with the right permission, with a log that starts at once', async () => {
      const incident = await open();
      expect(incident).toMatchObject({
        type: 'SELF_HARM',
        severity: 'HIGH',
        status: 'OPEN',
        user: { id: subject.id, username: subject.username },
        owner: { name: 'Mina Moderator' },
        createdBy: { name: 'Mina Moderator' },
        resolvedAt: null,
      });
      expect(incident.events).toEqual([
        expect.objectContaining({
          kind: 'OPENED',
          by: { id: staff.mod.admin.id, name: 'Mina Moderator' },
        }),
      ]);
      const audit = await db().auditLog.findFirstOrThrow({
        where: { action: 'incident.create', targetId: incident.id },
      });
      expect(audit.actorId).toBe(staff.mod.admin.id);
      // Support can neither read nor open one; an analyst cannot either.
      for (const s of [staff.support, staff.analyst]) {
        await as(s)('get', '/safety/incidents').expect(403);
        await as(s)('post', '/safety/incidents', {
          body: { type: 'OTHER', summary: 'Should not be allowed to do this' },
        }).expect(403);
      }
    });

    it('checks what it points at, and what it is made of', async () => {
      const unknown = '01900000-0000-7000-8000-000000000010';
      const res = await as(staff.mod)('post', '/safety/incidents', {
        body: { type: 'OTHER', summary: 'About somebody who is not there', userId: unknown },
      }).expect(400);
      expect(res.body.error.details).toEqual([{ field: 'userId', reasons: ['not_found'] }]);
      await as(staff.mod)('post', '/safety/incidents', {
        body: { type: 'OTHER', summary: 'short' },
      }).expect(400);
      await as(staff.mod)('post', '/safety/incidents', {
        body: { type: 'NOPE', summary: 'A long enough summary' },
      }).expect(400);
      await as(staff.mod)('post', '/safety/incidents', {
        body: { type: 'OTHER', summary: 'A long enough summary', status: 'RESOLVED' },
      }).expect(400);
    });

    it('keeps a log of every note, hand-over, escalation and resolution, in order and by whom', async () => {
      const incident = await open();
      const id = incident.id as string;
      await as(staff.mod)('post', `/safety/incidents/${id}/notes`, {
        body: { note: 'Called the number on file; no answer.' },
      }).expect(201);
      await as(staff.senior)('post', `/safety/incidents/${id}/assign`, {
        body: { adminId: staff.mod2.admin.id },
      }).expect(200);
      await as(staff.senior)('post', `/safety/incidents/${id}/escalate`, {
        body: {
          escalatedTo: 'iCall helpline (told by phone, ref 8812)',
          note: 'Person is a minor.',
        },
      }).expect(200);
      const resolved = await as(staff.mod2)('post', `/safety/incidents/${id}/resolve`, {
        body: { actionTaken: 'Helpline reached the family; person is safe.' },
      }).expect(200);
      expect(resolved.body.data).toMatchObject({
        status: 'RESOLVED',
        actionTaken: 'Helpline reached the family; person is safe.',
        escalatedTo: 'iCall helpline (told by phone, ref 8812)',
        resolvedAt: expect.any(String),
      });
      expect(resolved.body.data.events.map((e: any) => [e.kind, e.by?.name])).toEqual([
        ['OPENED', 'Mina Moderator'],
        ['NOTE', 'Mina Moderator'],
        ['ASSIGNED', 'Sena Senior'],
        ['ESCALATED', 'Sena Senior'],
        ['RESOLVED', 'Moe Moderator'],
      ]);
      expect(resolved.body.data.events[3].note).toContain('iCall helpline');
      // Each step is also in the audit trail, with the state before it.
      const audits = await db().auditLog.findMany({
        where: { targetType: 'safety_incident', targetId: id },
        orderBy: { createdAt: 'asc' },
      });
      expect(audits.map((a) => a.action)).toEqual([
        'incident.create',
        'incident.note',
        'incident.assign',
        'incident.escalate',
        'incident.resolve',
      ]);
      expect((audits[3]!.before as any).status).toBe('OPEN');
    });

    it('lets a moderator take an incident, but only a senior can give it to someone else or escalate it', async () => {
      const incident = await open({}, staff.mod);
      const id = incident.id as string;
      // It is already Mina's: Moe cannot take it from her.
      await as(staff.mod2)('post', `/safety/incidents/${id}/assign`, { body: {} }).expect(409);
      // Nor can a moderator give it to anybody.
      await as(staff.mod)('post', `/safety/incidents/${id}/assign`, {
        body: { adminId: staff.mod2.admin.id },
      }).expect(403);
      // Seniors can, but only to someone who can handle incidents.
      await as(staff.senior)('post', `/safety/incidents/${id}/assign`, {
        body: { adminId: staff.support.admin.id },
      }).expect(400);
      await as(staff.senior)('post', `/safety/incidents/${id}/assign`, {
        body: { adminId: '01900000-0000-7000-8000-000000000011' },
      }).expect(400);
      // Escalating needs reports.escalate as well as incident access.
      await as(staff.mod)('post', `/safety/incidents/${id}/escalate`, {
        body: { escalatedTo: 'The local police station' },
      }).expect(403);
      const escalated = await as(staff.senior)('post', `/safety/incidents/${id}/escalate`, {
        body: { escalatedTo: 'The local police station' },
      }).expect(200);
      expect(escalated.body.data.status).toBe('ESCALATED');
      await as(staff.senior)('post', `/safety/incidents/${id}/escalate`, {
        body: { escalatedTo: 'Someone else again' },
      }).expect(409);
    });

    it('can only be resolved by whoever looks after it, or a senior; and reopened by a senior', async () => {
      const incident = await open({}, staff.mod);
      const id = incident.id as string;
      await as(staff.mod2)('post', `/safety/incidents/${id}/resolve`, {
        body: { actionTaken: 'I resolved this myself' },
      }).expect(409);
      await as(staff.mod)('post', `/safety/incidents/${id}/resolve`, {
        body: { actionTaken: 'Spoke with the person; fine now.' },
      }).expect(200);
      await as(staff.mod)('post', `/safety/incidents/${id}/resolve`, {
        body: { actionTaken: 'Resolving it a second time' },
      }).expect(409);
      await as(staff.mod)('post', `/safety/incidents/${id}/notes`, {
        body: { note: 'One more thing' },
      }).expect(409);
      await as(staff.mod)('post', `/safety/incidents/${id}/reopen`, {
        body: { reason: 'Reopening my own incident' },
      }).expect(403);
      const back = await as(staff.senior)('post', `/safety/incidents/${id}/reopen`, {
        body: { reason: 'The person posted again an hour later' },
      }).expect(200);
      expect(back.body.data).toMatchObject({ status: 'OPEN', resolvedAt: null });
      expect(back.body.data.events.at(-1)).toMatchObject({
        kind: 'REOPENED',
        by: { name: 'Sena Senior' },
      });
    });

    it('resolves exactly once when two people try at the same moment', async () => {
      const incident = await open({}, staff.senior);
      const id = incident.id as string;
      const [a, b] = await Promise.all([
        as(staff.senior)('post', `/safety/incidents/${id}/resolve`, {
          body: { actionTaken: 'First one to arrive wins' },
        }),
        as(staff.boss)('post', `/safety/incidents/${id}/resolve`, {
          body: { actionTaken: 'Second one to arrive loses' },
        }),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const events = await db().safetyIncidentEvent.findMany({
        where: { incidentId: id, kind: 'RESOLVED' },
      });
      expect(events).toHaveLength(1);
    });

    it('lists, filters and pages', async () => {
      const mine = await Promise.all([
        open({ type: 'VIOLENCE', severity: 'CRITICAL' }, staff.mod2),
        open({ type: 'SCAM' }, staff.mod2),
        open({ type: 'SCAM' }, staff.mod2),
      ]);
      const ids = mine.map((m) => m.id as string);
      const scam = (
        await as(staff.mod)('get', '/safety/incidents', {
          query: { type: 'SCAM', owner: 'unassigned' },
        }).expect(200)
      ).body.data;
      expect(scam).toEqual([]);
      const owned = (
        await as(staff.mod2)('get', '/safety/incidents', {
          query: { owner: 'me', status: 'OPEN', limit: 50 },
        }).expect(200)
      ).body.data;
      expect(owned.map((o: any) => o.id)).toEqual(expect.arrayContaining(ids));
      expect(
        (
          await as(staff.mod2)('get', '/safety/incidents', {
            query: { severity: 'CRITICAL', owner: 'me' },
          }).expect(200)
        ).body.data.every((i: any) => i.severity === 'CRITICAL'),
      ).toBe(true);
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 50; i++) {
        const page = await as(staff.mod)('get', '/safety/incidents', {
          query: { limit: 3, ...(cursor ? { cursor } : {}) },
        }).expect(200);
        seen.push(...page.body.data.map((x: any) => x.id));
        cursor = page.body.meta?.nextCursor ?? undefined;
        if (!page.body.meta?.hasMore) break;
      }
      expect(new Set(seen).size).toBe(seen.length);
      expect(seen).toEqual(expect.arrayContaining(ids));
      await as(staff.mod)('get', '/safety/incidents/01900000-0000-7000-8000-000000000012').expect(
        404,
      );
    });

    it('is enforced by the database too: a resolved incident has a resolution time', async () => {
      const incident = await open();
      await expect(
        db().safetyIncident.update({ where: { id: incident.id }, data: { status: 'RESOLVED' } }),
      ).rejects.toThrow();
    });
  });

  // ====================================================================== live ==

  describe('live sessions', () => {
    let host: Person;
    let viewer: Person;

    const session = (over: Record<string, unknown> = {}) =>
      db().liveSession.create({
        data: {
          hostId: host.id,
          title: 'Friday night chat',
          status: 'LIVE',
          startedAt: new Date(),
          peakViewers: 120,
          riskFlags: { signals: ['rapid_reports'] },
          ...over,
        } as never,
      });

    beforeAll(async () => {
      [host, viewer] = await people(t, 2);
    });

    it('says plainly that there is nothing live, because there is no live service', async () => {
      const res = await as(staff.mod)('get', '/live/sessions').expect(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta).toMatchObject({ hasMore: false });
    });

    it('lists active sessions with their reports and incidents, for people who may see them', async () => {
      const s = await session();
      const ended = await session({ status: 'ENDED', endedAt: new Date() });
      await report(viewer, { type: 'LIVE', id: s.id }, 'VIOLENCE').expect(201);
      const res = await as(staff.mod)('get', '/live/sessions').expect(200);
      expect(res.body.data.map((x: any) => x.id)).toContain(s.id);
      expect(res.body.data.map((x: any) => x.id)).not.toContain(ended.id);
      const row = res.body.data.find((x: any) => x.id === s.id);
      expect(row).toMatchObject({
        title: 'Friday night chat',
        status: 'LIVE',
        host: { id: host.id, username: host.username },
        peakViewers: 120,
        riskFlags: { signals: ['rapid_reports'] },
        openReports: 1,
        openIncidents: 0,
      });
      const past = await as(staff.mod)('get', '/live/sessions', {
        query: { scope: 'past' },
      }).expect(200);
      expect(past.body.data.map((x: any) => x.id)).toContain(ended.id);
      const detail = (await as(staff.mod)('get', `/live/sessions/${s.id}`).expect(200)).body.data;
      expect(detail.reports).toEqual([
        expect.objectContaining({ category: 'VIOLENCE', status: 'OPEN' }),
      ]);
      // Support and analysts have no business here.
      await as(staff.support)('get', '/live/sessions').expect(403);
      await as(staff.analyst)('get', '/live/sessions').expect(403);
      await call(t, 'get', '/admin/live/sessions').expect(401);
    });

    it('ends a session in one request, closes the reports, logs it and tells the host', async () => {
      const s = await session();
      const reportId = (await report(viewer, { type: 'LIVE', id: s.id }, 'VIOLENCE').expect(201))
        .body.data.id as string;
      // Moderators can see sessions, not end them.
      await as(staff.mod)('post', `/live/sessions/${s.id}/terminate`, {
        body: { reason: 'Threatening someone on screen' },
      }).expect(403);
      provider.mode = 'confirm';
      provider.calls.length = 0;
      const res = await as(staff.senior)('post', `/live/sessions/${s.id}/terminate`, {
        body: {
          reason: 'Threatening someone on screen',
          policyReason: 'violence_threats',
          incident: {
            type: 'VIOLENCE',
            summary: 'Host threatened a named person during the stream.',
          },
        },
      }).expect(200);
      expect(res.body.data).toMatchObject({
        status: 'TERMINATED',
        terminatedBy: { name: 'Sena Senior' },
        terminationReason: 'Threatening someone on screen',
        endedAt: expect.any(String),
        providerConfirmed: true,
        openIncidents: 1,
      });
      expect(provider.calls).toEqual([{ id: s.id, reason: 'Threatening someone on screen' }]);

      // The decision is on record, appealable, against the host.
      expect(
        await db().moderationAction.findFirstOrThrow({ where: { targetId: s.id } }),
      ).toMatchObject({
        action: 'REMOVE',
        targetType: 'LIVE',
        targetUserId: host.id,
        adminId: staff.senior.admin.id,
        policyReason: 'violence_threats',
      });
      // The report is answered, and its reporter told.
      expect(await db().report.findUniqueOrThrow({ where: { id: reportId } })).toMatchObject({
        status: 'RESOLVED',
      });
      expect((await notices(viewer.id)).map((n) => n.title)).toContain('We looked at your report');
      expect((await notices(host.id)).map((n) => n.title)).toContain(
        'Something you shared was removed',
      );
      // The incident opened with it points at the session and is owned by whoever ended it.
      const incident = await db().safetyIncident.findFirstOrThrow({
        where: { liveSessionId: s.id },
      });
      expect(incident).toMatchObject({
        type: 'VIOLENCE',
        userId: host.id,
        ownerId: staff.senior.admin.id,
        status: 'OPEN',
      });
      const audits = await db().auditLog.findMany({
        where: { targetType: 'live_session', targetId: s.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(audits.map((a) => a.action)).toEqual(['live.terminate', 'live.terminate_provider']);
      expect((audits[1]!.after as any).providerConfirmed).toBe(true);
      // Ending it twice is refused.
      await as(staff.senior)('post', `/live/sessions/${s.id}/terminate`, {
        body: { reason: 'Trying to end it again' },
      }).expect(409);
    });

    it('still ends the session here when the live service cannot be reached, and says it was not confirmed', async () => {
      const s = await session();
      provider.mode = 'fail';
      const res = await as(staff.boss)('post', `/live/sessions/${s.id}/terminate`, {
        body: { reason: 'Emergency stop requested by safety lead' },
      }).expect(200);
      expect(res.body.data).toMatchObject({ status: 'TERMINATED', providerConfirmed: false });
      expect((await db().liveSession.findUniqueOrThrow({ where: { id: s.id } })).status).toBe(
        'TERMINATED',
      );
      const audit = await db().auditLog.findFirstOrThrow({
        where: { action: 'live.terminate_provider', targetId: s.id },
      });
      expect((audit.after as any).providerConfirmed).toBe(false);
    });

    it('does not claim a confirmation when there is no live service at all', async () => {
      const s = await session({ status: 'SCHEDULED', startedAt: null });
      provider.mode = 'none';
      const res = await as(staff.boss)('post', `/live/sessions/${s.id}/terminate`, {
        body: { reason: 'Scheduled by a banned host' },
      }).expect(200);
      expect(res.body.data.providerConfirmed).toBe(false);
    });

    it('refuses what is not possible: an ended session, a missing one, a rule that does not fit', async () => {
      const ended = await session({ status: 'ENDED', endedAt: new Date() });
      await as(staff.boss)('post', `/live/sessions/${ended.id}/terminate`, {
        body: { reason: 'It already ended' },
      }).expect(409);
      await as(staff.boss)(
        'post',
        '/live/sessions/01900000-0000-7000-8000-000000000013/terminate',
        { body: { reason: 'There is no such session' } },
      ).expect(404);
      const s = await session();
      await as(staff.boss)('post', `/live/sessions/${s.id}/terminate`, {
        body: { reason: 'Because', policyReason: 'no_violation' },
      }).expect(400);
      await as(staff.boss)('post', `/live/sessions/${s.id}/terminate`, {
        body: { reason: 'short' },
      }).expect(400);
      expect((await db().liveSession.findUniqueOrThrow({ where: { id: s.id } })).status).toBe(
        'LIVE',
      );
    });

    it('lets only one of two simultaneous emergency stops win, and writes one decision', async () => {
      const s = await session();
      const [a, b] = await Promise.all([
        as(staff.senior)('post', `/live/sessions/${s.id}/terminate`, {
          body: { reason: 'Stopped by the on-call senior' },
        }),
        as(staff.boss)('post', `/live/sessions/${s.id}/terminate`, {
          body: { reason: 'Stopped by the safety lead' },
        }),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect(await db().moderationAction.count({ where: { targetId: s.id } })).toBe(1);
    });

    it('is enforced by the database too: a terminated session has a reason and an end time', async () => {
      const s = await session();
      await expect(
        db().liveSession.update({ where: { id: s.id }, data: { status: 'TERMINATED' } }),
      ).rejects.toThrow();
    });
  });

  // ==================================================================== policy ==

  describe('policy configuration', () => {
    it('shows the published rules, the defaults and the limits to those who may read them', async () => {
      const res = await as(staff.senior)('get', '/policy').expect(200);
      const p = res.body.data;
      expect(p.policyVersion).toMatch(/draft/);
      expect(p.version).toBe(0);
      expect(p.limits).toEqual({ reportsPerDay: 30, appealWindowDays: 30, appealSlaHours: 72 });
      expect(p.categories).toHaveLength(12);
      const child = p.categories.find((c: any) => c.category === 'CHILD_SAFETY');
      expect(child).toMatchObject({
        severity: 'CRITICAL',
        slaHours: 1,
        autoHoldAt: 1,
        isDefault: true,
        floor: { minSeverity: 'HIGH', maxSlaHours: 24 },
      });
      expect(p.rules.map((r: any) => r.code)).toContain('child_safety');
      await as(staff.mod)('get', '/policy').expect(403);
      await as(staff.support)('get', '/policy').expect(403);
    });

    it('is changed only with policy.update, a reason and a version, and is audited', async () => {
      const body = {
        severity: 'HIGH',
        slaHours: 6,
        autoHoldAt: 2,
        reason: 'Scam waves this month; tightening up',
      };
      await as(staff.senior)('put', '/policy/categories/FRAUD', { body }).expect(403);
      await as(staff.mod)('put', '/policy/categories/FRAUD', { body }).expect(403);
      await as(staff.boss)('put', '/policy/categories/FRAUD', {
        body: { ...body, reason: 'short' },
      }).expect(400);
      await as(staff.boss)('put', '/policy/categories/FRAUD', {
        body: { ...body, slaHours: 0 },
      }).expect(400);
      await as(staff.boss)('put', '/policy/categories/FRAUD', {
        body: { ...body, autoHoldAt: 51 },
      }).expect(400);
      await as(staff.boss)('put', '/policy/categories/FRAUD', {
        body: { ...body, severity: 'URGENT' },
      }).expect(400);
      await as(staff.boss)('put', '/policy/categories/NOPE', { body }).expect(404);

      const res = await as(staff.boss)('put', '/policy/categories/FRAUD', {
        body: { ...body, expectedVersion: 0 },
      }).expect(200);
      expect(res.body.data.version).toBe(1);
      expect(res.body.data.categories.find((c: any) => c.category === 'FRAUD')).toMatchObject({
        severity: 'HIGH',
        slaHours: 6,
        autoHoldAt: 2,
        isDefault: false,
        default: { severity: 'MEDIUM', slaHours: 24, autoHoldAt: 0 },
      });
      const audit = await db().auditLog.findFirstOrThrow({
        where: { action: 'policy.category_updated', targetId: 'FRAUD' },
      });
      expect(audit).toMatchObject({ actorId: staff.boss.admin.id, reason: body.reason });
      expect(audit.before).toEqual({ severity: 'MEDIUM', slaHours: 24, autoHoldAt: 0 });
      expect(audit.after).toEqual({ severity: 'HIGH', slaHours: 6, autoHoldAt: 2 });

      // Someone who loaded the policy before that cannot overwrite it blind.
      const stale = await as(staff.boss)('put', '/policy/categories/SPAM', {
        body: {
          severity: 'LOW',
          slaHours: 96,
          autoHoldAt: 0,
          reason: 'Relaxing spam handling',
          expectedVersion: 0,
        },
      }).expect(409);
      expect(stale.body.error.details).toEqual({ version: 1 });
    });

    it('applies to the next report: its severity, its response time, and when content is hidden', async () => {
      const author = await person(t);
      const [r1, r2] = await people(t, 2);
      const target = { type: 'POST', id: (await makePost(author)).id };
      const first = await report(r1, target, 'FRAUD').expect(201);
      const row = await db().report.findUniqueOrThrow({ where: { id: first.body.data.id } });
      expect(row.severity).toBe('HIGH');
      expect((row.slaDueAt!.getTime() - row.createdAt.getTime()) / 3_600_000).toBeCloseTo(6, 0);
      expect(row.priority).toBe(40);
      // Two different people now hide it.
      expect(
        (await db().post.findUniqueOrThrow({ where: { id: target.id } })).moderationStatus,
      ).toBe('APPROVED');
      await report(r2, target, 'FRAUD').expect(201);
      expect(
        (await db().post.findUniqueOrThrow({ where: { id: target.id } })).moderationStatus,
      ).toBe('RESTRICTED');
    });

    it('never lets child-safety and self-harm reports be set below the floor', async () => {
      const weak = { reason: 'Trying to make this quieter', autoHoldAt: 1 };
      const low = await as(staff.boss)('put', '/policy/categories/CHILD_SAFETY', {
        body: { ...weak, severity: 'LOW', slaHours: 1 },
      }).expect(400);
      expect(low.body.error.details).toEqual([{ field: 'severity', reasons: ['at_least_high'] }]);
      const slow = await as(staff.boss)('put', '/policy/categories/SELF_HARM', {
        body: { ...weak, severity: 'CRITICAL', slaHours: 48 },
      }).expect(400);
      expect(slow.body.error.details).toEqual([{ field: 'slaHours', reasons: ['at_most_24'] }]);
      // Within the floor is fine.
      await as(staff.boss)('put', '/policy/categories/CHILD_SAFETY', {
        body: { ...weak, severity: 'HIGH', slaHours: 12 },
      }).expect(200);
    });

    it('has its limits on the settings page, with the same checks as any setting', async () => {
      const list = (await as(staff.boss)('get', '/settings').expect(200)).body.data;
      const keys = list.map((s: any) => s.key);
      expect(keys).toEqual(
        expect.arrayContaining([
          'moderation.reports_per_day',
          'moderation.appeal_window_days',
          'moderation.appeal_sla_hours',
        ]),
      );
      await as(staff.boss)('put', '/settings/moderation.appeal_window_days', {
        body: { value: 0, reason: 'Appeals are a nuisance' },
      }).expect(400);
      await as(staff.boss)('put', '/settings/moderation.appeal_window_days', {
        body: { value: 14, reason: 'Two weeks is plenty' },
      }).expect(200);
      const view = (await as(staff.senior)('get', '/policy').expect(200)).body.data;
      expect(view.limits.appealWindowDays).toBe(14);
    });
  });
});
