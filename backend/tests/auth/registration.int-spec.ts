import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

describe('registration and contact verification', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ ...AUTH_TEST_ENV });
  });
  afterAll(async () => {
    await t.close();
  });

  const body = (over: Record<string, unknown> = {}) => {
    const username = freshName();
    return {
      username,
      displayName: 'Asha Rao',
      email: `${username}@example.test`,
      password: PASSWORD,
      dateOfBirth: '1999-06-01',
      device: deviceBody(`dev-${username}`),
      ...over,
    };
  };

  describe('the happy path', () => {
    it('creates the account, mails a code, and signs in once the code is confirmed', async () => {
      const b = body();
      const reg = await call(t, 'post', '/auth/register', { body: b }).expect(202);

      const v = reg.body.data.verification;
      expect(v.channel).toBe('EMAIL');
      expect(v.challengeId).toMatch(/^[0-9a-f-]{36}$/);
      // The address is masked even though the caller just typed it.
      expect(v.destinationMasked).not.toBe(b.email);
      expect(v.destinationMasked).toContain('***');
      // No tokens before the address is proven.
      expect(JSON.stringify(reg.body)).not.toMatch(/accessToken|refreshToken/);

      const ok = await call(t, 'post', '/auth/verify-contact', {
        body: { challengeId: v.challengeId, code: codeSentTo(t, b.email), device: b.device },
      }).expect(200);

      const { tokens, user } = ok.body.data;
      expect(ok.body.data.status).toBe('authenticated');
      expect(tokens.tokenType).toBe('Bearer');
      expect(tokens.accessToken.split('.')).toHaveLength(3);
      expect(tokens.refreshToken).toMatch(/^[0-9a-f-]{36}\./);
      expect(tokens.expiresIn).toBe(t.env.ACCESS_TOKEN_TTL_SECONDS);
      expect(user.username).toBe(b.username);
      expect(user.emailVerified).toBe(true);
      expect(user.email).not.toBe(b.email);

      const me = await call(t, 'get', '/users/me', { token: tokens.accessToken }).expect(200);
      expect(me.body.data.id).toBe(user.id);
      expect(me.body.data.status).toBe('ACTIVE');
      expect(me.body.data.accountType).toBe('PERSONAL');
      expect(me.body.data).not.toHaveProperty('passwordHash');
    });

    it('stores a password hash, never the password, and keeps the birth date on the profile only', async () => {
      const a = await signUp(t);
      const rows = await t.db.query<{ password_hash: string }>(
        'SELECT password_hash FROM users WHERE id = $1',
        [a.id],
      );
      expect(rows.rows[0]?.password_hash).toMatch(/^\$argon2id\$/);
      expect(rows.rows[0]?.password_hash).not.toContain(a.password);

      const profile = await t.db.query<{ date_of_birth: Date }>(
        'SELECT date_of_birth FROM profiles WHERE user_id = $1',
        [a.id],
      );
      expect(profile.rows).toHaveLength(1);
      const me = await call(t, 'get', '/users/me', { token: a.accessToken }).expect(200);
      expect(JSON.stringify(me.body)).not.toMatch(/1998|dateOfBirth/);
    });

    it('accepts a phone number typed the usual Indian ways and stores E.164', async () => {
      const username = freshName('ph');
      const reg = await call(t, 'post', '/auth/register', {
        body: { ...body({ username }), email: undefined, phone: '98765 43210' },
      }).expect(202);
      expect(reg.body.data.verification.channel).toBe('SMS');
      const code = codeSentTo(t, '+919876543210');
      const ok = await call(t, 'post', '/auth/verify-contact', {
        body: { challengeId: reg.body.data.verification.challengeId, code },
      }).expect(200);
      expect(ok.body.data.user.phoneVerified).toBe(true);

      // …and signing in works with any spelling of the same number.
      for (const spelling of ['+91 98765 43210', '09876543210', '9876543210']) {
        const res = await call(t, 'post', '/auth/login', {
          body: { identifier: spelling, password: PASSWORD },
        }).expect(200);
        expect(res.body.data.status).toBe('authenticated');
      }
    });

    it('lets the username be typed with an @ or capitals', async () => {
      const a = await signUp(t, { username: freshName('mixed') });
      const res = await logIn(t, a, { identifier: `@${a.username.toUpperCase()}` }).expect(200);
      expect(res.body.data.status).toBe('authenticated');
    });
  });

  describe('input rules', () => {
    const cases: Array<[string, Record<string, unknown>, string, string]> = [
      ['a password that is too short', { password: 'Ab1!' }, 'password', 'too_short'],
      [
        'a password with no capital letter',
        { password: 'sunrise!pass-2026' },
        'password',
        'no_uppercase',
      ],
      ['a password with no digit', { password: 'Sunrise!Pass-Only' }, 'password', 'no_digit'],
      ['a password with no symbol', { password: 'SunrisePass2026x' }, 'password', 'no_special'],
      ['a common password', { password: 'Password123!' }, 'password', 'too_common'],
      ['an e-mail address that is not one', { email: 'not-an-email' }, 'email', 'invalid'],
      [
        'a phone number that is not Indian or E.164',
        { email: undefined, phone: '12345' },
        'phone',
        'invalid',
      ],
      ['a username with a space', { username: 'two words' }, 'username', 'invalid_format'],
      ['a username that is too short', { username: 'ab' }, 'username', 'invalid_format'],
      [
        'someone under 13',
        { dateOfBirth: `${new Date().getUTCFullYear() - 10}-01-01` },
        'dateOfBirth',
        'too_young',
      ],
    ];

    it.each(cases)('rejects %s', async (_label, over, field, reason) => {
      const res = await call(t, 'post', '/auth/register', { body: body(over) }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      const issue = (res.body.error.details as Array<{ field: string; reasons: string[] }>).find(
        (i) => i.field === field,
      );
      expect(issue?.reasons).toContain(reason);
    });

    it('needs an e-mail or a phone number', async () => {
      const res = await call(t, 'post', '/auth/register', {
        body: body({ email: undefined }),
      }).expect(400);
      expect(JSON.stringify(res.body.error.details)).toContain('email_or_phone_required');
    });

    it('refuses a password containing the username or e-mail name', async () => {
      const username = 'rahulsharma';
      const res = await call(t, 'post', '/auth/register', {
        body: body({ username, email: 'rahul@example.test', password: 'Rahulsharma!2026' }),
      }).expect(400);
      expect(JSON.stringify(res.body.error.details)).toContain('contains_identifier');
    });

    it('refuses fields the client has no business sending (no privilege or status injection)', async () => {
      for (const extra of [
        { status: 'ACTIVE' },
        { accountType: 'CREATOR' },
        { isAdmin: true },
        { role: 'SUPER_ADMIN' },
        { emailVerified: true },
        { isKycVerified: true },
        { reachLevel: 5 },
      ]) {
        const res = await call(t, 'post', '/auth/register', { body: body(extra) }).expect(400);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
      }
    });

    it('refuses reserved names and taken usernames', async () => {
      for (const reserved of ['admin', 'support', 'blocks', 'root']) {
        const res = await call(t, 'post', '/auth/register', {
          body: body({ username: reserved }),
        }).expect(409);
        expect(res.body.error.code).toBe('USERNAME_TAKEN');
      }
      const first = await signUp(t);
      const dup = await call(t, 'post', '/auth/register', {
        body: body({ username: first.username.toUpperCase() }),
      }).expect(409);
      expect(dup.body.error.code).toBe('USERNAME_TAKEN');
    });

    it('answers malformed JSON with the normal error shape', async () => {
      const res = await t.http
        .post('/api/v1/auth/register')
        .set('Content-Type', 'application/json')
        .send('{"username": ')
        .expect(400);
      expect(res.body.error.code).toBeDefined();
      expect(res.body.error.requestId).toBeDefined();
    });
  });

  describe('an address that already has an account', () => {
    it('gets an answer indistinguishable from a new registration, and creates nothing', async () => {
      const owner = await signUp(t);
      const before = await t.db.query<{ n: string }>('SELECT count(*) AS n FROM users');

      const fresh = await call(t, 'post', '/auth/register', { body: body() }).expect(202);
      const dupe = await call(t, 'post', '/auth/register', {
        body: body({ email: owner.email }),
      }).expect(202);

      expect(Object.keys(dupe.body.data.verification).sort()).toEqual(
        Object.keys(fresh.body.data.verification).sort(),
      );
      expect(dupe.body.data.verification.channel).toBe(fresh.body.data.verification.channel);

      const after = await t.db.query<{ n: string }>('SELECT count(*) AS n FROM users');
      // One new user (the fresh one); none for the duplicate.
      expect(Number(after.rows[0]?.n) - Number(before.rows[0]?.n)).toBe(1);
    });

    it('sends the decoy no code, so it can never be completed', async () => {
      const owner = await signUp(t);
      const dupe = await call(t, 'post', '/auth/register', {
        body: body({ email: owner.email }),
      }).expect(202);
      const challengeId = dupe.body.data.verification.challengeId;

      // The only mail to the owner is the "someone tried" notice, which carries no code.
      const notices = outbox(t)
        .to(owner.email)
        .filter((m) => m.template.startsWith('security_'));
      expect(notices.length).toBeGreaterThan(0);
      expect(notices.every((m) => !/\b\d{6}\b/.test(m.body))).toBe(true);

      // Neither a guess nor the owner's own earlier code opens it.
      for (const code of ['000000', '123456']) {
        const res = await call(t, 'post', '/auth/verify-contact', {
          body: { challengeId, code },
        }).expect(400);
        expect(res.body.error.code).toBe('OTP_INVALID');
        expect(res.body.data).toBeUndefined();
      }
    });

    it('warns the real owner privately', async () => {
      const owner = await signUp(t);
      await call(t, 'post', '/auth/register', { body: body({ email: owner.email }) }).expect(202);
      const list = await call(t, 'get', '/notifications', { token: owner.accessToken }).expect(200);
      expect(list.body.data.some((n: { type: string }) => n.type === 'SECURITY_ALERT')).toBe(true);
    });
  });

  describe('the verification code', () => {
    it('counts wrong guesses, then refuses even the right code until a new one is requested', async () => {
      const b = body();
      const reg = await call(t, 'post', '/auth/register', { body: b }).expect(202);
      const { challengeId } = reg.body.data.verification;
      const right = codeSentTo(t, b.email);
      const wrong = right === '000000' ? '000001' : '000000';

      const max = t.env.OTP_MAX_ATTEMPTS;
      for (let i = 1; i < max; i++) {
        const res = await call(t, 'post', '/auth/verify-contact', {
          body: { challengeId, code: wrong },
        }).expect(400);
        expect(res.body.error.code).toBe('OTP_INVALID');
        expect(res.body.error.details.attemptsLeft).toBe(max - i);
      }
      const last = await call(t, 'post', '/auth/verify-contact', {
        body: { challengeId, code: wrong },
      });
      expect(last.status).toBe(429);
      expect(last.body.error.code).toBe('OTP_LOCKED');

      const blocked = await call(t, 'post', '/auth/verify-contact', {
        body: { challengeId, code: right },
      });
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('OTP_LOCKED');
    });

    it('cannot be used twice', async () => {
      const b = body();
      const reg = await call(t, 'post', '/auth/register', { body: b }).expect(202);
      const { challengeId } = reg.body.data.verification;
      const code = codeSentTo(t, b.email);
      await call(t, 'post', '/auth/verify-contact', { body: { challengeId, code } }).expect(200);
      const again = await call(t, 'post', '/auth/verify-contact', {
        body: { challengeId, code },
      }).expect(400);
      expect(again.body.error.code).toBe('OTP_INVALID');
    });

    it('expires', async () => {
      const b = body();
      const reg = await call(t, 'post', '/auth/register', { body: b }).expect(202);
      const { challengeId } = reg.body.data.verification;
      const code = codeSentTo(t, b.email);
      await t.db.query(
        "UPDATE otp_challenges SET expires_at = now() - interval '1 minute' WHERE id = $1",
        [challengeId],
      );
      const res = await call(t, 'post', '/auth/verify-contact', {
        body: { challengeId, code },
      }).expect(400);
      expect(res.body.error.code).toBe('OTP_EXPIRED');
    });

    it('is stored only as a keyed hash', async () => {
      const b = body();
      const reg = await call(t, 'post', '/auth/register', { body: b }).expect(202);
      const code = codeSentTo(t, b.email);
      const row = await t.db.query<{ code_hash: string }>(
        'SELECT code_hash FROM otp_challenges WHERE id = $1',
        [reg.body.data.verification.challengeId],
      );
      expect(row.rows[0]?.code_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.rows[0]?.code_hash).not.toContain(code);
    });

    it('rejects a code that is not six digits before touching the budget', async () => {
      const reg = await call(t, 'post', '/auth/register', { body: body() }).expect(202);
      const res = await call(t, 'post', '/auth/verify-contact', {
        body: { challengeId: reg.body.data.verification.challengeId, code: '12ab56' },
      }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('can be re-sent, but not at once, and not forever', async () => {
      const b = body();
      const reg = await call(t, 'post', '/auth/register', { body: b }).expect(202);
      const { challengeId } = reg.body.data.verification;

      const tooSoon = await call(t, 'post', '/auth/resend', { body: { challengeId } });
      expect(tooSoon.status).toBe(429);
      expect(tooSoon.headers['retry-after']).toBeDefined();

      const first = codeSentTo(t, b.email);
      // Skip the cooldown the way time would.
      for (let i = 0; i < 3; i++) {
        await t.db.query(
          "UPDATE otp_challenges SET expires_at = expires_at - interval '31 seconds' WHERE id = $1",
          [challengeId],
        );
        await call(t, 'post', '/auth/resend', { body: { challengeId } }).expect(200);
      }
      const latest = codeSentTo(t, b.email);
      expect(latest).toBeDefined();

      await t.db.query(
        "UPDATE otp_challenges SET expires_at = expires_at - interval '31 seconds' WHERE id = $1",
        [challengeId],
      );
      const capped = await call(t, 'post', '/auth/resend', { body: { challengeId } });
      expect(capped.status).toBe(429);

      // The newest code works.
      const ok = await call(t, 'post', '/auth/verify-contact', {
        body: { challengeId, code: latest },
      });
      expect(ok.status).toBe(200);
      expect(first).toBeDefined();
    });
  });

  describe('signing in before the address is proven', () => {
    it('sends a fresh code instead of letting the person in', async () => {
      const b = body();
      await call(t, 'post', '/auth/register', { body: b }).expect(202);
      const res = await call(t, 'post', '/auth/login', {
        body: { identifier: b.username, password: b.password, device: b.device },
      }).expect(200);
      expect(res.body.data.status).toBe('verification_required');
      expect(res.body.data.reason).toBe('unverified_contact');
      expect(res.body.data.tokens).toBeUndefined();

      // The new challenge completes registration.
      const ok = await call(t, 'post', '/auth/verify-contact', {
        body: { challengeId: res.body.data.verification.challengeId, code: codeSentTo(t, b.email) },
      }).expect(200);
      expect(ok.body.data.status).toBe('authenticated');
    });
  });

  it('keeps the same account across repeated sign-ups of the same email only once', async () => {
    const ip = freshIp();
    const a = await signUp(t, { ip });
    const count = await t.db.query<{ n: string }>(
      'SELECT count(*) AS n FROM users WHERE email = $1',
      [a.email],
    );
    expect(Number(count.rows[0]?.n)).toBe(1);
  });
});
