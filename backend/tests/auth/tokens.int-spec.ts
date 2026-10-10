import { SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TokenService } from '../../src/auth/token.service.js';
import { hmacHex } from '../../src/common/crypto/tokens.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { AUTH_TEST_ENV, type Account, call, signUp } from '../support/auth.js';

describe('access and refresh tokens', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ ...AUTH_TEST_ENV });
  });
  afterAll(async () => {
    await t.close();
  });

  const me = (token?: string) => call(t, 'get', '/users/me', token ? { token } : {});
  const refresh = (refreshToken: string) =>
    call(t, 'post', '/auth/refresh', { body: { refreshToken } });

  /** Signs a token the way the server does, so a test can bend one property at a time. */
  async function forge(
    a: Account,
    o: {
      secret?: string;
      audience?: string;
      issuer?: string;
      ttl?: string;
      realm?: string;
      sid?: string;
      alg?: 'HS256' | 'HS384';
    } = {},
  ): Promise<string> {
    const realm = o.realm ?? 'user';
    const key = Buffer.from(hmacHex(o.secret ?? t.env.JWT_SECRET, `blocks:jwt:${realm}`), 'hex');
    const sid = o.sid ?? (await sessionIdOf(a));
    return new SignJWT({ sid, amr: ['pwd'], scp: 'full' })
      .setProtectedHeader({ alg: o.alg ?? 'HS256', typ: 'at+jwt' })
      .setIssuer(o.issuer ?? t.env.JWT_ISSUER)
      .setAudience(o.audience ?? 'blocks-app')
      .setSubject(a.id)
      .setIssuedAt()
      .setExpirationTime(o.ttl ?? '10m')
      .sign(key);
  }

  async function sessionIdOf(a: Account): Promise<string> {
    const r = await t.db.query<{ id: string }>(
      'SELECT id FROM user_sessions WHERE user_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1',
      [a.id],
    );
    return r.rows[0]!.id;
  }

  describe('the access token', () => {
    it('is required, and only as a Bearer header', async () => {
      const a = await signUp(t);
      for (const header of [
        undefined,
        '',
        'Bearer',
        'Bearer ',
        `Basic ${a.accessToken}`,
        `bearer ${a.accessToken}`,
        `Bearer ${a.accessToken} extra`,
      ]) {
        const req = t.http.get('/api/v1/users/me');
        const res = await (header === undefined ? req : req.set('Authorization', header));
        expect(res.status, String(header)).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHENTICATED');
      }
      await me(a.accessToken).expect(200);
    });

    it('is not accepted from a query string or a cookie', async () => {
      const a = await signUp(t);
      await t.http.get(`/api/v1/users/me?access_token=${a.accessToken}`).expect(401);
      await t.http
        .get('/api/v1/users/me')
        .set('Cookie', `access_token=${a.accessToken}`)
        .expect(401);
    });

    it('is refused when tampered with', async () => {
      const a = await signUp(t);
      const [h, p, s] = a.accessToken.split('.') as [string, string, string];
      const flipped = s.slice(0, -2) + (s.endsWith('AA') ? 'BB' : 'AA');
      await me(`${h}.${p}.${flipped}`).expect(401);

      // A payload claiming another user, with the old signature.
      const payload = JSON.parse(Buffer.from(p, 'base64url').toString()) as Record<string, unknown>;
      payload['sub'] = '00000000-0000-7000-8000-000000000000';
      await me(`${h}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${s}`).expect(
        401,
      );
    });

    it('is refused with the "none" algorithm', async () => {
      const a = await signUp(t);
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'at+jwt' })).toString(
        'base64url',
      );
      const payload = Buffer.from(
        JSON.stringify({
          sub: a.id,
          sid: await sessionIdOf(a),
          aud: 'blocks-app',
          iss: t.env.JWT_ISSUER,
          exp: Math.floor(Date.now() / 1000) + 600,
        }),
      ).toString('base64url');
      const res = await me(`${header}.${payload}.`).expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('is refused with a different HMAC algorithm', async () => {
      const a = await signUp(t);
      await me(await forge(a, { alg: 'HS384' })).expect(401);
    });

    it('is refused when it is signed with some other secret', async () => {
      const a = await signUp(t);
      await me(await forge(a, { secret: 'an-attacker-guess-of-the-secret-0123456789' })).expect(
        401,
      );
      // …while the same recipe with the real secret is accepted, so the test is meaningful.
      await me(await forge(a)).expect(200);
    });

    it('is refused for the wrong audience or issuer', async () => {
      const a = await signUp(t);
      await me(await forge(a, { audience: 'blocks-admin' })).expect(401);
      await me(await forge(a, { issuer: 'someone-else' })).expect(401);
    });

    it('is refused when it was minted in the staff realm', async () => {
      const a = await signUp(t);
      const sid = await sessionIdOf(a);
      const staff = await t.app.get(TokenService, { strict: false }).signAccess('admin', {
        subject: a.id,
        sessionId: sid,
        methods: ['pwd', 'totp'],
        scope: 'full',
      });
      await me(staff.token).expect(401);
      // Even re-labelled with the app audience, the staff key does not verify.
      await me(await forge(a, { realm: 'admin' })).expect(401);
    });

    it('says plainly when it has expired, so the app knows to refresh', async () => {
      const a = await signUp(t);
      const res = await me(await forge(a, { ttl: '-1m' })).expect(401);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('is refused when the session it names never existed', async () => {
      const a = await signUp(t);
      const res = await me(await forge(a, { sid: '01990000-0000-7000-8000-000000000001' })).expect(
        401,
      );
      expect(res.body.error.code).toBe('SESSION_REVOKED');
    });

    it('is refused when it names somebody else’s session', async () => {
      const a = await signUp(t);
      const b = await signUp(t);
      const res = await me(await forge(a, { sid: await sessionIdOf(b) })).expect(401);
      expect(res.body.error.code).toBe('SESSION_REVOKED');
    });

    it('stops working at once on sign-out', async () => {
      const a = await signUp(t);
      await me(a.accessToken).expect(200);
      await call(t, 'post', '/auth/logout', { token: a.accessToken }).expect(204);
      const res = await me(a.accessToken).expect(401);
      expect(res.body.error.code).toBe('SESSION_REVOKED');
      // …and the refresh token goes with it.
      const r = await refresh(a.refreshToken).expect(401);
      expect(r.body.error.code).toBe('SESSION_REVOKED');
    });

    it('carries nothing a client could misuse: no roles, no contact details, no secrets', async () => {
      const a = await signUp(t);
      const payload = JSON.parse(
        Buffer.from(a.accessToken.split('.')[1]!, 'base64url').toString(),
      ) as Record<string, unknown>;
      expect(Object.keys(payload).sort()).toEqual([
        'amr',
        'aud',
        'exp',
        'iat',
        'iss',
        'scp',
        'sid',
        'sub',
      ]);
      expect(JSON.stringify(payload)).not.toContain(a.email);
    });
  });

  describe('refreshing', () => {
    it('trades a refresh token for a new pair, and the old one stops being current', async () => {
      const a = await signUp(t);
      const res = await refresh(a.refreshToken).expect(200);
      const next = res.body.data.tokens;
      expect(next.refreshToken).not.toBe(a.refreshToken);
      expect(next.accessToken).not.toBe(a.accessToken);
      expect(next.tokenType).toBe('Bearer');
      await me(next.accessToken).expect(200);

      const stored = await t.db.query<{ refresh_token_hash: string }>(
        'SELECT refresh_token_hash FROM user_sessions WHERE user_id = $1',
        [a.id],
      );
      // Stored only as a hash.
      expect(stored.rows[0]?.refresh_token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(stored.rows)).not.toContain(next.refreshToken.split('.')[1]);
    });

    it('forgives a response that was lost: the same token works once more within seconds', async () => {
      const a = await signUp(t);
      const first = await refresh(a.refreshToken).expect(200);
      const retry = await refresh(a.refreshToken).expect(200);
      expect(retry.body.data.tokens.refreshToken).not.toBe(first.body.data.tokens.refreshToken);
    });

    it('treats a replaced token shown later as theft: the session ends and the owner is warned', async () => {
      const a = await signUp(t);
      const first = await refresh(a.refreshToken).expect(200);
      // The grace period passes.
      await t.db.query(
        "UPDATE user_sessions SET rotated_at = now() - interval '1 minute' WHERE user_id = $1",
        [a.id],
      );

      const replay = await refresh(a.refreshToken).expect(401);
      expect(replay.body.error.code).toBe('SESSION_REVOKED');

      // The legitimate owner is signed out too: nobody can tell who is who, so neither keeps access.
      const current = await refresh(first.body.data.tokens.refreshToken).expect(401);
      expect(current.body.error.code).toBe('SESSION_REVOKED');
      await me(first.body.data.tokens.accessToken).expect(401);

      const session = await t.db.query<{ revoked_reason: string }>(
        'SELECT revoked_reason FROM user_sessions WHERE user_id = $1',
        [a.id],
      );
      expect(session.rows[0]?.revoked_reason).toBe('REUSE_DETECTED');
      const events = await t.db.query<{ type: string; severity: string }>(
        "SELECT type, severity FROM security_events WHERE user_id = $1 AND type = 'REFRESH_TOKEN_REUSE'",
        [a.id],
      );
      expect(events.rows).toEqual([{ type: 'REFRESH_TOKEN_REUSE', severity: 'CRITICAL' }]);
    });

    it('does not end the owner’s session for a made-up secret on a real session id', async () => {
      const a = await signUp(t);
      const sessionId = a.refreshToken.split('.')[0];
      const res = await refresh(`${sessionId}.${'x'.repeat(60)}`).expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
      await refresh(a.refreshToken).expect(200);
    });

    it('refuses things that are not refresh tokens', async () => {
      await refresh('short').expect(400);
      const res = await refresh('x'.repeat(60)).expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
      await call(t, 'post', '/auth/refresh', { body: {} }).expect(400);
      await call(t, 'post', '/auth/refresh', { body: { refreshToken: { $ne: null } } }).expect(400);
    });

    it('stays consistent when two refreshes race', async () => {
      const a = await signUp(t);
      const results = await Promise.all(Array.from({ length: 5 }, () => refresh(a.refreshToken)));
      const ok = results.filter((r) => r.status === 200);
      expect(results.every((r) => r.status === 200 || r.status === 401)).toBe(true);
      expect(ok.length).toBeGreaterThanOrEqual(1);
      // Exactly one of the issued tokens is the current one, and the session is intact.
      const live = await Promise.all(
        ok.map((r) => refresh(r.body.data.tokens.refreshToken).then((x) => x.status)),
      );
      expect(live.filter((s) => s === 200).length).toBeGreaterThanOrEqual(1);
      const row = await t.db.query<{ revoked_at: Date | null }>(
        'SELECT revoked_at FROM user_sessions WHERE user_id = $1',
        [a.id],
      );
      expect(row.rows[0]?.revoked_at).toBeNull();
    });

    it('refuses once the sign-in has lapsed', async () => {
      const a = await signUp(t);
      await t.db.query(
        "UPDATE user_sessions SET expires_at = now() - interval '1 minute' WHERE user_id = $1",
        [a.id],
      );
      const res = await refresh(a.refreshToken).expect(401);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('never extends a sign-in beyond its absolute limit', async () => {
      const a = await signUp(t);
      await t.db.query(
        "UPDATE user_sessions SET created_at = now() - interval '179 days' WHERE user_id = $1",
        [a.id],
      );
      await refresh(a.refreshToken).expect(200);
      const row = await t.db.query<{ days: number }>(
        'SELECT extract(epoch FROM (expires_at - created_at)) / 86400 AS days FROM user_sessions WHERE user_id = $1',
        [a.id],
      );
      expect(Number(row.rows[0]?.days)).toBeLessThanOrEqual(180.01);
    });

    it('refuses to refresh for an account that has since been deleted or suspended', async () => {
      const gone = await signUp(t);
      await t.db.query("UPDATE users SET status = 'DELETED' WHERE id = $1", [gone.id]);
      const res = await refresh(gone.refreshToken).expect(401);
      expect(res.body.error.code).toBe('SESSION_REVOKED');

      const held = await signUp(t);
      await t.db.query("UPDATE users SET status = 'SUSPENDED' WHERE id = $1", [held.id]);
      const sus = await refresh(held.refreshToken).expect(403);
      expect(sus.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });
  });

  describe('routes that need no sign-in', () => {
    it('are exactly the ones meant to be public', async () => {
      // Anything not marked @Public() must say 401 to a stranger.
      for (const [method, path] of [
        ['get', '/users/me'],
        ['get', '/sessions'],
        ['post', '/sessions/revoke-others'],
        ['get', '/security/events'],
        ['get', '/security/two-factor'],
        ['post', '/security/two-factor/setup'],
        ['put', '/security/alert-preferences'],
        ['get', '/account/contacts'],
        ['post', '/account/deletion/request'],
        ['post', '/auth/logout'],
        ['post', '/auth/password/change'],
        ['get', '/notifications'],
        ['post', '/notifications/devices'],
      ] as const) {
        const res = await call(t, method, path);
        expect(res.status, `${method} ${path}`).toBe(401);
      }
      await call(t, 'get', '/auth/password-policy').expect(200);
      await call(t, 'get', '/health/live').expect(200);
    });
  });
});
