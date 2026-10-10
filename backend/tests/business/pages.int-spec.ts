import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SystemSettingsService } from '../../src/common/settings/system-settings.service.js';
import { type StaffSession, staffSession } from '../support/admin.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { AUTH_TEST_ENV, call } from '../support/auth.js';
import { adminCall } from '../support/admin.js';
import { insertMedia, makePost, person, type Person } from '../support/social.js';

describe('business pages', () => {
  let t: TestApp;
  let ops: StaffSession; // business_operations
  let moderator: StaffSession;

  beforeAll(async () => {
    t = await createTestApp({ ...AUTH_TEST_ENV });
    [ops, moderator] = await Promise.all([
      staffSession(t, ['business_operations'], 'Bina Business'),
      staffSession(t, ['moderator'], 'Mina Moderator'),
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

  const page = (over: Record<string, unknown> = {}) => ({
    name: "Raju's Chai Corner",
    category: 'Food and restaurants',
    description: 'Fresh tea and snacks, made the way your grandmother would.',
    contactEmail: 'raju@example.com',
    state: 'Telangana',
    district: 'Hyderabad',
    ...over,
  });
  const create = (p: Person, over: Record<string, unknown> = {}) =>
    p.api('post', '/business/pages', { body: page(over) });
  const made = async (p: Person, over: Record<string, unknown> = {}) =>
    (await create(p, over).expect(201)).body.data;
  const published = async (p: Person, over: Record<string, unknown> = {}) => {
    const created = await made(p, over);
    await p.api('post', `/business/pages/${created.id}/publish`).expect(200);
    return created as { id: string; slug: string };
  };

  // ================================================================== creating ==

  describe('creating a page', () => {
    it('makes a private draft with an address made from its name', async () => {
      const owner = await person(t);
      const res = await create(owner).expect(201);
      expect(res.body.data).toMatchObject({
        slug: 'rajus-chai-corner',
        name: "Raju's Chai Corner",
        category: 'Food and restaurants',
        location: { state: 'Telangana', district: 'Hyderabad', city: null },
        verified: false,
        followers: 0,
        viewer: { following: false, isOwner: true },
        manage: { status: 'DRAFT', verification: 'NONE', gstinLast4: null, statusReason: null },
      });
      expect(
        (await db().businessPage.findUniqueOrThrow({ where: { id: res.body.data.id } })).ownerId,
      ).toBe(owner.id);
    });

    it('finds a free address when the name is taken', async () => {
      const [a, b] = [await person(t), await person(t)];
      const first = await made(a, { name: 'Same Name Traders' });
      const second = await made(b, { name: 'Same Name Traders' });
      expect(first.slug).toBe('same-name-traders');
      expect(second.slug).toBe('same-name-traders-2');
    });

    it('lets the owner choose an address, and refuses a bad, reserved or taken one', async () => {
      const [a, b] = [await person(t), await person(t)];
      expect((await made(a, { slug: 'my-shop-hyd' })).slug).toBe('my-shop-hyd');
      const taken = await create(b, { slug: 'my-shop-hyd' }).expect(409);
      expect(taken.body.error.details).toEqual({ field: 'slug' });
      for (const [slug, reason] of [
        ['support', 'reserved'],
        ['a', 'invalid'],
        ['-x-', 'invalid'],
      ] as const) {
        const res = await create(b, { slug }).expect(400);
        expect(res.body.error.details, slug).toEqual([
          {
            field: 'slug',
            reasons: [expect.stringMatching(new RegExp(`${reason}|pattern|matches`))],
          },
        ]);
      }
    });

    it('asks for an address when the name cannot make one', async () => {
      const owner = await person(t);
      const res = await create(owner, { name: 'చాయ్ దుకాణం' }).expect(400);
      expect(res.body.error.details).toEqual([{ field: 'slug', reasons: ['choose_an_address'] }]);
      expect((await made(owner, { name: 'చాయ్ దుకాణం', slug: 'chai-dukanam' })).slug).toBe(
        'chai-dukanam',
      );
    });

    it('validates what is sent without echoing it', async () => {
      const owner = await person(t);
      const bad = async (over: Record<string, unknown>, field: string) => {
        const res = await create(owner, over).expect(400);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
        expect(JSON.stringify(res.body)).not.toContain(String(Object.values(over)[0]));
        expect(res.body.error.details.map((d: any) => d.field)).toContain(field);
      };
      await bad({ category: 'Smuggling' }, 'category');
      await bad({ contactEmail: 'not-an-email' }, 'contactEmail');
      await bad({ websiteUrl: 'http://example.com' }, 'websiteUrl');
      await bad({ websiteUrl: 'https://localhost/admin' }, 'websiteUrl');
      await bad({ name: 'x' }, 'name');
      // Things the client has no business choosing are refused, not ignored.
      for (const extra of [
        { status: 'ACTIVE' },
        { verificationStatus: 'APPROVED' },
        { ownerId: owner.id },
        { followersCount: 99 },
        { gstin: '27AAPFU0939F1ZV' },
      ]) {
        await create(owner, extra).expect(400);
      }
      expect(await db().businessPage.count({ where: { ownerId: owner.id } })).toBe(0);
    });

    it('screens the name and description against the blocked terms', async () => {
      const owner = await person(t);
      await db().systemSetting.upsert({
        where: { key: 'moderation.blocked_terms' },
        create: { key: 'moderation.blocked_terms', value: ['forbiddenword'] },
        update: { value: ['forbiddenword'] },
      });
      t.app.get(SystemSettingsService, { strict: false }).invalidate();
      try {
        const res = await create(owner, {
          description: 'We sell Forbiddenword here, honestly.',
        }).expect(400);
        expect(res.body.error.details).toEqual([
          { field: 'description', reasons: ['not_allowed'] },
        ]);
        await create(owner, { name: 'forbiddenword emporium' }).expect(400);
      } finally {
        await db().systemSetting.deleteMany({ where: { key: 'moderation.blocked_terms' } });
        t.app.get(SystemSettingsService, { strict: false }).invalidate();
      }
    });

    it('needs a verified contact, an active account and stays within the limit of pages', async () => {
      const owner = await person(t);
      await db().user.update({
        where: { id: owner.id },
        data: { emailVerifiedAt: null, phoneVerifiedAt: null },
      });
      const res = await create(owner).expect(412);
      expect(res.body.error.code).toBe('PRECONDITION_FAILED');
      await db().user.update({ where: { id: owner.id }, data: { emailVerifiedAt: new Date() } });
      for (let i = 0; i < 3; i++) await made(owner, { name: `Page number ${i + 1} shop` });
      const over = await create(owner, { name: 'One too many shop' }).expect(409);
      expect(over.body.error.message).toMatch(/up to 3 pages/);
      // The limit is a setting.
      await db().systemSetting.upsert({
        where: { key: 'business.max_pages_per_user' },
        create: { key: 'business.max_pages_per_user', value: 4 },
        update: { value: 4 },
      });
      t.app.get(SystemSettingsService, { strict: false }).invalidate();
      try {
        await made(owner, { name: 'The fourth shop' });
      } finally {
        await db().systemSetting.deleteMany({ where: { key: 'business.max_pages_per_user' } });
        t.app.get(SystemSettingsService, { strict: false }).invalidate();
      }
    });

    it('needs a signed-in person, and lists the categories to anyone signed in', async () => {
      await call(t, 'post', '/business/pages', { body: page() }).expect(401);
      const p = await person(t);
      const res = await p.api('get', '/business/categories').expect(200);
      expect(res.body.data.categories).toContain('Food and restaurants');
    });

    it('attaches a business picture that is the owner’s own, and nothing else', async () => {
      const [owner, other] = [await person(t), await person(t)];
      const own = await insertMedia(t, owner.id, { purpose: 'BUSINESS_IMAGE' });
      const wrongPurpose = await insertMedia(t, owner.id, { purpose: 'POST_IMAGE' });
      const theirs = await insertMedia(t, other.id, { purpose: 'BUSINESS_IMAGE' });
      const res = await create(owner, { avatarMediaId: own }).expect(201);
      expect(res.body.data.avatar).toMatchObject({ id: own, kind: 'IMAGE' });
      for (const id of [wrongPurpose, theirs]) {
        const bad = await create(owner, { name: 'Another shop', avatarMediaId: id }).expect(400);
        expect(bad.body.error.details).toEqual([
          { field: 'avatarMediaId', reasons: ['not_available'] },
        ]);
      }
    });
  });

  // ================================================================ publishing ==

  describe('drafts, publishing and who can see a page', () => {
    it('keeps a draft private to its owner, and tells everyone else it does not exist', async () => {
      const [owner, visitor] = [await person(t), await person(t)];
      const draft = await made(owner);
      await visitor.api('get', `/business/pages/${draft.id}`).expect(404);
      await visitor.api('get', `/business/pages/${draft.slug}`).expect(404);
      await visitor.api('post', `/business/pages/${draft.id}/follow`).expect(404);
      const seen = await owner.api('get', `/business/pages/${draft.slug}`).expect(200);
      expect(seen.body.data.manage.status).toBe('DRAFT');
      expect(
        (await owner.api('get', '/business/pages/mine').expect(200)).body.data.map(
          (p: any) => p.id,
        ),
      ).toContain(draft.id);
    });

    it('asks for what a visitor needs before publishing, and then shows the page to everyone', async () => {
      const [owner, visitor] = [await person(t), await person(t)];
      const bare = await made(owner, {
        description: 'Short.',
        contactEmail: undefined,
        state: undefined,
        district: undefined,
      });
      const refused = await owner.api('post', `/business/pages/${bare.id}/publish`).expect(400);
      expect(refused.body.error.details.map((d: any) => d.field).sort()).toEqual([
        'contactEmail',
        'description',
        'state',
      ]);
      await owner
        .api('patch', `/business/pages/${bare.id}`, {
          body: {
            description: 'A proper description of what this business does for people.',
            state: 'Kerala',
            websiteUrl: 'https://example.com',
          },
        })
        .expect(200);
      const live = await owner.api('post', `/business/pages/${bare.id}/publish`).expect(200);
      expect(live.body.data.manage.status).toBe('ACTIVE');
      const seen = await visitor.api('get', `/business/pages/${bare.slug}`).expect(200);
      expect(seen.body.data).toMatchObject({
        id: bare.id,
        viewer: { following: false, isOwner: false },
      });
      // Visitors never see the management fields.
      expect(seen.body.data.manage).toBeUndefined();
      // Publishing again changes nothing.
      await owner.api('post', `/business/pages/${bare.id}/publish`).expect(200);
    });

    it('hides a page from someone who is blocked, either way round', async () => {
      const [owner, blocked, blocker] = [await person(t), await person(t), await person(t)];
      const p = await published(owner);
      await owner.api('post', `/users/${blocked.id}/block`).expect(200);
      await blocked.api('get', `/business/pages/${p.slug}`).expect(404);
      await blocker.api('get', `/business/pages/${p.slug}`).expect(200);
      await blocker.api('post', `/users/${owner.id}/block`).expect(200);
      await blocker.api('get', `/business/pages/${p.slug}`).expect(404);
    });

    it('lets only the owner change a page, and keeps the address once published', async () => {
      const [owner, other] = [await person(t), await person(t)];
      const draft = await made(owner);
      await other
        .api('patch', `/business/pages/${draft.id}`, { body: { name: 'Hijacked shop' } })
        .expect(404);
      await other.api('post', `/business/pages/${draft.id}/publish`).expect(404);
      await owner
        .api('patch', `/business/pages/${draft.id}`, { body: { slug: 'new-address-1' } })
        .expect(200);
      await owner.api('post', `/business/pages/${draft.id}/publish`).expect(200);
      const res = await owner
        .api('patch', `/business/pages/${draft.id}`, { body: { slug: 'new-address-2' } })
        .expect(400);
      expect(res.body.error.details).toEqual([{ field: 'slug', reasons: ['only_while_a_draft'] }]);
      // `null` clears what can be empty.
      const cleared = await owner
        .api('patch', `/business/pages/${draft.id}`, { body: { websiteUrl: null, city: null } })
        .expect(200);
      expect(cleared.body.data.websiteUrl).toBeNull();
    });

    it('can go back to a draft, unless it is advertising', async () => {
      const owner = await person(t);
      const p = await published(owner);
      const back = await owner.api('post', `/business/pages/${p.id}/unpublish`).expect(200);
      expect(back.body.data.manage.status).toBe('DRAFT');
      await owner.api('post', `/business/pages/${p.id}/publish`).expect(200);
      await db().adCampaign.create({
        data: {
          advertiserId: owner.id,
          businessPageId: p.id,
          name: 'Diwali offer',
          objective: 'AWARENESS',
          budgetTotal: '1000.00',
          startsAt: new Date(Date.now() + 86_400_000),
          endsAt: new Date(Date.now() + 5 * 86_400_000),
          targeting: {},
          headline: 'Diwali offer',
          status: 'IN_REVIEW',
        },
      });
      const res = await owner.api('post', `/business/pages/${p.id}/unpublish`).expect(409);
      expect(res.body.error.message).toMatch(/campaigns/);
    });
  });

  // ================================================================== following ==

  describe('following, offers and posts', () => {
    it('counts followers once however many times it is asked', async () => {
      const [owner, a, b] = [await person(t), await person(t), await person(t)];
      const p = await published(owner);
      const followers = async () =>
        (await db().businessPage.findUniqueOrThrow({ where: { id: p.id } })).followersCount;
      await a.api('post', `/business/pages/${p.slug}/follow`).expect(200);
      await a.api('post', `/business/pages/${p.slug}/follow`).expect(200);
      await Promise.all([
        b.api('post', `/business/pages/${p.id}/follow`),
        b.api('post', `/business/pages/${p.id}/follow`),
      ]);
      expect(await followers()).toBe(2);
      expect(
        (await a.api('get', `/business/pages/${p.slug}`).expect(200)).body.data.viewer.following,
      ).toBe(true);
      await a.api('delete', `/business/pages/${p.slug}/follow`).expect(200);
      await a.api('delete', `/business/pages/${p.slug}/follow`).expect(200);
      expect(await followers()).toBe(1);
      expect(await db().businessFollow.count({ where: { pageId: p.id } })).toBe(1);
      // Not your own page.
      await owner.api('post', `/business/pages/${p.id}/follow`).expect(400);
    });

    it('shows offers that are on now, and the owner all of them', async () => {
      const [owner, visitor] = [await person(t), await person(t)];
      const p = await published(owner);
      const soon = new Date(Date.now() + 3_600_000).toISOString();
      const later = new Date(Date.now() + 86_400_000).toISOString();
      await owner
        .api('post', `/business/pages/${p.id}/offers`, {
          body: { title: 'Buy one get one free', endsAt: later },
        })
        .expect(201);
      await owner
        .api('post', `/business/pages/${p.id}/offers`, {
          body: {
            title: 'Opens tomorrow special',
            startsAt: later,
            endsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
          },
        })
        .expect(201);
      const expired = await db().businessOffer.create({
        data: { pageId: p.id, title: 'Old offer', endsAt: new Date(Date.now() - 1000) },
      });
      const titles = async (who: Person) =>
        (await who.api('get', `/business/pages/${p.slug}/offers`).expect(200)).body.data.map(
          (o: any) => o.title,
        );
      expect(await titles(visitor)).toEqual(['Buy one get one free']);
      expect((await titles(owner)).sort()).toEqual([
        'Buy one get one free',
        'Old offer',
        'Opens tomorrow special',
      ]);
      // Only the owner can add or remove.
      await visitor
        .api('post', `/business/pages/${p.id}/offers`, { body: { title: 'Fake offer here' } })
        .expect(404);
      await visitor.api('delete', `/business/pages/${p.id}/offers/${expired.id}`).expect(404);
      await owner.api('delete', `/business/pages/${p.id}/offers/${expired.id}`).expect(204);
      const bad = await owner
        .api('post', `/business/pages/${p.id}/offers`, {
          body: { title: 'Backwards offer', startsAt: later, endsAt: soon },
        })
        .expect(400);
      expect(bad.body.error.details).toEqual([
        { field: 'endsAt', reasons: ['must_be_after_start'] },
      ]);
    });

    it('lets the owner post as the page, and shows it as the page', async () => {
      const [owner, visitor, stranger] = [await person(t), await person(t), await person(t)];
      const p = await published(owner);
      const posted = await owner
        .api('post', '/posts', {
          body: { type: 'TEXT', caption: 'Fresh samosas today!', businessPageId: p.id },
        })
        .expect(201);
      expect(posted.body.data.businessPage).toEqual({
        id: p.id,
        slug: p.slug,
        name: "Raju's Chai Corner",
        verified: false,
      });
      // It appears in the page's posts, and in the owner's own.
      const list = await visitor.api('get', `/business/pages/${p.slug}/posts`).expect(200);
      expect(list.body.data.map((x: any) => x.id)).toEqual([posted.body.data.id]);
      // An ordinary post carries no page at all.
      const plain = await makePost(owner);
      expect(plain.body.businessPage).toBeUndefined();
      // Someone else's page, a draft page and a page that does not exist are all refused.
      for (const [who, id] of [
        [stranger, p.id],
        [owner, (await made(owner, { name: 'Draft only shop' })).id],
        [owner, '01990000-0000-7000-8000-000000000001'],
      ] as const) {
        const res = await who
          .api('post', '/posts', { body: { type: 'TEXT', caption: 'Hi', businessPageId: id } })
          .expect(400);
        expect(res.body.error.details).toEqual([
          { field: 'businessPageId', reasons: ['not_available'] },
        ]);
      }
    });

    it('shows the owner how the page is doing, and nobody else', async () => {
      const [owner, a, b] = [await person(t), await person(t), await person(t)];
      const p = await published(owner);
      await a.api('post', `/business/pages/${p.id}/follow`).expect(200);
      await b.api('post', `/business/pages/${p.id}/follow`).expect(200);
      const posted = await owner
        .api('post', '/posts', {
          body: { type: 'TEXT', caption: 'Open late tonight', businessPageId: p.id },
        })
        .expect(201);
      await a.api('post', `/posts/${posted.body.data.id}/like`).expect(200);
      const res = await owner
        .api('get', `/business/pages/${p.id}/analytics`, { query: { days: 7 } })
        .expect(200);
      expect(res.body.data.window.days).toBe(7);
      expect(res.body.data.followers).toMatchObject({ total: 2, gained: 2 });
      expect(res.body.data.followers.perDay).toHaveLength(7);
      expect(res.body.data.followers.perDay.at(-1)).toEqual({ day: expect.any(String), count: 2 });
      expect(res.body.data.posts.published).toBe(1);
      expect(res.body.data.engagement.likes).toBe(1);
      expect(JSON.stringify(res.body)).not.toContain(a.username);
      await a.api('get', `/business/pages/${p.id}/analytics`).expect(404);
      await owner
        .api('get', `/business/pages/${p.id}/analytics`, { query: { days: 400 } })
        .expect(400);
    });
  });

  // ================================================================ staff side ==

  describe('staff looking after pages', () => {
    it('lists and shows pages to those with business.read, and to nobody else', async () => {
      const owner = await person(t);
      const p = await published(owner, { name: 'Findable Fish Market' });
      const list = await staff(ops)('get', '/business/pages', { query: { q: 'findable' } }).expect(
        200,
      );
      expect(list.body.data).toEqual([
        expect.objectContaining({
          id: p.id,
          status: 'ACTIVE',
          owner: expect.objectContaining({ username: owner.username }),
        }),
      ]);
      const one = await staff(ops)('get', `/business/pages/${p.id}`).expect(200);
      expect(one.body.data).toMatchObject({
        counts: { posts: 0, offers: 0 },
        ownerReportsAgainst: 0,
      });
      await staff(moderator)('get', '/business/pages').expect(403);
      await call(t, 'get', '/admin/business/pages').expect(401);
    });

    it('suspends a published page: hidden with its posts, campaigns paused, owner told; restores it', async () => {
      const [owner, visitor] = [await person(t), await person(t)];
      const p = await published(owner);
      const posted = await owner
        .api('post', '/posts', {
          body: { type: 'TEXT', caption: 'Page news!', businessPageId: p.id },
        })
        .expect(201);
      expect((await visitor.api('get', `/posts/${posted.body.data.id}`)).status).toBe(200);
      const campaign = await db().adCampaign.create({
        data: {
          advertiserId: owner.id,
          businessPageId: p.id,
          name: 'Running',
          objective: 'AWARENESS',
          budgetTotal: '1000.00',
          startsAt: new Date(Date.now() - 3_600_000),
          endsAt: new Date(Date.now() + 86_400_000),
          targeting: {},
          headline: 'Running',
          status: 'APPROVED',
          reviewedAt: new Date(),
        },
      });
      // Only business.manage may; reading is not enough.
      await staff(moderator)('post', `/business/pages/${p.id}/suspend`, {
        body: { reason: 'Looks like a scam page' },
      }).expect(403);
      await staff(ops)('post', `/business/pages/${p.id}/suspend`, {
        body: { reason: 'short' },
      }).expect(400);
      const res = await staff(ops)('post', `/business/pages/${p.id}/suspend`, {
        body: { reason: 'Impersonating another brand' },
      }).expect(200);
      expect(res.body.data).toMatchObject({
        status: 'SUSPENDED',
        statusReason: 'Impersonating another brand',
      });

      await visitor.api('get', `/business/pages/${p.slug}`).expect(404);
      expect((await visitor.api('get', `/posts/${posted.body.data.id}`)).status).toBe(404);
      expect((await db().adCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).status).toBe(
        'PAUSED',
      );
      // The owner still sees it, with why, and cannot edit or publish it.
      const seen = await owner.api('get', `/business/pages/${p.id}`).expect(200);
      expect(seen.body.data.manage).toMatchObject({
        status: 'SUSPENDED',
        statusReason: 'Impersonating another brand',
      });
      await owner
        .api('patch', `/business/pages/${p.id}`, { body: { name: 'New name entirely' } })
        .expect(403);
      const told = await db().notification.findMany({
        where: { userId: owner.id, type: 'SYSTEM' },
      });
      expect(told.map((n) => n.title)).toContain('Your business page was suspended');
      const audit = await db().auditLog.findFirstOrThrow({
        where: { action: 'business.suspend', targetId: p.id },
      });
      expect(audit).toMatchObject({ actorId: ops.admin.id, reason: 'Impersonating another brand' });
      await staff(ops)('post', `/business/pages/${p.id}/suspend`, {
        body: { reason: 'Suspending it again' },
      }).expect(409);

      await staff(ops)('post', `/business/pages/${p.id}/restore`, {
        body: { reason: 'Owner proved ownership' },
      }).expect(200);
      await visitor.api('get', `/business/pages/${p.slug}`).expect(200);
      expect((await visitor.api('get', `/posts/${posted.body.data.id}`)).status).toBe(200);
      // The campaign is not started again for them.
      expect((await db().adCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).status).toBe(
        'PAUSED',
      );
      await staff(ops)('post', `/business/pages/${p.id}/restore`, {
        body: { reason: 'Restoring it again' },
      }).expect(409);
    });

    it('cannot suspend a draft', async () => {
      const owner = await person(t);
      const draft = await made(owner);
      await staff(ops)('post', `/business/pages/${draft.id}/suspend`, {
        body: { reason: 'A draft cannot be suspended' },
      }).expect(409);
    });
  });
});
