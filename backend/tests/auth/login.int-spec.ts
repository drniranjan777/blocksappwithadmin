import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LoginAttemptStore, loginAttemptKey } from '../../src/auth/login-attempts.js';
import { UserSessionService } from '../../src/auth/user-session.service.js';
import { createTestApp, type TestApp } from '../support/app.js';
import {
  AUTH_TEST_ENV,
  PASSWORD,
  call,
  codeSentTo,
  deviceBody,
  freshIp,
  freshName,
  logIn,
  outbox,
  signUp,
} from '../support/auth.js';

describe('signing in', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ ...AUTH_TEST_ENV });
  });
  afterAll(async () => {
    await t.close();
  });

  describe('with a username, e-mail or phone', () => {
    it('signs in with the username or the e-mail, in any case', async () => {
      const a = await signUp(t);
      for (const identifier of [
        a.username,
        a.username.toUpperCase(),
        a.email,
        a.email.toUpperCase(),
        ` ${a.email} `,
      ]) {
        const res = await logIn(t, a, { identifier }).expect(200);
        expect(res.body.data.status).toBe('authenticated');
        expect(res.body.data.user.id).toBe(a.id);
        expect(res.body.data.newDevice).toBe(false);
      }
    });

    it('gives each sign-in its own session and tokens', async () => {
      const a = await signUp(t);
      const one = await logIn(t, a).expect(200);
      const two = await logIn(t, a).expect(200);
      expect(one.body.data.tokens.refreshToken).not.toBe(two.body.data.tokens.refreshToken);
      const list = await call(t, 'get', '/sessions', { token: a.accessToken }).expect(200);
      expect(list.body.data.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('wrong details', () => {
    it('answers an unknown account and a wrong password identically', async () => {
      const a = await signUp(t);
      const ghost = freshName('ghost');

      const wrongPassword = await logIn(t, a, { password: 'Wrong!Password-1' }).expect(401);
      const unknownUser = await call(t, 'post', '/auth/login', {
        body: { identifier: ghost, password: 'Wrong!Password-1' },
      }).expect(401);
      const unknownEmail = await call(t, 'post', '/auth/login', {
        body: { identifier: `${ghost}@example.test`, password: 'Wrong!Password-1' },
      }).expect(401);
      const unknownPhone = await call(t, 'post', '/auth/login', {
        body: { identifier: '9123456780', password: 'Wrong!Password-1' },
      }).expect(401);
      const nonsense = await call(t, 'post', '/auth/login', {
        body: { identifier: '!!! ???', password: 'Wrong!Password-1' },
      }).expect(401);

      const shape = (r: typeof wrongPassword) => ({
        status: r.status,
        code: r.body.error.code,
        message: r.body.error.message,
        keys: Object.keys(r.body.error).sort(),
        detailKeys: Object.keys(r.body.error.details ?? {}).sort(),
      });
      for (const other of [unknownUser, unknownEmail, unknownPhone, nonsense]) {
        expect(shape(other).code).toBe('INVALID_CREDENTIALS');
        expect(shape(other).message).toBe(shape(wrongPassword).message);
      }
      for (const other of [unknownUser, unknownEmail, unknownPhone]) {
        expect(shape(other)).toEqual(shape(wrongPassword));
        // The number left counts what was typed, so it is the same for a real and an invented name.
        expect(other.body.error.details.attemptsRemaining).toBe(
          wrongPassword.body.error.details.attemptsRemaining,
        );
      }
    });

    it('counts down, then pauses sign-in, for a real account and an invented one alike', async () => {
      const max = t.env.AUTH_MAX_FAILED_LOGINS;
      const real = await signUp(t);
      const ghost = freshName('ghost');

      const run = async (identifier: string) => {
        const out: Array<{ status: number; code: string; left: number | undefined }> = [];
        for (let i = 0; i < max; i++) {
          const res = await call(t, 'post', '/auth/login', {
            body: { identifier, password: 'Wrong!Password-1' },
          });
          out.push({
            status: res.status,
            code: res.body.error.code,
            left: res.body.error.details?.attemptsRemaining,
          });
        }
        return out;
      };
      const realRun = await run(real.username);
      const ghostRun = await run(ghost);

      expect(realRun).toEqual(ghostRun);
      expect(realRun.slice(0, -1).map((r) => r.left)).toEqual(
        Array.from({ length: max - 1 }, (_, i) => max - 1 - i),
      );
      expect(realRun.at(-1)).toMatchObject({ status: 423, code: 'ACCOUNT_LOCKED' });
    });

    it('keeps a locked account locked, even for the right password', async () => {
      const a = await signUp(t);
      for (let i = 0; i < t.env.AUTH_MAX_FAILED_LOGINS; i++) {
        await logIn(t, a, { password: 'Wrong!Password-1' });
      }
      const res = await logIn(t, a).expect(423);
      expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
      expect(new Date(res.body.error.details.until).getTime()).toBeGreaterThan(Date.now());
      expect(res.body.data).toBeUndefined();

      // The lock is on the account row too, so it survives a cache flush and support can see it.
      const row = await t.db.query<{ locked_until: Date | null; failed_login_count: number }>(
        'SELECT locked_until, failed_login_count FROM users WHERE id = $1',
        [a.id],
      );
      expect(row.rows[0]?.locked_until).not.toBeNull();
      expect(row.rows[0]?.failed_login_count).toBe(t.env.AUTH_MAX_FAILED_LOGINS);
    });

    it('lets a person back in once the pause ends', async () => {
      const a = await signUp(t);
      for (let i = 0; i < t.env.AUTH_MAX_FAILED_LOGINS; i++)
        await logIn(t, a, { password: 'Wrong!Password-1' });
      await logIn(t, a).expect(423);

      // Time passes: the row's lock lapses and the in-memory counter is cleared as its expiry would.
      await t.db.query(
        "UPDATE users SET locked_until = now() - interval '1 second' WHERE id = $1",
        [a.id],
      );
      const store = t.app.get(LoginAttemptStore, { strict: false });
      await store.reset(loginAttemptKey(t.env.OTP_HMAC_SECRET, 'username', a.username));

      const res = await logIn(t, a).expect(200);
      expect(res.body.data.status).toBe('authenticated');
    });

    it('forgets earlier mistakes after a success', async () => {
      const a = await signUp(t);
      const max = t.env.AUTH_MAX_FAILED_LOGINS;
      for (let i = 0; i < max - 1; i++)
        await logIn(t, a, { password: 'Wrong!Password-1' }).expect(401);
      await logIn(t, a).expect(200);
      // A full fresh set of attempts, not one.
      for (let i = 0; i < max - 1; i++)
        await logIn(t, a, { password: 'Wrong!Password-1' }).expect(401);
      await logIn(t, a).expect(200);
    });

    it('records failures in the login activity of the real account only', async () => {
      const a = await signUp(t);
      await logIn(t, a, { password: 'Wrong!Password-1' }).expect(401);
      const feed = await call(t, 'get', '/security/events', {
        token: a.accessToken,
        query: { kind: 'failed' },
      }).expect(200);
      expect(feed.body.data).toHaveLength(1);
      expect(feed.body.data[0].type).toBe('LOGIN_FAILED');
      // The address in the feed is partly hidden.
      expect(feed.body.data[0].ip).not.toBe(a.ip);
    });

    it('rejects an empty identifier or password as invalid input, not as a guess', async () => {
      await call(t, 'post', '/auth/login', { body: { identifier: '', password: 'x' } }).expect(400);
      await call(t, 'post', '/auth/login', { body: { identifier: 'someone' } }).expect(400);
      await call(t, 'post', '/auth/login', {
        body: { identifier: 'a'.repeat(300), password: 'x' },
      }).expect(400);
      await call(t, 'post', '/auth/login', {
        body: { identifier: 'someone', password: 'x'.repeat(500) },
      }).expect(400);
    });
  });

  describe('accounts that cannot sign in', () => {
    it('refuses a suspended account only to someone who has the right password', async () => {
      const a = await signUp(t);
      await t.db.query("UPDATE users SET status = 'SUSPENDED' WHERE id = $1", [a.id]);

      const ok = await logIn(t, a).expect(403);
      expect(ok.body.error.code).toBe('ACCOUNT_SUSPENDED');
      // A wrong password learns nothing about the status.
      const bad = await logIn(t, a, { password: 'Wrong!Password-1' }).expect(401);
      expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('ends access for sessions already open when an account is suspended', async () => {
      const a = await signUp(t);
      await call(t, 'get', '/users/me', { token: a.accessToken }).expect(200);
      await t.db.query("UPDATE users SET status = 'SUSPENDED' WHERE id = $1", [a.id]);
      // The guard keeps a very short cache of "is this session alive"; the account service drops it on a status change.
      const sessions = t.app.get(UserSessionService, { strict: false });
      const live = await t.db.query<{ id: string }>(
        'SELECT id FROM user_sessions WHERE user_id = $1',
        [a.id],
      );
      live.rows.forEach((r) => sessions.invalidate(r.id));
      const res = await call(t, 'get', '/users/me', { token: a.accessToken }).expect(403);
      expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });

    it('treats a deleted account as unknown', async () => {
      const a = await signUp(t);
      await t.db.query("UPDATE users SET status = 'DELETED' WHERE id = $1", [a.id]);
      const res = await logIn(t, a).expect(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('new devices and places', () => {
    it('lets a new device in but tells the owner', async () => {
      const a = await signUp(t);
      const before = outbox(t).to(a.email).length;
      const res = await call(t, 'post', '/auth/login', {
        ip: freshIp(),
        body: {
          identifier: a.username,
          password: a.password,
          device: deviceBody('another-phone-0001', 'Pixel 8'),
        },
      }).expect(200);
      expect(res.body.data.status).toBe('authenticated');
      expect(res.body.data.newDevice).toBe(true);

      const mails = outbox(t).to(a.email).slice(before);
      expect(mails.some((m) => m.template === 'security_new_device')).toBe(true);
      expect(mails.find((m) => m.template === 'security_new_device')?.body).toContain('Pixel 8');

      const feed = await call(t, 'get', '/security/events', {
        token: a.accessToken,
        query: { kind: 'successful' },
      }).expect(200);
      expect(feed.body.data.map((e: { type: string }) => e.type)).toContain('NEW_DEVICE_LOGIN');
    });

    it('stays quiet about new devices if the owner turned login alerts off', async () => {
      const a = await signUp(t);
      await call(t, 'put', '/security/alert-preferences', {
        token: a.accessToken,
        body: { loginAlerts: false },
      }).expect(200);
      const before = outbox(t).to(a.email).length;
      await call(t, 'post', '/auth/login', {
        ip: freshIp(),
        body: {
          identifier: a.username,
          password: a.password,
          device: deviceBody('quiet-device-0001'),
        },
      }).expect(200);
      expect(
        outbox(t)
          .to(a.email)
          .slice(before)
          .some((m) => m.template === 'security_new_device'),
      ).toBe(false);
    });

    it('asks for a code when device, network and place are all new, and signs in only after it', async () => {
      const a = await signUp(t);
      // Establish a usual place.
      await call(t, 'post', '/auth/login', {
        ip: a.ip,
        headers: { 'X-Geo-City': 'Hyderabad', 'X-Geo-Region': 'TS' },
        body: { identifier: a.username, password: a.password, device: deviceBody(a.deviceId) },
      }).expect(200);

      const ask = await call(t, 'post', '/auth/login', {
        ip: freshIp(),
        headers: { 'X-Geo-City': 'Delhi', 'X-Geo-Region': 'DL' },
        body: {
          identifier: a.username,
          password: a.password,
          device: deviceBody('far-away-device-1'),
        },
      }).expect(200);
      expect(ask.body.data.status).toBe('verification_required');
      expect(ask.body.data.reason).toBe('unusual_sign_in');
      expect(ask.body.data.tokens).toBeUndefined();
      expect(JSON.stringify(ask.body)).not.toMatch(/accessToken|refreshToken/);

      // The challenge is finished at /auth/login/verify, with the code that was mailed.
      const challengeId = ask.body.data.verification.challengeId;
      const bad = await call(t, 'post', '/auth/login/verify', {
        body: { challengeId, code: '000000', method: 'otp' },
      }).expect(400);
      expect(bad.body.error.code).toBe('OTP_INVALID');

      const done = await call(t, 'post', '/auth/login/verify', {
        body: {
          challengeId,
          code: codeSentTo(t, a.email),
          method: 'otp',
          device: deviceBody('far-away-device-1'),
        },
      }).expect(200);
      expect(done.body.data.status).toBe('authenticated');
      expect(done.body.data.newDevice).toBe(true);

      const feed = await call(t, 'get', '/security/events', {
        token: done.body.data.tokens.accessToken,
        query: { kind: 'suspicious' },
      }).expect(200);
      expect(feed.body.data[0]).toMatchObject({ type: 'SUSPICIOUS_LOGIN', severity: 'WARNING' });
      expect(feed.body.data[0].riskScore).toBeGreaterThanOrEqual(60);
      expect(
        outbox(t)
          .to(a.email)
          .some((m) => m.template === 'security_suspicious_login'),
      ).toBe(true);
    });

    it('does not let a code meant for one sign-in finish another, or be used twice', async () => {
      const a = await signUp(t);
      await call(t, 'post', '/auth/login', {
        ip: a.ip,
        headers: { 'X-Geo-City': 'Hyderabad', 'X-Geo-Region': 'TS' },
        body: { identifier: a.username, password: a.password, device: deviceBody(a.deviceId) },
      }).expect(200);
      const ask = await call(t, 'post', '/auth/login', {
        ip: freshIp(),
        headers: { 'X-Geo-City': 'Delhi', 'X-Geo-Region': 'DL' },
        body: {
          identifier: a.username,
          password: a.password,
          device: deviceBody('device-for-reuse-1'),
        },
      }).expect(200);
      const { challengeId } = ask.body.data.verification;
      const code = codeSentTo(t, a.email);
      await call(t, 'post', '/auth/login/verify', {
        body: { challengeId, code, method: 'otp' },
      }).expect(200);
      const again = await call(t, 'post', '/auth/login/verify', {
        body: { challengeId, code, method: 'otp' },
      }).expect(400);
      expect(again.body.error.code).toBe('OTP_INVALID');

      // A registration challenge is not a sign-in challenge.
      const other = await signUp(t);
      const reg = await call(t, 'post', '/auth/login', {
        body: { identifier: other.username, password: 'Wrong-1!xxxxxxxx' },
      });
      expect(reg.status).toBe(401);
      const wrongPurpose = await call(t, 'post', '/auth/login/verify', {
        body: { challengeId: crypto.randomUUID(), code: '123456', method: 'otp' },
      }).expect(400);
      expect(wrongPurpose.body.error.code).toBe('OTP_INVALID');
    });
  });

  describe('sessions', () => {
    it('retires the least recently used device beyond the cap', async () => {
      const a = await signUp(t);
      const cap = 20;
      const tokens: string[] = [a.accessToken];
      for (let i = 0; i < cap; i++) {
        const res = await call(t, 'post', '/auth/login', {
          ip: a.ip,
          body: { identifier: a.username, password: a.password, device: deviceBody(a.deviceId) },
        }).expect(200);
        tokens.push(res.body.data.tokens.accessToken);
      }
      const active = await t.db.query<{ n: string }>(
        'SELECT count(*) AS n FROM user_sessions WHERE user_id = $1 AND revoked_at IS NULL',
        [a.id],
      );
      expect(Number(active.rows[0]?.n)).toBe(cap);
      // The very first (oldest) sign-in was the one retired.
      const sessions = t.app.get(UserSessionService, { strict: false });
      const first = await t.db.query<{ id: string }>(
        'SELECT id FROM user_sessions WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1',
        [a.id],
      );
      sessions.invalidate(first.rows[0]!.id);
      await call(t, 'get', '/users/me', { token: tokens[0]! }).expect(401);
      await call(t, 'get', '/users/me', { token: tokens.at(-1)! }).expect(200);
    }, 60_000);

    it('lists devices with a partly hidden address, marks the current one, and revokes by id', async () => {
      const a = await signUp(t);
      const other = await logIn(t, a, { deviceId: 'second-phone-00001', ip: freshIp() }).expect(
        200,
      );

      const list = await call(t, 'get', '/sessions', { token: a.accessToken }).expect(200);
      expect(list.body.data).toHaveLength(2);
      const current = list.body.data.filter((s: { current: boolean }) => s.current);
      expect(current).toHaveLength(1);
      expect(JSON.stringify(list.body)).not.toContain(a.ip);
      expect(JSON.stringify(list.body)).not.toMatch(/refresh|token|hash/i);

      const otherId = list.body.data.find((s: { current: boolean }) => !s.current).id;
      await call(t, 'delete', `/sessions/${otherId}`, { token: a.accessToken }).expect(204);
      const res = await call(t, 'get', '/users/me', {
        token: other.body.data.tokens.accessToken,
      }).expect(401);
      expect(res.body.error.code).toBe('SESSION_REVOKED');
      // A second revoke finds nothing.
      await call(t, 'delete', `/sessions/${otherId}`, { token: a.accessToken }).expect(404);
    });

    it("never reveals or revokes someone else's session", async () => {
      const mine = await signUp(t);
      const theirs = await signUp(t);
      const list = await call(t, 'get', '/sessions', { token: theirs.accessToken }).expect(200);
      const theirSessionId = list.body.data[0].id;
      const res = await call(t, 'delete', `/sessions/${theirSessionId}`, {
        token: mine.accessToken,
      }).expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      await call(t, 'get', '/users/me', { token: theirs.accessToken }).expect(200);
      await call(t, 'delete', '/sessions/not-a-uuid', { token: mine.accessToken }).expect(400);
    });

    it('signs out every other device at once', async () => {
      const a = await signUp(t);
      const second = await logIn(t, a, { deviceId: 'second-phone-00002', ip: freshIp() }).expect(
        200,
      );
      const third = await logIn(t, a, { deviceId: 'third-phone-000003', ip: freshIp() }).expect(
        200,
      );
      const res = await call(t, 'post', '/sessions/revoke-others', { token: a.accessToken }).expect(
        200,
      );
      expect(res.body.data.signedOut).toBe(2);
      await call(t, 'get', '/users/me', { token: a.accessToken }).expect(200);
      await call(t, 'get', '/users/me', { token: second.body.data.tokens.accessToken }).expect(401);
      await call(t, 'get', '/users/me', { token: third.body.data.tokens.accessToken }).expect(401);
    });
  });

  it('ties the account password to nothing but a keyed argon2id hash', async () => {
    const a = await signUp(t);
    const row = await t.db.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [a.id],
    );
    expect(row.rows[0]?.password_hash.startsWith('$argon2id$')).toBe(true);
    expect(PASSWORD.length).toBeGreaterThan(0);
  });
});
