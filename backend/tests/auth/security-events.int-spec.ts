import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../support/app.js';
import { AUTH_TEST_ENV, call, freshIp, logIn, outbox, signUp } from '../support/auth.js';

describe('login activity, alerts and notifications', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ ...AUTH_TEST_ENV });
  });
  afterAll(async () => {
    await t.close();
  });

  describe('the security event feed', () => {
    it('lists events newest first and pages through them without gaps or repeats', async () => {
      const a = await signUp(t);
      for (let i = 0; i < 6; i++) await logIn(t, a).expect(200);

      const total = await t.db.query<{ n: string }>(
        'SELECT count(*) AS n FROM security_events WHERE user_id = $1',
        [a.id],
      );
      const seen: Array<{ id: string; createdAt: string }> = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const res = await call(t, 'get', '/security/events', {
          token: a.accessToken,
          query: { limit: 3, ...(cursor ? { cursor } : {}) },
        }).expect(200);
        seen.push(...res.body.data);
        cursor = res.body.meta.hasMore ? res.body.meta.nextCursor : undefined;
        pages++;
        expect(res.body.data.length).toBeLessThanOrEqual(3);
      } while (cursor && pages < 20);

      expect(seen).toHaveLength(Number(total.rows[0]?.n));
      expect(new Set(seen.map((e) => e.id)).size).toBe(seen.length);
      const times = seen.map((e) => e.createdAt);
      expect([...times].sort().reverse()).toEqual(times);
      expect(pages).toBeGreaterThan(1);
    });

    it('shapes each event for the person, not for an investigator', async () => {
      const a = await signUp(t);
      const res = await call(t, 'get', '/security/events', { token: a.accessToken }).expect(200);
      const event = res.body.data[0];
      expect(Object.keys(event).sort()).toEqual(
        [
          'acknowledged',
          'createdAt',
          'deviceLabel',
          'id',
          'ip',
          'locationLabel',
          'riskScore',
          'severity',
          'type',
        ].sort(),
      );
      expect(JSON.stringify(res.body)).not.toContain(a.ip);
      expect(JSON.stringify(res.body)).not.toMatch(/details|userAgent|hash/i);
    });

    it('filters by kind and severity, and by whether it has been seen', async () => {
      const a = await signUp(t);
      await logIn(t, a, { password: 'Wrong!Password-1' }).expect(401);
      const failed = await call(t, 'get', '/security/events', {
        token: a.accessToken,
        query: { kind: 'failed' },
      }).expect(200);
      expect(failed.body.data.every((e: { type: string }) => e.type === 'LOGIN_FAILED')).toBe(true);
      expect(failed.body.data.length).toBeGreaterThan(0);

      const ok = await call(t, 'get', '/security/events', {
        token: a.accessToken,
        query: { kind: 'successful' },
      }).expect(200);
      expect(
        ok.body.data.every((e: { type: string }) => /LOGIN_SUCCESS|NEW_DEVICE_LOGIN/.test(e.type)),
      ).toBe(true);

      const warn = await call(t, 'get', '/security/events', {
        token: a.accessToken,
        query: { minSeverity: 'WARNING' },
      }).expect(200);
      expect(warn.body.data.every((e: { severity: string }) => e.severity !== 'INFO')).toBe(true);

      const eventId = failed.body.data[0].id;
      await call(t, 'post', `/security/events/${eventId}/acknowledge`, {
        token: a.accessToken,
      }).expect(200);
      const unseen = await call(t, 'get', '/security/events', {
        token: a.accessToken,
        query: { unacknowledged: true },
      }).expect(200);
      expect(unseen.body.data.map((e: { id: string }) => e.id)).not.toContain(eventId);
      // "false" means false (it used to be read as true), and a word that is not true or false is refused.
      const everything = await call(t, 'get', '/security/events', {
        token: a.accessToken,
        query: { unacknowledged: false },
      }).expect(200);
      expect(everything.body.data.map((e: { id: string }) => e.id)).toContain(eventId);
      await call(t, 'get', '/security/events', {
        token: a.accessToken,
        query: { unacknowledged: 'maybe' },
      }).expect(400);
    });

    it('rejects a tampered cursor and a silly page size', async () => {
      const a = await signUp(t);
      for (const cursor of [
        'not-base64!!',
        Buffer.from('{"t":1}').toString('base64url'),
        Buffer.from('[]').toString('base64url'),
      ]) {
        const res = await call(t, 'get', '/security/events', {
          token: a.accessToken,
          query: { cursor },
        }).expect(400);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
      }
      await call(t, 'get', '/security/events', {
        token: a.accessToken,
        query: { limit: 1000 },
      }).expect(400);
      await call(t, 'get', '/security/events', {
        token: a.accessToken,
        query: { limit: 0 },
      }).expect(400);
      await call(t, 'get', '/security/events', {
        token: a.accessToken,
        query: { kind: 'everything' },
      }).expect(400);
    });

    it('treats a cursor as a position in my own events, never a way into someone else’s', async () => {
      const mine = await signUp(t);
      const theirs = await signUp(t);
      await logIn(t, theirs).expect(200);
      const theirFeed = await call(t, 'get', '/security/events', {
        token: theirs.accessToken,
        query: { limit: 1 },
      }).expect(200);
      const foreign = theirFeed.body.meta.nextCursor as string;
      const res = await call(t, 'get', '/security/events', {
        token: mine.accessToken,
        query: { cursor: foreign },
      }).expect(200);
      const ids = new Set(theirFeed.body.data.map((e: { id: string }) => e.id));
      expect(res.body.data.every((e: { id: string }) => !ids.has(e.id))).toBe(true);
      const mineOnly = await t.db.query<{ n: string }>(
        'SELECT count(*) AS n FROM security_events WHERE user_id = $1',
        [mine.id],
      );
      expect(res.body.data.length).toBeLessThanOrEqual(Number(mineOnly.rows[0]?.n));
    });

    it('lets a person mark an event as theirs ("this was me"), once, and no one else’s', async () => {
      const a = await signUp(t);
      const b = await signUp(t);
      const feed = await call(t, 'get', '/security/events', { token: a.accessToken }).expect(200);
      const id = feed.body.data[0].id;
      expect(feed.body.data[0].acknowledged).toBe(false);

      const one = await call(t, 'post', `/security/events/${id}/acknowledge`, {
        token: a.accessToken,
      }).expect(200);
      expect(one.body.data.acknowledged).toBe(true);
      const two = await call(t, 'post', `/security/events/${id}/acknowledge`, {
        token: a.accessToken,
      }).expect(200);
      expect(two.body.data.acknowledged).toBe(true);

      await call(t, 'get', `/security/events/${id}`, { token: b.accessToken }).expect(404);
      await call(t, 'post', `/security/events/${id}/acknowledge`, { token: b.accessToken }).expect(
        404,
      );
      await call(t, 'get', '/security/events/not-a-uuid', { token: a.accessToken }).expect(400);
    });
  });

  describe('alert preferences', () => {
    it('start on, change one at a time, and persist', async () => {
      const a = await signUp(t);
      const start = await call(t, 'get', '/security/alert-preferences', {
        token: a.accessToken,
      }).expect(200);
      expect(start.body.data).toEqual({
        securityAlertEmail: true,
        securityAlertPush: true,
        loginAlerts: true,
      });

      const res = await call(t, 'put', '/security/alert-preferences', {
        token: a.accessToken,
        body: { loginAlerts: false },
      }).expect(200);
      expect(res.body.data).toEqual({
        securityAlertEmail: true,
        securityAlertPush: true,
        loginAlerts: false,
      });
      const again = await call(t, 'get', '/security/alert-preferences', {
        token: a.accessToken,
      }).expect(200);
      expect(again.body.data.loginAlerts).toBe(false);
    });

    it('reject values and fields that are not part of them', async () => {
      const a = await signUp(t);
      await call(t, 'put', '/security/alert-preferences', {
        token: a.accessToken,
        body: { loginAlerts: 'yes' },
      }).expect(400);
      await call(t, 'put', '/security/alert-preferences', {
        token: a.accessToken,
        body: { role: 'ADMIN' },
      }).expect(400);
    });

    it('can never switch off the serious alerts', async () => {
      const a = await signUp(t);
      await call(t, 'put', '/security/alert-preferences', {
        token: a.accessToken,
        body: { securityAlertEmail: false, securityAlertPush: false, loginAlerts: false },
      }).expect(200);
      const before = outbox(t).to(a.email).length;
      await call(t, 'post', '/auth/password/change', {
        token: a.accessToken,
        body: { currentPassword: a.password, newPassword: 'Monsoon#Rain-4417' },
      }).expect(200);
      expect(
        outbox(t)
          .to(a.email)
          .slice(before)
          .some((m) => m.template === 'security_password_changed'),
      ).toBe(true);
    });

    it('list the alerts that were sent, without their content', async () => {
      const a = await signUp(t);
      await call(t, 'post', '/auth/password/change', {
        token: a.accessToken,
        body: { currentPassword: a.password, newPassword: 'Monsoon#Rain-4417' },
      }).expect(200);
      const res = await call(t, 'get', '/security/sent-alerts', { token: a.accessToken }).expect(
        200,
      );
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0]).toMatchObject({ channel: 'EMAIL', status: 'SENT' });
      expect(res.body.data[0].template).toBe('security_password_changed');
      expect(res.body.data[0].to).toContain('***');
      expect(JSON.stringify(res.body)).not.toMatch(/\b\d{6}\b/);
    });
  });

  describe('"secure my account"', () => {
    it('signs every other device out and keeps this one so the person can change the password', async () => {
      const a = await signUp(t);
      const other = await logIn(t, a, { deviceId: 'second-phone-00001', ip: freshIp() }).expect(
        200,
      );
      const res = await call(t, 'post', '/security/secure-account', {
        token: a.accessToken,
        body: {},
      }).expect(200);
      expect(res.body.data).toEqual({ signedOut: 1, nextStep: 'change_password' });
      await call(t, 'get', '/users/me', { token: a.accessToken }).expect(200);
      await call(t, 'get', '/users/me', { token: other.body.data.tokens.accessToken }).expect(401);
      expect(
        outbox(t)
          .to(a.email)
          .some((m) => m.template === 'security_secure_account'),
      ).toBe(true);
    });

    it('can include this device too', async () => {
      const a = await signUp(t);
      await call(t, 'post', '/security/secure-account', {
        token: a.accessToken,
        body: { includeThisDevice: true },
      }).expect(200);
      await call(t, 'get', '/users/me', { token: a.accessToken }).expect(401);
    });
  });

  describe('in-app notifications', () => {
    it('lists, counts and marks them as read', async () => {
      const a = await signUp(t);
      await logIn(t, a, { deviceId: 'brand-new-device-1', ip: freshIp() }).expect(200); // alerts the owner
      await call(t, 'put', '/security/alert-preferences', {
        token: a.accessToken,
        body: { loginAlerts: true },
      }).expect(200);

      const list = await call(t, 'get', '/notifications', { token: a.accessToken }).expect(200);
      expect(list.body.data.length).toBeGreaterThan(0);
      const n = list.body.data[0];
      expect(Object.keys(n).sort()).toEqual(
        ['body', 'createdAt', 'data', 'id', 'read', 'title', 'type'].sort(),
      );
      expect(n.read).toBe(false);

      const count = await call(t, 'get', '/notifications/unread-count', {
        token: a.accessToken,
      }).expect(200);
      expect(count.body.data.count).toBe(list.body.data.length);

      await call(t, 'post', `/notifications/${n.id}/read`, { token: a.accessToken }).expect(204);
      const after = await call(t, 'get', '/notifications/unread-count', {
        token: a.accessToken,
      }).expect(200);
      expect(after.body.data.count).toBe(list.body.data.length - 1);
      const unread = await call(t, 'get', '/notifications', {
        token: a.accessToken,
        query: { unreadOnly: true },
      }).expect(200);
      expect(unread.body.data.map((x: { id: string }) => x.id)).not.toContain(n.id);
      const everything = await call(t, 'get', '/notifications', {
        token: a.accessToken,
        query: { unreadOnly: false },
      }).expect(200);
      expect(everything.body.data.map((x: { id: string }) => x.id)).toContain(n.id);

      const all = await call(t, 'post', '/notifications/read-all', { token: a.accessToken }).expect(
        200,
      );
      expect(all.body.data.marked).toBe(list.body.data.length - 1);
      const zero = await call(t, 'get', '/notifications/unread-count', {
        token: a.accessToken,
      }).expect(200);
      expect(zero.body.data.count).toBe(0);
    });

    it('never shows or touches someone else’s', async () => {
      const a = await signUp(t);
      const b = await signUp(t);
      await logIn(t, a, { deviceId: 'device-for-note-0001', ip: freshIp() }).expect(200);
      const mine = await call(t, 'get', '/notifications', { token: a.accessToken }).expect(200);
      expect(mine.body.data.length).toBeGreaterThan(0);
      const id = mine.body.data[0].id;
      await call(t, 'post', `/notifications/${id}/read`, { token: b.accessToken }).expect(404);
      const theirs = await call(t, 'get', '/notifications', { token: b.accessToken }).expect(200);
      expect(theirs.body.data.map((x: { id: string }) => x.id)).not.toContain(id);
      const still = await call(t, 'get', '/notifications', {
        token: a.accessToken,
        query: { unreadOnly: true },
      }).expect(200);
      expect(still.body.data.map((x: { id: string }) => x.id)).toContain(id);
    });
  });

  describe('push devices', () => {
    const token = (n: number) => `fcm-token-${n}-${'x'.repeat(40)}`;

    it('registers a phone, and moves it to the new account when someone else signs in on it', async () => {
      const a = await signUp(t);
      const b = await signUp(t);
      const tk = token(1);
      await call(t, 'post', '/notifications/devices', {
        token: a.accessToken,
        body: { token: tk, platform: 'ANDROID' },
      }).expect(204);
      await call(t, 'post', '/notifications/devices', {
        token: a.accessToken,
        body: { token: tk, platform: 'ANDROID' },
      }).expect(204);
      let rows = await t.db.query<{ user_id: string }>(
        'SELECT user_id FROM push_devices WHERE token = $1',
        [tk],
      );
      expect(rows.rows).toEqual([{ user_id: a.id }]);

      await call(t, 'post', '/notifications/devices', {
        token: b.accessToken,
        body: { token: tk, platform: 'ANDROID' },
      }).expect(204);
      rows = await t.db.query<{ user_id: string }>(
        'SELECT user_id FROM push_devices WHERE token = $1',
        [tk],
      );
      expect(rows.rows).toEqual([{ user_id: b.id }]);
    });

    it('stops sending to a phone that is unregistered, and only by its owner', async () => {
      const a = await signUp(t);
      const b = await signUp(t);
      const tk = token(2);
      await call(t, 'post', '/notifications/devices', {
        token: a.accessToken,
        body: { token: tk, platform: 'IOS' },
      }).expect(204);
      await call(t, 'delete', `/notifications/devices/${tk}`, { token: b.accessToken }).expect(204);
      let row = await t.db.query<{ disabled_at: Date | null }>(
        'SELECT disabled_at FROM push_devices WHERE token = $1',
        [tk],
      );
      expect(row.rows[0]?.disabled_at).toBeNull();
      await call(t, 'delete', `/notifications/devices/${tk}`, { token: a.accessToken }).expect(204);
      row = await t.db.query<{ disabled_at: Date | null }>(
        'SELECT disabled_at FROM push_devices WHERE token = $1',
        [tk],
      );
      expect(row.rows[0]?.disabled_at).not.toBeNull();
    });

    it('validates what it is given', async () => {
      const a = await signUp(t);
      await call(t, 'post', '/notifications/devices', {
        token: a.accessToken,
        body: { token: 'short', platform: 'ANDROID' },
      }).expect(400);
      await call(t, 'post', '/notifications/devices', {
        token: a.accessToken,
        body: { token: token(3), platform: 'SYMBIAN' },
      }).expect(400);
    });
  });
});
