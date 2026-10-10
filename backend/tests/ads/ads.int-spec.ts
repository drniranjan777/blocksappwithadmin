import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AdsDeliveryService } from '../../src/ads/ads-delivery.service.js';
import { BillingProvider } from '../../src/ads/billing-provider.js';
import { SystemSettingsService } from '../../src/common/settings/system-settings.service.js';
import { type StaffSession, adminCall, staffSession } from '../support/admin.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { AUTH_TEST_ENV, call } from '../support/auth.js';
import { makePost, person, type Person } from '../support/social.js';

/** Stands in for the payment provider, which does not exist yet. */
const billing = {
  mode: 'paying' as 'none' | 'paying' | 'declined' | 'refund_fails',
  charges: [] as Array<{ campaignId: string; amount: string }>,
  refunds: [] as Array<{ campaignId: string; amount: string }>,
  get configured() {
    return billing.mode !== 'none';
  },
  async charge(req: { campaignId: string; amount: string }) {
    billing.charges.push({ campaignId: req.campaignId, amount: req.amount });
    return billing.mode === 'declined'
      ? { status: 'FAILED' as const, reference: 'declined' }
      : { status: 'PAID' as const, reference: `test_${req.campaignId}` };
  },
  async refund(req: { campaignId: string; amount: string }) {
    if (billing.mode === 'refund_fails') throw new Error('the gateway is down');
    billing.refunds.push({ campaignId: req.campaignId, amount: req.amount });
    return { reference: `refund_${req.campaignId}` };
  },
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe('advertising campaigns', () => {
  let t: TestApp;
  let ops: StaffSession; // business_operations: ads.read, ads.manage, ads.billing.read
  let reviewer: StaffSession; // ads.read and ads.manage, but not billing
  let moderator: StaffSession;
  let delivery: AdsDeliveryService;
  let audience: Person[];

  beforeAll(async () => {
    t = await createTestApp({ ...AUTH_TEST_ENV }, (b) =>
      b.overrideProvider(BillingProvider).useValue(billing),
    );
    // A reviewer who can decide campaigns but not see how they were paid for.
    const perms = await t.db.prisma.permission.findMany({
      where: { key: { in: ['ads.read', 'ads.manage', 'users.read'] } },
    });
    await t.db.prisma.role.create({
      data: {
        key: 'ads_reviewer',
        name: 'Ads reviewer',
        permissions: { create: perms.map((p) => ({ permissionId: p.id })) },
      },
    });
    [ops, reviewer, moderator] = await Promise.all([
      staffSession(t, ['business_operations'], 'Bina Business'),
      staffSession(t, ['ads_reviewer'], 'Ravi Reviewer'),
      staffSession(t, ['moderator'], 'Mina Moderator'),
    ]);
    delivery = t.app.get(AdsDeliveryService, { strict: false });
    // Enough people in one place for an audience to be big enough to aim at.
    audience = await Promise.all(
      Array.from({ length: 6 }, () => person(t, { state: 'Telangana', district: 'Hyderabad' })),
    );
    await setting('ads.min_audience', 3);
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
  const staff =
    (s: StaffSession) =>
    (
      method: 'get' | 'post',
      path: string,
      o: { body?: object; query?: Record<string, string | number | boolean> } = {},
    ) =>
      adminCall(t, method, path, { token: s.accessToken, ...o });

  const body = (over: Record<string, unknown> = {}) => ({
    name: 'Monsoon sale',
    objective: 'AWARENESS',
    budgetTotal: '2000.00',
    startsAt: new Date(Date.now() + 3 * HOUR).toISOString(),
    endsAt: new Date(Date.now() + 5 * DAY).toISOString(),
    targeting: { states: ['Telangana'], districts: ['Hyderabad'] },
    headline: 'Monsoon sale at Gupta Sweets',
    body: 'Everything fresh, everything warm.',
    ...over,
  });
  const create = (p: Person, over: Record<string, unknown> = {}) =>
    p.api('post', '/ads/campaigns', { body: body(over) });
  const draft = async (p: Person, over: Record<string, unknown> = {}) =>
    (await create(p, over).expect(201)).body.data;
  const sent = async (p: Person, over: Record<string, unknown> = {}) => {
    const d = await draft(p, over);
    await p.api('post', `/ads/campaigns/${d.id}/submit`).expect(200);
    return d as { id: string };
  };
  const approve = (s: StaffSession, id: string, note?: string) =>
    staff(s)('post', `/ads/campaigns/${id}/approve`, { body: note ? { note } : {} });
  const approved = async (p: Person, over: Record<string, unknown> = {}) => {
    const c = await sent(p, over);
    await approve(ops, c.id).expect(200);
    return c;
  };
  /** Pays, then moves the clock on so its start time has arrived, and lets the scheduler pick it up. */
  const running = async (p: Person, over: Record<string, unknown> = {}) => {
    const c = await approved(p, over);
    await p.api('post', `/ads/campaigns/${c.id}/fund`).expect(200);
    await db().adCampaign.update({
      where: { id: c.id },
      data: { startsAt: new Date(Date.now() - HOUR) },
    });
    await delivery.tick();
    return c;
  };
  const row = (id: string) => db().adCampaign.findUniqueOrThrow({ where: { id } });

  // ======================================================================== rules ==

  it('tells an advertiser what a campaign can ask for, and that nothing can be paid for yet when that is so', async () => {
    const p = await person(t);
    const res = await p.api('get', '/ads/rules').expect(200);
    expect(res.body.data).toMatchObject({
      budget: { min: '500.00', max: '1000000.00', currency: 'INR' },
      maxCampaignDays: 90,
      billingConfigured: true,
      targeting: { countries: ['IN'], ageBands: ['18-24', '25-34', '35-44', '45+'] },
    });
    expect(res.body.data.objectives.find((o: any) => o.objective === 'TRAFFIC')).toMatchObject({
      destination: true,
      boost: false,
    });
    billing.mode = 'none';
    expect((await p.api('get', '/ads/rules').expect(200)).body.data.billingConfigured).toBe(false);
    billing.mode = 'paying';
    await call(t, 'get', '/ads/rules').expect(401);
  });

  // ==================================================================== drafting ==

  describe('drafting', () => {
    it('saves a draft that belongs to the caller, with an audience size rounded down', async () => {
      const p = await person(t);
      const res = await create(p).expect(201);
      expect(res.body.data).toMatchObject({
        status: 'DRAFT',
        objective: 'AWARENESS',
        budget: {
          total: '2000.00',
          daily: null,
          spent: '0.00',
          remaining: '2000.00',
          currency: 'INR',
        },
        targeting: {
          countries: ['IN'],
          states: ['Telangana'],
          districts: ['Hyderabad'],
          ageBands: [],
        },
        creative: { headline: 'Monsoon sale at Gupta Sweets', destinationUrl: null },
        billing: { status: 'NOT_CONFIGURED', funded: false },
        submittedAt: null,
      });
      // Never an exact figure: here, six people, shown as "at least 0".
      expect(res.body.data.audience.atLeast % 100).toBe(0);
      expect(res.body.data.audience.atLeast).toBeLessThanOrEqual(6);
      expect((await row(res.body.data.id)).advertiserId).toBe(p.id);
    });

    it('refuses everything the client has no business choosing', async () => {
      const p = await person(t);
      for (const extra of [
        { advertiserId: audience[0]!.id },
        { status: 'APPROVED' },
        { spent: '0.00' },
        { billingStatus: 'PAID' },
        { reviewedAt: new Date().toISOString() },
        { policyFlags: {} },
        { currency: 'USD' },
      ]) {
        await create(p, extra).expect(400);
      }
      expect(await db().adCampaign.count({ where: { advertiserId: p.id } })).toBe(0);
    });

    it('keeps the money inside the limits', async () => {
      const p = await person(t);
      const bad = async (over: Record<string, unknown>, field: string, reason: string) => {
        const res = await create(p, over).expect(400);
        expect(res.body.error.details, JSON.stringify(over)).toEqual(
          expect.arrayContaining([{ field, reasons: [reason] }]),
        );
      };
      await bad({ budgetTotal: '499.99' }, 'budgetTotal', 'below_the_minimum');
      await bad({ budgetTotal: '1000000.01' }, 'budgetTotal', 'above_the_maximum');
      await bad({ dailyBudget: '2000.01' }, 'dailyBudget', 'more_than_the_total_budget');
      await create(p, { budgetTotal: '12.345' }).expect(400);
      await create(p, { budgetTotal: '1e3' }).expect(400);
      await create(p, { budgetTotal: '-5.00' }).expect(400);
      await create(p, { budgetTotal: 2000 }).expect(400);
      // The limits are settings.
      await setting('ads.min_budget', '100.00');
      try {
        await create(p, { budgetTotal: '150.00' }).expect(201);
      } finally {
        await clearSetting('ads.min_budget');
      }
    });

    it('keeps the schedule sensible', async () => {
      const p = await person(t);
      const now = Date.now();
      const bad = await create(p, {
        startsAt: new Date(now + 5 * DAY).toISOString(),
        endsAt: new Date(now + 2 * DAY).toISOString(),
      }).expect(400);
      expect(bad.body.error.details).toEqual([
        { field: 'endsAt', reasons: ['must_be_after_start'] },
      ]);
      const long = await create(p, {
        startsAt: new Date(now + HOUR).toISOString(),
        endsAt: new Date(now + 100 * DAY).toISOString(),
      }).expect(400);
      expect(long.body.error.details).toEqual([
        { field: 'endsAt', reasons: ['longer_than_90_days'] },
      ]);
      await create(p, { startsAt: 'tomorrow' }).expect(400);
    });

    it('lets an advertiser aim at places and broad ages, and nothing else', async () => {
      const p = await person(t);
      const detail = async (targeting: unknown) =>
        (await create(p, { targeting }).expect(400)).body.error.details;
      expect(await detail({ gender: 'female' })).toEqual([
        { field: 'targeting', reasons: ['not_something_you_can_target_on'] },
      ]);
      expect(await detail({ religion: ['x'] })).toEqual([
        { field: 'targeting', reasons: ['not_something_you_can_target_on'] },
      ]);
      expect(await detail({ interests: ['cricket'] })).toEqual([
        { field: 'targeting', reasons: ['not_something_you_can_target_on'] },
      ]);
      expect(await detail({ userIds: [audience[0]!.id] })).toEqual([
        { field: 'targeting', reasons: ['not_something_you_can_target_on'] },
      ]);
      expect((await detail({ countries: ['US'] }))[0].field).toBe('targeting.countries.0');
      expect((await detail({ ageBands: ['13-17'] }))[0].field).toBe('targeting.ageBands.0');
      expect((await detail({ states: 'Telangana' }))[0].field).toBe('targeting.states');
      expect(
        (await detail({ districts: Array.from({ length: 21 }, (_, i) => `District ${i}`) }))[0]
          .field,
      ).toBe('targeting.districts');
      // Repeats and spacing are tidied.
      const ok = await create(p, {
        targeting: {
          states: ['telangana', 'Telangana', ' Kerala '],
          ageBands: ['25-34', '18-24', '25-34'],
        },
      }).expect(201);
      expect(ok.body.data.targeting).toEqual({
        countries: ['IN'],
        states: ['Kerala', 'telangana'],
        districts: [],
        ageBands: ['18-24', '25-34'],
      });
    });

    it('lets an advertiser promote only their own approved public post, and advertise only for their own published page', async () => {
      const [p, other] = [await person(t), await person(t)];
      const mine = (await makePost(p)).id;
      const theirs = (await makePost(other)).id;
      const followersOnly = (await makePost(p, { visibility: 'FOLLOWERS' })).id;
      const ok = await create(p, { objective: 'BOOST_CONTENT', boostPostId: mine }).expect(201);
      expect(ok.body.data.boost).toEqual({ postId: mine });
      for (const id of [theirs, followersOnly, '01990000-0000-7000-8000-000000000001']) {
        const res = await create(p, { objective: 'BOOST_CONTENT', boostPostId: id }).expect(400);
        expect(res.body.error.details).toEqual([
          { field: 'boostPostId', reasons: ['not_available'] },
        ]);
      }
      await create(p, {
        boostPostId: mine,
        boostReelId: '01990000-0000-7000-8000-000000000001',
      }).expect(400);
      const draftPage = (
        await p
          .api('post', '/business/pages', {
            body: { name: 'Draft page only', category: 'Services' },
          })
          .expect(201)
      ).body.data;
      const res = await create(p, { businessPageId: draftPage.id }).expect(400);
      expect(res.body.error.details).toEqual([
        { field: 'businessPageId', reasons: ['not_available'] },
      ]);
    });

    it('needs a verified contact, and stops a person having too many open at once', async () => {
      const p = await person(t);
      await db().user.update({
        where: { id: p.id },
        data: { emailVerifiedAt: null, phoneVerifiedAt: null },
      });
      await create(p).expect(412);
      await db().user.update({ where: { id: p.id }, data: { emailVerifiedAt: new Date() } });
      await setting('ads.max_open_campaigns', 2);
      try {
        await create(p).expect(201);
        await create(p).expect(201);
        const res = await create(p).expect(409);
        expect(res.body.error.message).toMatch(/up to 2 campaigns/);
      } finally {
        await clearSetting('ads.max_open_campaigns');
      }
    });

    it('changes a draft, checking the change against what is already there, and nothing once it is sent', async () => {
      const p = await person(t);
      const d = await draft(p);
      const changed = await p
        .api('patch', `/ads/campaigns/${d.id}`, {
          body: {
            headline: 'A fresh headline',
            budgetTotal: '3000.00',
            dailyBudget: '1000.00',
            targeting: { states: ['Kerala'] },
          },
        })
        .expect(200);
      expect(changed.body.data).toMatchObject({
        creative: { headline: 'A fresh headline' },
        budget: { total: '3000.00', daily: '1000.00' },
        targeting: { states: ['Kerala'], districts: [] },
      });
      // A new end date is judged against the old start.
      const early = await p
        .api('patch', `/ads/campaigns/${d.id}`, {
          body: { endsAt: new Date(Date.now() + HOUR).toISOString() },
        })
        .expect(400);
      expect(early.body.error.details).toEqual([
        { field: 'endsAt', reasons: ['must_be_after_start'] },
      ]);
      // A smaller total cannot fall below the daily limit already set.
      const small = await p
        .api('patch', `/ads/campaigns/${d.id}`, { body: { budgetTotal: '900.00' } })
        .expect(400);
      expect(small.body.error.details).toEqual([
        { field: 'budgetTotal', reasons: ['less_than_the_daily_budget'] },
      ]);
      await p.api('patch', `/ads/campaigns/${d.id}`, { body: { dailyBudget: null } }).expect(200);
      // Not someone else's.
      await audience[0]!
        .api('patch', `/ads/campaigns/${d.id}`, { body: { headline: 'Hijacked headline' } })
        .expect(404);
      await audience[0]!.api('get', `/ads/campaigns/${d.id}`).expect(404);
      // Status and other fixed fields cannot be set.
      await p.api('patch', `/ads/campaigns/${d.id}`, { body: { status: 'ACTIVE' } }).expect(400);

      // (Nobody lives in Kerala here, so aim it back at the audience this test has.)
      await p
        .api('patch', `/ads/campaigns/${d.id}`, { body: { targeting: { states: ['Telangana'] } } })
        .expect(200);
      await p.api('post', `/ads/campaigns/${d.id}/submit`).expect(200);
      await p
        .api('patch', `/ads/campaigns/${d.id}`, { body: { headline: 'Sneaky edit after review' } })
        .expect(409);
      await p.api('delete', `/ads/campaigns/${d.id}`).expect(409);
    });

    it('deletes a draft and lists campaigns newest first', async () => {
      const p = await person(t);
      const a = await draft(p, { name: 'First campaign' });
      const b = await draft(p, { name: 'Second campaign' });
      const list = await p.api('get', '/ads/campaigns').expect(200);
      expect(list.body.data.map((c: any) => c.id)).toEqual([b.id, a.id]);
      expect(
        (await p.api('get', '/ads/campaigns', { query: { status: 'IN_REVIEW' } }).expect(200)).body
          .data,
      ).toEqual([]);
      await p.api('delete', `/ads/campaigns/${a.id}`).expect(204);
      expect(
        (await p.api('get', '/ads/campaigns').expect(200)).body.data.map((c: any) => c.id),
      ).toEqual([b.id]);
    });
  });

  // ================================================================== submitting ==

  describe('sending for review', () => {
    it('checks the campaign has what its objective needs', async () => {
      const p = await person(t);
      const submit = async (over: Record<string, unknown>) => {
        const d = await draft(p, over);
        const res = await p.api('post', `/ads/campaigns/${d.id}/submit`).expect(400);
        await p.api('delete', `/ads/campaigns/${d.id}`).expect(204);
        return res.body.error.details;
      };
      expect(await submit({ objective: 'TRAFFIC' })).toEqual([
        { field: 'destinationUrl', reasons: ['required_for_this_objective'] },
      ]);
      expect(await submit({ objective: 'LEADS' })).toEqual([
        { field: 'destinationUrl', reasons: ['required_for_this_objective'] },
      ]);
      expect(await submit({ objective: 'BOOST_CONTENT' })).toEqual([
        { field: 'boostPostId', reasons: ['choose_what_to_boost'] },
      ]);
      expect(
        await submit({ objective: 'LOCAL_REACH', targeting: { states: ['Telangana'] } }),
      ).toEqual([{ field: 'targeting.districts', reasons: ['choose_at_least_one_district'] }]);
      expect(await submit({ startsAt: new Date(Date.now() + 10 * 60_000).toISOString() })).toEqual([
        { field: 'startsAt', reasons: ['at_least_1_hour_from_now'] },
      ]);
    });

    it('refuses a web address that could point somewhere it should not', async () => {
      const p = await person(t);
      for (const url of [
        'http://example.com/offer',
        'javascript:alert(1)',
        'https://127.0.0.1/x',
        'https://user:pw@example.com',
      ]) {
        const res = await create(p, { objective: 'TRAFFIC', destinationUrl: url }).expect(400);
        expect(res.body.error.details).toEqual([
          { field: 'destinationUrl', reasons: ['must_be_a_public_https_address'] },
        ]);
      }
    });

    it('screens the words with the same blocked terms as everything else', async () => {
      const p = await person(t);
      await setting('moderation.blocked_terms', ['guaranteedwinnings']);
      try {
        const d = await draft(p, { headline: 'Guaranteedwinnings every day' });
        const res = await p.api('post', `/ads/campaigns/${d.id}/submit`).expect(400);
        expect(res.body.error.details).toEqual([{ field: 'headline', reasons: ['not_allowed'] }]);
      } finally {
        await clearSetting('moderation.blocked_terms');
      }
    });

    it('refuses an audience so small it could point at one person, without saying how small', async () => {
      const p = await person(t);
      const d = await draft(p, {
        targeting: { states: ['Telangana'], districts: ['Hyderabad'], ageBands: ['45+'] },
      });
      await setting('ads.min_audience', 100);
      try {
        const res = await p.api('post', `/ads/campaigns/${d.id}/submit`).expect(400);
        expect(res.body.error.details).toEqual([
          { field: 'targeting', reasons: ['audience_too_small'] },
        ]);
        expect(JSON.stringify(res.body)).not.toMatch(/\b[0-9]+ (people|users)\b/);
      } finally {
        await setting('ads.min_audience', 3);
      }
      await p.api('post', `/ads/campaigns/${d.id}/submit`).expect(400); // nobody here is 45+
    });

    it('never counts people under 18 or outside the place, and counts age bands by date of birth', async () => {
      // Six adults born in 1998 (about 28) live in Hyderabad. Make two of them young adults and one a minor.
      const now = new Date();
      const years = (n: number) =>
        new Date(
          Date.UTC(now.getUTCFullYear() - n, now.getUTCMonth(), Math.max(1, now.getUTCDate() - 1)),
        );
      await db().profile.update({
        where: { userId: audience[0]!.id },
        data: { dateOfBirth: years(17) },
      });
      await db().profile.update({
        where: { userId: audience[1]!.id },
        data: { dateOfBirth: years(20) },
      });
      await db().profile.update({
        where: { userId: audience[2]!.id },
        data: { dateOfBirth: years(50) },
      });
      const { AudienceService } = await import('../../src/ads/audience.service.js');
      const svc = t.app.get(AudienceService, { strict: false });
      const base = {
        countries: ['IN' as const],
        states: ['Telangana'],
        districts: [] as string[],
        ageBands: [] as ('18-24' | '25-34' | '35-44' | '45+')[],
      };
      expect(await svc.count(base)).toBe(5); // the minor is never in an audience
      expect(await svc.count({ ...base, ageBands: ['18-24'] })).toBe(1);
      expect(await svc.count({ ...base, ageBands: ['45+'] })).toBe(1);
      expect(await svc.count({ ...base, ageBands: ['25-34'] })).toBe(3);
      expect(await svc.count({ ...base, ageBands: ['18-24', '25-34'] })).toBe(4);
      expect(await svc.count({ ...base, states: ['Kerala'] })).toBe(0);
      expect(await svc.count({ ...base, districts: ['hyderabad'] })).toBe(5); // case does not matter
      expect(await svc.count({ ...base, districts: ['Warangal'] })).toBe(0);
      // Put them back for the other tests.
      for (const a of audience.slice(0, 3))
        await db().profile.update({
          where: { userId: a.id },
          data: { dateOfBirth: new Date('1998-04-12') },
        });
    });

    it('sends a complete campaign for review, with flags for the reviewer', async () => {
      const p = await person(t);
      const d = await draft(p, {
        objective: 'TRAFFIC',
        destinationUrl: 'https://bit.ly/monsoon-sale',
      });
      const res = await p.api('post', `/ads/campaigns/${d.id}/submit`).expect(200);
      expect(res.body.data).toMatchObject({ status: 'IN_REVIEW', submittedAt: expect.any(String) });
      const flags = (await row(d.id)).policyFlags as Record<string, unknown>;
      expect(flags).toMatchObject({
        destinationHost: 'bit.ly',
        linkShortener: true,
        newAccount: true,
      });
      expect(typeof flags['audienceAtLeast']).toBe('number');
      expect(await db().auditLog.count({ where: { action: 'ads.submit', targetId: d.id } })).toBe(
        1,
      );
      // Sending it again is refused.
      await p.api('post', `/ads/campaigns/${d.id}/submit`).expect(409);
    });
  });

  // ================================================================ staff review ==

  describe('review', () => {
    it('shows the waiting campaigns oldest first, to the right staff', async () => {
      const [a, b] = [await person(t), await person(t)];
      const first = await sent(a, { name: 'Oldest in the queue' });
      const second = await sent(b, { name: 'Next in the queue' });
      const list = (await staff(ops)('get', '/ads/campaigns', { query: { limit: 50 } }).expect(200))
        .body.data;
      const mine = list
        .filter((c: any) => [first.id, second.id].includes(c.id))
        .map((c: any) => c.id);
      expect(mine).toEqual([first.id, second.id]);
      expect(list[0]).toMatchObject({
        status: 'IN_REVIEW',
        advertiser: expect.objectContaining({ username: expect.any(String) }),
        waitingHours: expect.any(Number),
      });
      await staff(moderator)('get', '/ads/campaigns').expect(403);
      await call(t, 'get', '/admin/ads/campaigns').expect(401);
      const all = await staff(ops)('get', '/ads/campaigns', {
        query: { scope: 'all', advertiserId: a.id },
      }).expect(200);
      expect(all.body.data.map((c: any) => c.id)).toEqual([first.id]);
    });

    it('shows a reviewer the creative, the audience, the advertiser’s standing and the history; payment details only to those who may', async () => {
      const p = await person(t);
      const post = (await makePost(p)).id;
      const c = await sent(p, { objective: 'BOOST_CONTENT', boostPostId: post });
      const full = (await staff(ops)('get', `/ads/campaigns/${c.id}`).expect(200)).body.data;
      expect(full).toMatchObject({
        status: 'IN_REVIEW',
        creative: { headline: 'Monsoon sale at Gupta Sweets' },
        audience: { exact: expect.any(Number) },
        boost: { type: 'POST', id: post, available: true },
        advertiserStanding: { user: { username: p.username }, reportsAgainst: 0 },
        billing: { status: 'NOT_CONFIGURED' },
        flags: expect.objectContaining({ newAccount: true }),
      });
      expect(full.history[0]).toMatchObject({ action: 'ads.submit' });
      const limited = (await staff(reviewer)('get', `/ads/campaigns/${c.id}`).expect(200)).body
        .data;
      expect(limited.billing).toBeNull();
      expect(limited.billingStatus).toBeUndefined();
      await staff(moderator)('get', `/ads/campaigns/${c.id}`).expect(403);
      await staff(ops)('get', '/ads/campaigns/01990000-0000-7000-8000-000000000009').expect(404);
    });

    it('approves: the advertiser is told, it is audited, and nothing runs yet', async () => {
      const p = await person(t);
      const c = await sent(p);
      await staff(moderator)('post', `/ads/campaigns/${c.id}/approve`, { body: {} }).expect(403);
      const res = await approve(reviewer, c.id, 'Creative and audience look fine.').expect(200);
      expect(res.body.data).toMatchObject({
        status: 'APPROVED',
        reviewedBy: { name: 'Ravi Reviewer' },
      });
      expect(await row(c.id)).toMatchObject({
        status: 'APPROVED',
        billingStatus: 'NOT_CONFIGURED',
      });
      const told = await db().notification.findMany({
        where: { userId: p.id, type: 'CAMPAIGN_STATUS' },
      });
      expect(told.map((n) => n.title)).toEqual(['Your campaign was approved']);
      expect(
        await db().auditLog.findFirstOrThrow({ where: { action: 'ads.approve', targetId: c.id } }),
      ).toMatchObject({ actorId: reviewer.admin.id });
      await approve(ops, c.id).expect(409);
      // Approved is not live: the scheduler leaves it alone until it is paid for.
      await db().adCampaign.update({
        where: { id: c.id },
        data: { startsAt: new Date(Date.now() - HOUR) },
      });
      await delivery.tick();
      expect((await row(c.id)).status).toBe('APPROVED');
    });

    it('checks again that everything it relies on is still true when approving', async () => {
      const p = await person(t);
      const page = (
        await p
          .api('post', '/business/pages', {
            body: {
              name: 'Review check shop',
              category: 'Services',
              description: 'A shop that offers services of many kinds.',
              contactEmail: 'a@example.com',
              state: 'Telangana',
            },
          })
          .expect(201)
      ).body.data;
      await p.api('post', `/business/pages/${page.id}/publish`).expect(200);
      const post = (await makePost(p)).id;
      const forPage = await sent(p, { businessPageId: page.id });
      const forPost = await sent(p, { objective: 'BOOST_CONTENT', boostPostId: post });
      const forAccount = await sent(await person(t));
      const forSchedule = await sent(p);

      await db().businessPage.update({ where: { id: page.id }, data: { status: 'SUSPENDED' } });
      expect((await approve(ops, forPage.id).expect(409)).body.error.message).toMatch(
        /page is not published/,
      );
      await db().post.update({ where: { id: post }, data: { moderationStatus: 'REMOVED' } });
      expect((await approve(ops, forPost.id).expect(409)).body.error.message).toMatch(
        /no longer available/,
      );
      const owner = await db().adCampaign.findUniqueOrThrow({ where: { id: forAccount.id } });
      await db().user.update({ where: { id: owner.advertiserId }, data: { status: 'SUSPENDED' } });
      expect((await approve(ops, forAccount.id).expect(409)).body.error.message).toMatch(
        /account is not active/,
      );
      await db().adCampaign.update({
        where: { id: forSchedule.id },
        data: { startsAt: new Date(Date.now() - 2 * DAY), endsAt: new Date(Date.now() - DAY) },
      });
      expect((await approve(ops, forSchedule.id).expect(409)).body.error.message).toMatch(
        /schedule has ended/,
      );
      for (const id of [forPage.id, forPost.id, forAccount.id, forSchedule.id])
        expect((await row(id)).status).toBe('IN_REVIEW');
    });

    it('turns a campaign down with a note the advertiser can read, and lets them fix it and send it again', async () => {
      const p = await person(t);
      const c = await sent(p);
      await staff(ops)('post', `/ads/campaigns/${c.id}/reject`, { body: { note: 'short' } }).expect(
        400,
      );
      await staff(ops)('post', `/ads/campaigns/${c.id}/reject`, { body: {} }).expect(400);
      await staff(ops)('post', `/ads/campaigns/${c.id}/reject`, {
        body: { note: 'The headline promises results we cannot allow.' },
      }).expect(200);
      const seen = (await p.api('get', `/ads/campaigns/${c.id}`).expect(200)).body.data;
      expect(seen).toMatchObject({
        status: 'REJECTED',
        reviewNote: 'The headline promises results we cannot allow.',
      });
      expect(
        (
          await db().notification.findMany({ where: { userId: p.id, type: 'CAMPAIGN_STATUS' } })
        ).map((n) => n.title),
      ).toContain('Your campaign was not approved');
      await p
        .api('patch', `/ads/campaigns/${c.id}`, { body: { headline: 'A more honest headline' } })
        .expect(200);
      const again = await p.api('post', `/ads/campaigns/${c.id}/submit`).expect(200);
      expect(again.body.data).toMatchObject({ status: 'IN_REVIEW', reviewNote: null });
      expect(await row(c.id)).toMatchObject({ reviewedAt: null, reviewedById: null });
    });
  });

  // ============================================================ paying and running ==

  describe('paying and running', () => {
    it('cannot be paid for while there is no payment provider, so an approved campaign never runs', async () => {
      const p = await person(t);
      const c = await approved(p);
      billing.mode = 'none';
      try {
        const res = await p.api('post', `/ads/campaigns/${c.id}/fund`).expect(503);
        expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
      } finally {
        billing.mode = 'paying';
      }
      expect((await row(c.id)).billingStatus).toBe('NOT_CONFIGURED');
      // And the database will not let one run unpaid, whatever the application did.
      await expect(
        db().adCampaign.update({ where: { id: c.id }, data: { status: 'ACTIVE' } }),
      ).rejects.toThrow(/ad_campaigns_active_is_paid/);
    });

    it('pays once, records it, and refuses to pay for what is not approved or already paid', async () => {
      const p = await person(t);
      const unapproved = await sent(p);
      await p.api('post', `/ads/campaigns/${unapproved.id}/fund`).expect(409);
      const c = await approved(p);
      billing.charges.length = 0;
      const res = await p.api('post', `/ads/campaigns/${c.id}/fund`).expect(200);
      expect(res.body.data.billing).toEqual({ status: 'PAID', funded: true });
      expect(billing.charges).toEqual([{ campaignId: c.id, amount: '2000.00' }]);
      expect(await row(c.id)).toMatchObject({
        billingStatus: 'PAID',
        billingReference: `test_${c.id}`,
      });
      expect((await row(c.id)).fundedAt).not.toBeNull();
      expect(
        await db().auditLog.findFirstOrThrow({ where: { action: 'ads.funded', targetId: c.id } }),
      ).toMatchObject({ actorId: p.id });
      await p.api('post', `/ads/campaigns/${c.id}/fund`).expect(409);
      expect(billing.charges).toHaveLength(1);
      await audience[0]!.api('post', `/ads/campaigns/${c.id}/fund`).expect(404);
    });

    it('charges once when two payments arrive together', async () => {
      const p = await person(t);
      const c = await approved(p);
      billing.charges.length = 0;
      const [a, b] = await Promise.all([
        p.api('post', `/ads/campaigns/${c.id}/fund`),
        p.api('post', `/ads/campaigns/${c.id}/fund`),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect(billing.charges).toHaveLength(1);
    });

    it('records a declined payment and lets them try again', async () => {
      const p = await person(t);
      const c = await approved(p);
      billing.mode = 'declined';
      try {
        await p.api('post', `/ads/campaigns/${c.id}/fund`).expect(409);
      } finally {
        billing.mode = 'paying';
      }
      expect((await row(c.id)).billingStatus).toBe('FAILED');
      expect(
        await db().auditLog.count({ where: { action: 'ads.payment_failed', targetId: c.id } }),
      ).toBe(1);
      await p.api('post', `/ads/campaigns/${c.id}/fund`).expect(200);
    });

    it('goes live when it is approved, paid for and its time has come, and not before', async () => {
      const p = await person(t);
      const c = await approved(p);
      await p.api('post', `/ads/campaigns/${c.id}/fund`).expect(200);
      await delivery.tick();
      expect((await row(c.id)).status).toBe('APPROVED'); // paid, but its start is hours away
      await db().adCampaign.update({
        where: { id: c.id },
        data: { startsAt: new Date(Date.now() - HOUR) },
      });
      expect(await delivery.tick()).toBeGreaterThanOrEqual(1);
      expect((await row(c.id)).status).toBe('ACTIVE');
    });

    it('records delivery within the budget and the daily limit, and ends when the money is used up', async () => {
      const p = await person(t);
      const c = await running(p, { budgetTotal: '1000.00', dailyBudget: '400.00' });
      const r1 = await delivery.record(c.id, { impressions: 1000, clicks: 50, spend: '150.00' });
      expect(r1).toEqual({
        accepted: { impressions: 1000, clicks: 50, spend: '150.00' },
        capped: false,
        exhausted: false,
      });
      // 300 more would be 450 today, over the 400 daily limit: only 250 is accepted, and what it bought is scaled to match.
      const r2 = await delivery.record(c.id, { impressions: 3000, clicks: 300, spend: '300.00' });
      expect(r2.capped).toBe(true);
      expect(r2.accepted.spend).toBe('250.00');
      expect(r2.accepted.impressions).toBe(2500);
      expect(r2.accepted.clicks).toBe(250);
      // The day is full.
      const r3 = await delivery.record(c.id, { impressions: 100, clicks: 1, spend: '10.00' });
      expect(r3.accepted).toEqual({ impressions: 0, clicks: 0, spend: '0.00' });
      expect(await row(c.id)).toMatchObject({ status: 'ACTIVE' });
      expect(String((await row(c.id)).spent)).toBe('400');

      // Tomorrow there is room again, up to what is left of the whole budget.
      const tomorrow = new Date(Date.now() + DAY);
      const r4 = await delivery.record(
        c.id,
        { impressions: 4000, clicks: 40, spend: '400.00' },
        tomorrow,
      );
      expect(r4.accepted.spend).toBe('400.00');
      const r5 = await delivery.record(
        c.id,
        { impressions: 9000, clicks: 90, spend: '900.00' },
        new Date(Date.now() + 2 * DAY),
      );
      expect(r5).toMatchObject({ capped: true, exhausted: true });
      expect(r5.accepted.spend).toBe('200.00');
      const done = await row(c.id);
      expect(done.status).toBe('COMPLETED');
      expect(String(done.spent)).toBe('1000');
      expect(
        await db().auditLog.count({ where: { action: 'ads.budget_used_up', targetId: c.id } }),
      ).toBe(1);
      // Nothing more once it has ended.
      await expect(
        delivery.record(c.id, { impressions: 1, clicks: 0, spend: '1.00' }),
      ).rejects.toThrow(/not running/);
      // Spend never exceeds budget: the database agrees.
      const total = await db().adDailyStat.aggregate({
        where: { campaignId: c.id },
        _sum: { spend: true },
      });
      expect(String(total._sum.spend)).toBe('1000');
    });

    it('refuses nonsense and delivery for a campaign that is not running', async () => {
      const p = await person(t);
      const idle = await approved(p);
      await expect(
        delivery.record(idle.id, { impressions: 10, clicks: 1, spend: '1.00' }),
      ).rejects.toThrow(/not running/);
      const c = await running(p);
      for (const report of [
        { impressions: -1, clicks: 0, spend: '1.00' },
        { impressions: 1.5, clicks: 0, spend: '1.00' },
        { impressions: 10, clicks: 11, spend: '1.00' },
        { impressions: 10, clicks: 1, spend: '-1.00' },
        { impressions: 10, clicks: 1, spend: '1.234' },
      ]) {
        await expect(delivery.record(c.id, report), JSON.stringify(report)).rejects.toThrow();
      }
      await expect(
        delivery.record('01990000-0000-7000-8000-000000000001', {
          impressions: 1,
          clicks: 0,
          spend: '1.00',
        }),
      ).rejects.toThrow();
    });

    it('never spends the same rupee twice when reports arrive together', async () => {
      const p = await person(t);
      const c = await running(p, { budgetTotal: '500.00' });
      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          delivery.record(c.id, { impressions: 100, clicks: 1, spend: '100.00' }).catch(() => null),
        ),
      );
      const accepted = results.reduce((sum, r) => sum + (r ? Number(r.accepted.spend) : 0), 0);
      expect(accepted).toBe(500);
      expect(String((await row(c.id)).spent)).toBe('500');
    });

    it('reports to its owner only, with rates as text', async () => {
      const [p, other] = [await person(t), await person(t)];
      const c = await running(p, { budgetTotal: '1000.00' });
      await delivery.record(c.id, { impressions: 2000, clicks: 25, spend: '100.00' });
      const res = await p.api('get', `/ads/campaigns/${c.id}/report`).expect(200);
      expect(res.body.data.totals).toEqual({
        impressions: 2000,
        clicks: 25,
        clickRate: '1.25',
        spend: '100.00',
        costPerClick: '4.00',
        budget: '1000.00',
        remaining: '900.00',
      });
      expect(res.body.data.daily).toHaveLength(1);
      await other.api('get', `/ads/campaigns/${c.id}/report`).expect(404);
      const none = await approved(p);
      expect(
        (await p.api('get', `/ads/campaigns/${none.id}/report`).expect(200)).body.data.totals,
      ).toMatchObject({ impressions: 0, clickRate: null, costPerClick: null });
    });

    it('lets the owner pause and resume, but not what staff paused', async () => {
      const p = await person(t);
      const c = await running(p);
      await p.api('post', `/ads/campaigns/${c.id}/pause`).expect(200);
      expect(await row(c.id)).toMatchObject({ status: 'PAUSED', pausedBy: 'OWNER' });
      await p.api('post', `/ads/campaigns/${c.id}/pause`).expect(409);
      const back = await p.api('post', `/ads/campaigns/${c.id}/resume`).expect(200);
      expect(back.body.data.status).toBe('ACTIVE');
      // Staff pause it: now only staff can resume.
      await staff(ops)('post', `/ads/campaigns/${c.id}/pause`, {
        body: { note: 'Under investigation after a complaint.' },
      }).expect(200);
      expect(await row(c.id)).toMatchObject({ status: 'PAUSED', pausedBy: 'STAFF' });
      const stuck = await p.api('post', `/ads/campaigns/${c.id}/resume`).expect(403);
      expect(stuck.body.error.message).toMatch(/Staff paused/);
      expect((await p.api('get', `/ads/campaigns/${c.id}`).expect(200)).body.data).toMatchObject({
        status: 'PAUSED',
        pausedBy: 'STAFF',
        reviewNote: 'Under investigation after a complaint.',
      });
      await staff(ops)('post', `/ads/campaigns/${c.id}/resume`, {
        body: { note: 'Complaint was unfounded.' },
      }).expect(200);
      expect((await row(c.id)).status).toBe('ACTIVE');
    });

    it('stops a flagged campaign until a person has looked again', async () => {
      const p = await person(t);
      const c = await running(p);
      await staff(ops)('post', `/ads/campaigns/${c.id}/flag`, { body: { note: 'short' } }).expect(
        400,
      );
      const flagged = await staff(ops)('post', `/ads/campaigns/${c.id}/flag`, {
        body: { note: 'The offer is misleading about prices.' },
      }).expect(200);
      expect(flagged.body.data.status).toBe('FLAGGED');
      await expect(
        delivery.record(c.id, { impressions: 1, clicks: 0, spend: '1.00' }),
      ).rejects.toThrow(/not running/);
      await p.api('post', `/ads/campaigns/${c.id}/resume`).expect(409); // not paused: flagged
      await delivery.tick();
      expect((await row(c.id)).status).toBe('FLAGGED');
      const cleared = await staff(ops)('post', `/ads/campaigns/${c.id}/clear-flag`, {
        body: { note: 'Advertiser fixed the wording.' },
      }).expect(200);
      // Paid, so it waits paused for its owner to start it again.
      expect(cleared.body.data).toMatchObject({ status: 'PAUSED', pausedBy: 'OWNER' });
      await p.api('post', `/ads/campaigns/${c.id}/resume`).expect(200);
      // An unpaid one that was flagged goes back to approved.
      const unpaid = await approved(p);
      await staff(ops)('post', `/ads/campaigns/${unpaid.id}/flag`, {
        body: { note: 'Needs a second look at the copy.' },
      }).expect(200);
      await staff(ops)('post', `/ads/campaigns/${unpaid.id}/clear-flag`, {
        body: { note: 'Second look done, all fine.' },
      }).expect(200);
      expect((await row(unpaid.id)).status).toBe('APPROVED');
    });

    it('cancels, refunding what was not spent; and when the refund fails, leaves a trace instead of pretending', async () => {
      const p = await person(t);
      const c = await running(p, { budgetTotal: '1000.00' });
      await delivery.record(c.id, { impressions: 100, clicks: 2, spend: '200.00' });
      billing.refunds.length = 0;
      const res = await p.api('post', `/ads/campaigns/${c.id}/cancel`).expect(200);
      expect(res.body.data.status).toBe('CANCELLED');
      expect(billing.refunds).toEqual([{ campaignId: c.id, amount: '800.00' }]);
      expect((await row(c.id)).billingStatus).toBe('REFUNDED');
      expect(
        await db().auditLog.findFirstOrThrow({ where: { action: 'ads.refund', targetId: c.id } }),
      ).toBeTruthy();
      await p.api('post', `/ads/campaigns/${c.id}/cancel`).expect(409);

      const failing = await running(p, { budgetTotal: '600.00' });
      billing.mode = 'refund_fails';
      try {
        await p.api('post', `/ads/campaigns/${failing.id}/cancel`).expect(200);
      } finally {
        billing.mode = 'paying';
      }
      // Stopped, but the money is still marked as held so a person sees it needs settling.
      expect(await row(failing.id)).toMatchObject({ status: 'CANCELLED', billingStatus: 'PAID' });
      const audit = await db().auditLog.findFirstOrThrow({
        where: { action: 'ads.refund_failed', targetId: failing.id },
      });
      expect((audit.after as any).error).toContain('gateway is down');
    });

    it('cancels one that was never paid for without touching the provider', async () => {
      const p = await person(t);
      const c = await sent(p);
      billing.refunds.length = 0;
      await p.api('post', `/ads/campaigns/${c.id}/cancel`).expect(200);
      expect((await row(c.id)).status).toBe('CANCELLED');
      expect(billing.refunds).toEqual([]);
    });

    it('pauses a running campaign when what it depends on stops, and does not run one whose time has passed', async () => {
      const p = await person(t);
      const page = (
        await p
          .api('post', '/business/pages', {
            body: {
              name: 'Dependent shop',
              category: 'Services',
              description: 'A shop that depends on a page being up.',
              contactEmail: 'a@example.com',
              state: 'Telangana',
            },
          })
          .expect(201)
      ).body.data;
      await p.api('post', `/business/pages/${page.id}/publish`).expect(200);
      const post = (await makePost(p)).id;
      const forPage = await running(p, { businessPageId: page.id });
      const forPost = await running(p, { objective: 'BOOST_CONTENT', boostPostId: post });
      const forTime = await running(p);
      const forAccount = await running(await person(t));

      await db().businessPage.update({ where: { id: page.id }, data: { status: 'SUSPENDED' } });
      await db().post.update({ where: { id: post }, data: { moderationStatus: 'REMOVED' } });
      await db().adCampaign.update({
        where: { id: forTime.id },
        data: { endsAt: new Date(Date.now() - 1000), startsAt: new Date(Date.now() - 2 * DAY) },
      });
      const acct = await db().adCampaign.findUniqueOrThrow({ where: { id: forAccount.id } });
      await db().user.update({ where: { id: acct.advertiserId }, data: { status: 'SUSPENDED' } });
      await delivery.tick();

      expect(await row(forPage.id)).toMatchObject({ status: 'PAUSED', pausedBy: 'SYSTEM' });
      expect(await row(forPost.id)).toMatchObject({ status: 'PAUSED', pausedBy: 'SYSTEM' });
      expect(await row(forAccount.id)).toMatchObject({ status: 'PAUSED', pausedBy: 'SYSTEM' });
      expect((await row(forTime.id)).status).toBe('COMPLETED');
      // The owner can resume only once the cause is gone.
      await p.api('post', `/ads/campaigns/${forPage.id}/resume`).expect(409);
      await db().businessPage.update({ where: { id: page.id }, data: { status: 'ACTIVE' } });
      await p.api('post', `/ads/campaigns/${forPage.id}/resume`).expect(200);
    });

    it('lets an approved campaign that never got paid for lapse when its time passes', async () => {
      const p = await person(t);
      const c = await approved(p);
      await db().adCampaign.update({
        where: { id: c.id },
        data: { startsAt: new Date(Date.now() - 2 * DAY), endsAt: new Date(Date.now() - DAY) },
      });
      await delivery.tick();
      expect(await row(c.id)).toMatchObject({
        status: 'CANCELLED',
        reviewNote: 'Its schedule passed before it could run.',
      });
    });
  });

  // ================================================================== advertisers ==

  describe('advertisers and settings', () => {
    it('lists who advertises, with totals and no word about their audiences', async () => {
      const p = await person(t);
      const c = await running(p, { budgetTotal: '1000.00' });
      await delivery.record(c.id, { impressions: 100, clicks: 1, spend: '100.00' });
      await sent(p);
      const res = await staff(ops)('get', '/ads/advertisers', { query: { q: p.username } }).expect(
        200,
      );
      expect(res.body.data).toEqual([
        expect.objectContaining({
          id: p.id,
          username: p.username,
          total: 2,
          committed: '3000.00',
          spent: '100.00',
          campaigns: expect.objectContaining({ ACTIVE: 1, IN_REVIEW: 1 }),
        }),
      ]);
      await staff(moderator)('get', '/ads/advertisers').expect(403);
    });

    it('has its limits on the settings page, and will not let the smallest budget pass the largest', async () => {
      const boss = await staffSession(t, ['super_admin'], 'Boss');
      const keys = (await staff(boss)('get', '/settings').expect(200)).body.data.map(
        (s: any) => s.key,
      );
      expect(keys).toEqual(
        expect.arrayContaining([
          'ads.min_budget',
          'ads.max_budget',
          'ads.max_campaign_days',
          'ads.min_audience',
          'ads.max_open_campaigns',
          'business.max_pages_per_user',
        ]),
      );
      const set = (key: string, value: unknown) =>
        adminCall(t, 'put', `/settings/${key}`, {
          token: boss.accessToken,
          body: { value, reason: 'Adjusting for the test run' },
        });
      await set('ads.min_budget', '2000000.00').expect(400);
      await set('ads.max_budget', '100.00').expect(400);
      await set('ads.min_audience', 5).expect(400); // not below 10
      await set('ads.min_budget', '1000.00').expect(200);
      await set('ads.min_budget', '500.00').expect(200);
    });
  });
});
