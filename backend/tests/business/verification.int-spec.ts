import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gstinCheckChar } from '../../src/business/gstin.js';
import { type StaffSession, adminCall, staffSession } from '../support/admin.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { AUTH_TEST_ENV } from '../support/auth.js';
import { person, type Person } from '../support/social.js';

/** A well-formed GSTIN for a state code, with a computed check character. */
function gstin(state = '36', pan = 'ABCDE1234F'): string {
  const first14 = `${state}${pan}1Z`;
  return first14 + gstinCheckChar(first14);
}

describe('verification badges', () => {
  let t: TestApp;
  let ops: StaffSession;
  let moderator: StaffSession;
  let support: StaffSession;

  beforeAll(async () => {
    t = await createTestApp({ ...AUTH_TEST_ENV });
    [ops, moderator, support] = await Promise.all([
      staffSession(t, ['business_operations'], 'Bina Business'),
      staffSession(t, ['moderator'], 'Mina Moderator'),
      staffSession(t, ['support_agent'], 'Sunil Support'),
    ]);
  }, 240_000);
  afterAll(async () => {
    await t.close();
  });

  const db = () => t.db.prisma;
  const staff =
    (s: StaffSession) =>
    (
      method: 'get' | 'post',
      path: string,
      o: { body?: object; query?: Record<string, string | number | boolean> } = {},
    ) =>
      adminCall(t, method, path, { token: s.accessToken, ...o });

  const livePage = async (owner: Person, name = 'Gupta Sweets and Savouries') => {
    const created = (
      await owner
        .api('post', '/business/pages', {
          body: {
            name,
            category: 'Food and restaurants',
            description: 'Sweets and savouries made fresh every morning since 1987.',
            contactEmail: 'shop@example.com',
            state: 'Telangana',
          },
        })
        .expect(201)
    ).body.data;
    await owner.api('post', `/business/pages/${created.id}/publish`).expect(200);
    return created as { id: string; slug: string };
  };
  const ask = (p: Person, body: object) => p.api('post', '/verification/requests', { body });
  const verifiedIdentity = (userId: string) =>
    db().kycProfile.create({
      data: {
        userId,
        subject: 'INDIVIDUAL',
        status: 'VERIFIED',
        legalNameEnc: 'v1.test.x.y.z',
        legalNameMasked: 'A*** K***',
        reviewedAt: new Date(),
      },
    });
  const decide = (
    s: StaffSession,
    id: string,
    decision: 'APPROVE' | 'REJECT',
    note = 'Looked at the evidence; it is in order.',
  ) => staff(s)('post', `/business/verification/${id}/decision`, { body: { decision, note } });
  const told = (userId: string) =>
    db().notification.findMany({
      where: { userId, type: 'SYSTEM' },
      orderBy: { createdAt: 'asc' },
    });

  // ====================================================================== asking ==

  describe('asking for a badge', () => {
    it('asks for a business badge, and keeps the registration number only encrypted', async () => {
      const owner = await person(t);
      const page = await livePage(owner);
      const number = gstin();
      const res = await ask(owner, {
        type: 'BUSINESS',
        businessPageId: page.id,
        gstin: number,
        note: 'Shop on Main Road',
      }).expect(201);
      expect(res.body.data).toMatchObject({
        type: 'BUSINESS',
        status: 'PENDING',
        page: { id: page.id, slug: page.slug },
        decidedAt: null,
        outcomeNote: null,
      });
      // What is stored is ciphertext, bound to the page, and only the last four characters are readable.
      const row = await db().businessPage.findUniqueOrThrow({ where: { id: page.id } });
      expect(row.verificationStatus).toBe('PENDING');
      expect(row.gstinLast4).toBe(number.slice(-4));
      expect(row.gstinEnc).toMatch(/^v1\./);
      expect(row.gstinEnc).not.toContain(number);
      // Nothing the API sends back to anyone carries it.
      const mine = await owner.api('get', `/business/pages/${page.id}`).expect(200);
      expect(JSON.stringify(mine.body)).not.toContain(number);
      expect(mine.body.data.manage).toMatchObject({
        verification: 'PENDING',
        gstinLast4: number.slice(-4),
      });
    });

    it('refuses a number that is not well formed, and what does not belong to the kind of badge', async () => {
      const owner = await person(t);
      const page = await livePage(owner);
      const bad = await ask(owner, {
        type: 'BUSINESS',
        businessPageId: page.id,
        gstin: '36ABCDE1234F1ZX',
      }).expect(400);
      expect(bad.body.error.details).toEqual([{ field: 'gstin', reasons: ['not_a_valid_gstin'] }]);
      await ask(owner, { type: 'BUSINESS' }).expect(400);
      await ask(owner, { type: 'IDENTITY', gstin: gstin() }).expect(400);
      await ask(owner, {
        type: 'PUBLISHER',
        businessPageId: page.id,
        note: 'A daily newspaper of record',
      }).expect(400);
      await ask(owner, { type: 'BUSINESS', businessPageId: page.id, status: 'APPROVED' }).expect(
        400,
      );
      expect(await db().verificationRequest.count({ where: { userId: owner.id } })).toBe(0);
    });

    it('needs the page to be the person’s own and published', async () => {
      const [owner, other] = [await person(t), await person(t)];
      const page = await livePage(owner);
      await ask(other, { type: 'BUSINESS', businessPageId: page.id }).expect(404);
      const draft = (
        await owner
          .api('post', '/business/pages', {
            body: { name: 'Draft Shop Here', category: 'Services' },
          })
          .expect(201)
      ).body.data;
      const res = await ask(owner, { type: 'BUSINESS', businessPageId: draft.id }).expect(412);
      expect(res.body.error.message).toMatch(/Publish the page/);
    });

    it('allows one request of a kind to wait at a time, even if two arrive together', async () => {
      const owner = await person(t);
      const page = await livePage(owner);
      const [a, b] = await Promise.all([
        ask(owner, { type: 'BUSINESS', businessPageId: page.id }),
        ask(owner, { type: 'BUSINESS', businessPageId: page.id }),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      expect(await db().verificationRequest.count({ where: { userId: owner.id } })).toBe(1);
    });

    it('limits how many a person can send in a day', async () => {
      const owner = await person(t);
      await db().verificationRequest.createMany({
        data: Array.from({ length: 5 }, () => ({
          userId: owner.id,
          type: 'PUBLISHER' as const,
          status: 'REJECTED' as const,
          reviewedAt: new Date(),
          submittedAt: new Date(),
        })),
      });
      const res = await ask(owner, {
        type: 'PUBLISHER',
        note: 'An independent online news publication.',
      }).expect(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
    });

    it('asks for a publisher badge only with an explanation', async () => {
      const owner = await person(t);
      const bad = await ask(owner, { type: 'PUBLISHER', note: 'news' }).expect(400);
      expect(bad.body.error.details).toEqual([
        { field: 'note', reasons: ['explain_the_publication_in_20_characters_or_more'] },
      ]);
      await ask(owner, {
        type: 'PUBLISHER',
        note: 'The Telangana Courier, a daily newspaper since 1999.',
      }).expect(201);
    });

    it('does not take a claim of identity on trust: the identity check must be verified', async () => {
      const owner = await person(t);
      const none = await ask(owner, { type: 'IDENTITY' }).expect(412);
      expect(none.body.error.message).toMatch(/identity verification first/);
      await db().kycProfile.create({
        data: {
          userId: owner.id,
          subject: 'INDIVIDUAL',
          status: 'PENDING',
          legalNameEnc: 'x',
          legalNameMasked: 'A* K*',
        },
      });
      await ask(owner, { type: 'IDENTITY' }).expect(412); // under review is not verified
      await db().kycProfile.updateMany({
        where: { userId: owner.id },
        data: { status: 'VERIFIED', reviewedAt: new Date() },
      });
      await ask(owner, { type: 'IDENTITY' }).expect(201);
    });

    it('lists a person’s own requests, newest first, and nobody else’s', async () => {
      const [owner, other] = [await person(t), await person(t)];
      await ask(owner, {
        type: 'PUBLISHER',
        note: 'The Telangana Courier, a daily newspaper since 1999.',
      }).expect(201);
      const res = await owner.api('get', '/verification/requests').expect(200);
      expect(res.body.data).toHaveLength(1);
      expect((await other.api('get', '/verification/requests').expect(200)).body.data).toEqual([]);
    });
  });

  // ===================================================================== deciding ==

  describe('deciding', () => {
    it('shows a reviewer the evidence without the number, and says it was not checked', async () => {
      const owner = await person(t);
      const page = await livePage(owner);
      const number = gstin('29');
      const req = (
        await ask(owner, {
          type: 'BUSINESS',
          businessPageId: page.id,
          gstin: number,
          note: 'We are at Gupta Chowk.',
        }).expect(201)
      ).body.data;
      const res = await staff(ops)('get', `/business/verification/${req.id}`).expect(200);
      expect(res.body.data).toMatchObject({
        type: 'BUSINESS',
        status: 'PENDING',
        note: 'We are at Gupta Chowk.',
        user: { username: owner.username },
        page: { slug: page.slug },
        evidence: {
          page: {
            gstinLast4: number.slice(-4),
            gstinChecked: expect.stringContaining('Not checked against the register'),
            status: 'ACTIVE',
          },
          account: { reportsAgainst: 0, badge: 'NONE' },
        },
      });
      expect(JSON.stringify(res.body)).not.toContain(number);
      expect(JSON.stringify(res.body)).not.toContain('v1.');
    });

    it('lists the waiting ones oldest first and the decided ones newest first, for those who may read', async () => {
      const owners = [await person(t), await person(t)];
      const ids: string[] = [];
      for (const o of owners)
        ids.push(
          (
            await ask(o, {
              type: 'PUBLISHER',
              note: `${o.username} is a long-running local publication.`,
            }).expect(201)
          ).body.data.id,
        );
      const waiting = (
        await staff(ops)('get', '/business/verification', { query: { limit: 50 } }).expect(200)
      ).body.data.map((r: any) => r.id);
      expect(waiting.filter((id: string) => ids.includes(id))).toEqual(ids);
      await decide(ops, ids[0]!, 'REJECT', 'We could not confirm the publication exists.').expect(
        200,
      );
      const decided = (
        await staff(ops)('get', '/business/verification', { query: { status: 'REJECTED' } }).expect(
          200,
        )
      ).body.data;
      expect(decided[0]).toMatchObject({
        id: ids[0],
        status: 'REJECTED',
        reviewedBy: { name: 'Bina Business' },
      });
      await staff(support)('get', '/business/verification').expect(403);
      await staff(moderator)('get', '/business/verification').expect(403);
    });

    it('approves a business: the page is verified, the person told, and it is audited', async () => {
      const [owner, visitor] = [await person(t), await person(t)];
      const page = await livePage(owner);
      const req = (
        await ask(owner, { type: 'BUSINESS', businessPageId: page.id, gstin: gstin() }).expect(201)
      ).body.data;
      // Reading is not enough.
      await staff(support)('post', `/business/verification/${req.id}/decision`, {
        body: { decision: 'APPROVE', note: 'Looks right to me.' },
      }).expect(403);
      await decide(ops, req.id, 'APPROVE', 'Registration and premises confirmed by phone.').expect(
        200,
      );
      expect(
        (await visitor.api('get', `/business/pages/${page.slug}`).expect(200)).body.data.verified,
      ).toBe(true);
      expect(await db().businessPage.findUniqueOrThrow({ where: { id: page.id } })).toMatchObject({
        verificationStatus: 'APPROVED',
      });
      const mine = (await owner.api('get', '/verification/requests').expect(200)).body.data[0];
      expect(mine).toMatchObject({
        status: 'APPROVED',
        outcomeNote: 'Registration and premises confirmed by phone.',
        decidedAt: expect.any(String),
      });
      expect((await told(owner.id)).map((n) => n.title)).toContain(
        'Your verification was approved',
      );
      const audit = await db().auditLog.findFirstOrThrow({
        where: { action: 'verification.approve', targetId: req.id },
      });
      expect(audit).toMatchObject({
        actorId: ops.admin.id,
        reason: 'Registration and premises confirmed by phone.',
      });
      await decide(ops, req.id, 'REJECT').expect(409);
    });

    it('refuses with a reason the person can read, and lets them ask again', async () => {
      const owner = await person(t);
      const page = await livePage(owner);
      const first = (await ask(owner, { type: 'BUSINESS', businessPageId: page.id }).expect(201))
        .body.data;
      await staff(ops)('post', `/business/verification/${first.id}/decision`, {
        body: { decision: 'REJECT', note: 'short' },
      }).expect(400);
      await decide(
        ops,
        first.id,
        'REJECT',
        'The name on the page does not match the registration.',
      ).expect(200);
      expect(await db().businessPage.findUniqueOrThrow({ where: { id: page.id } })).toMatchObject({
        verificationStatus: 'REJECTED',
      });
      const mine = (await owner.api('get', '/verification/requests').expect(200)).body.data[0];
      expect(mine.outcomeNote).toBe('The name on the page does not match the registration.');
      expect((await told(owner.id)).map((n) => n.title)).toContain(
        'Your verification request was not approved',
      );
      // A second attempt is a new request.
      await ask(owner, { type: 'BUSINESS', businessPageId: page.id }).expect(201);
    });

    it('grants an identity badge only while the identity is still verified', async () => {
      const [good, lapsed] = [await person(t), await person(t)];
      const goodKyc = await verifiedIdentity(good.id);
      const lapsedKyc = await verifiedIdentity(lapsed.id);
      const a = (await ask(good, { type: 'IDENTITY' }).expect(201)).body.data;
      const b = (await ask(lapsed, { type: 'IDENTITY' }).expect(201)).body.data;
      // The identity lapses between asking and deciding.
      await db().kycProfile.update({ where: { id: lapsedKyc.id }, data: { status: 'REJECTED' } });
      const refused = await decide(ops, b.id, 'APPROVE').expect(409);
      expect(refused.body.error.message).toMatch(/not verified/);
      expect((await db().profile.findUniqueOrThrow({ where: { userId: lapsed.id } })).badge).toBe(
        'NONE',
      );
      await decide(ops, a.id, 'APPROVE', 'Identity verified; badge granted.').expect(200);
      expect((await db().profile.findUniqueOrThrow({ where: { userId: good.id } })).badge).toBe(
        'IDENTITY',
      );
      void goodKyc;
      // Already holding it, they cannot ask again.
      await ask(good, { type: 'IDENTITY' }).expect(409);
    });

    it('grants a publisher badge after a person has judged the explanation', async () => {
      const owner = await person(t);
      const req = (
        await ask(owner, {
          type: 'PUBLISHER',
          note: 'The Telangana Courier, a daily newspaper since 1999.',
        }).expect(201)
      ).body.data;
      await decide(
        ops,
        req.id,
        'APPROVE',
        'Publication confirmed through its press registration.',
      ).expect(200);
      expect((await db().profile.findUniqueOrThrow({ where: { userId: owner.id } })).badge).toBe(
        'VERIFIED_PUBLISHER',
      );
    });

    it('cannot verify a page that has been taken down since', async () => {
      const owner = await person(t);
      const page = await livePage(owner);
      const req = (await ask(owner, { type: 'BUSINESS', businessPageId: page.id }).expect(201)).body
        .data;
      await owner.api('post', `/business/pages/${page.id}/unpublish`).expect(200);
      const res = await decide(ops, req.id, 'APPROVE').expect(409);
      expect(res.body.error.message).toMatch(/no longer published/);
    });

    it('takes a badge back as its own audited step, and only with the permission', async () => {
      const owner = await person(t);
      const page = await livePage(owner);
      const req = (await ask(owner, { type: 'BUSINESS', businessPageId: page.id }).expect(201)).body
        .data;
      await staff(ops)('post', `/business/verification/${req.id}/revoke`, {
        body: { reason: 'Nothing to revoke yet' },
      }).expect(409);
      await decide(ops, req.id, 'APPROVE').expect(200);
      await staff(moderator)('post', `/business/verification/${req.id}/revoke`, {
        body: { reason: 'It turned out to be a scam' },
      }).expect(403);
      const res = await staff(ops)('post', `/business/verification/${req.id}/revoke`, {
        body: { reason: 'It turned out to be a scam' },
      }).expect(200);
      expect(res.body.data).toMatchObject({
        status: 'REJECTED',
        decisionNote: 'Taken back: It turned out to be a scam',
      });
      expect(await db().businessPage.findUniqueOrThrow({ where: { id: page.id } })).toMatchObject({
        verificationStatus: 'NONE',
      });
      expect((await told(owner.id)).map((n) => n.title)).toContain(
        'A verification badge was removed',
      );
      expect(
        await db().auditLog.count({ where: { action: 'verification.revoke', targetId: req.id } }),
      ).toBe(1);

      // A personal badge is cleared too, but only if it is still that badge.
      const pub = await person(t);
      const p = (
        await ask(pub, {
          type: 'PUBLISHER',
          note: 'The Telangana Courier, a daily newspaper since 1999.',
        }).expect(201)
      ).body.data;
      await decide(ops, p.id, 'APPROVE').expect(200);
      await staff(ops)('post', `/business/verification/${p.id}/revoke`, {
        body: { reason: 'The publication closed down' },
      }).expect(200);
      expect((await db().profile.findUniqueOrThrow({ where: { userId: pub.id } })).badge).toBe(
        'NONE',
      );
    });

    it('takes the badge from a page whose name is changed', async () => {
      const owner = await person(t);
      const page = await livePage(owner);
      const req = (await ask(owner, { type: 'BUSINESS', businessPageId: page.id }).expect(201)).body
        .data;
      await decide(ops, req.id, 'APPROVE').expect(200);
      // Changing something that is not the name keeps it.
      const kept = await owner
        .api('patch', `/business/pages/${page.id}`, {
          body: { description: 'Now with an extra counter and longer hours.' },
        })
        .expect(200);
      expect(kept.body.data.verified).toBe(true);
      expect(kept.body.data.verificationReset).toBeUndefined();
      const renamed = await owner
        .api('patch', `/business/pages/${page.id}`, {
          body: { name: 'Gupta Sweets Private Limited' },
        })
        .expect(200);
      expect(renamed.body.data).toMatchObject({ verified: false, verificationReset: true });
      expect(
        (await owner.api('get', `/business/pages/${page.id}`).expect(200)).body.data.manage
          .verification,
      ).toBe('NONE');
    });
  });
});
