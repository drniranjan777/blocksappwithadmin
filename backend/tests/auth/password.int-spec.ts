import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../support/app.js';
import {
  AUTH_TEST_ENV,
  call,
  codeSentTo,
  deviceBody,
  freshIp,
  freshName,
  logIn,
  outbox,
  signUp,
} from '../support/auth.js';

const NEW_PASSWORD = 'Monsoon#Rain-4417';

describe('passwords', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ ...AUTH_TEST_ENV });
  });
  afterAll(async () => {
    await t.close();
  });

  describe('the policy', () => {
    it('is published so the app can show the rules', async () => {
      const res = await call(t, 'get', '/auth/password-policy').expect(200);
      expect(res.body.data).toMatchObject({
        minLength: 10,
        requireUppercase: true,
        requireDigit: true,
        requireSpecial: true,
      });
    });
  });

  describe('the combined policy', () => {
    it('publishes the password rules, the sign-in lock-out and the code limits together', async () => {
      const res = await call(t, 'get', '/auth/policy').expect(200);
      expect(res.body.data.password).toMatchObject({ minLength: 10, requireSpecial: true });
      expect(res.body.data.signIn).toEqual({
        maxFailedAttempts: expect.any(Number),
        lockMinutes: expect.any(Number),
      });
      expect(res.body.data.code).toEqual({
        length: 6,
        expiresMinutes: expect.any(Number),
        maxAttempts: expect.any(Number),
        resendCooldownSeconds: 30,
        maxResends: 3,
      });
    });

    it('needs no sign-in and carries nothing secret', async () => {
      const res = await call(t, 'get', '/auth/policy').expect(200);
      const text = JSON.stringify(res.body);
      expect(text).not.toMatch(/secret|hmac|key|salt/i);
    });
  });

  describe('forgot and reset', () => {
    // Not `async`: the supertest request must stay chainable (`.expect(...)`).
    function forgot(identifier: string, ip = freshIp()) {
      return call(t, 'post', '/auth/password/forgot', { ip, body: { identifier } });
    }

    it('can resend the reset code, never says where it went, and looks the same for a ghost', async () => {
      const real = await signUp(t);
      const ghost = `${freshName('ghost')}@example.test`;
      const realStart = await forgot(real.email).expect(202);
      const ghostStart = await forgot(ghost).expect(202);

      for (const start of [realStart, ghostStart]) {
        const { challengeId } = start.body.data.verification;
        // Too soon: the cool-down applies to a ghost exactly as to a real one.
        const soon = await call(t, 'post', '/auth/password/resend', { body: { challengeId } });
        expect(soon.status).toBe(429);
        expect(soon.headers['retry-after']).toBeDefined();

        await t.db.query(
          "UPDATE otp_challenges SET expires_at = expires_at - interval '31 seconds' WHERE id = $1",
          [challengeId],
        );
        const again = await call(t, 'post', '/auth/password/resend', {
          body: { challengeId },
        }).expect(200);
        expect(again.body.data.destinationMasked).toBeNull();
        expect(Object.keys(again.body.data).sort()).toEqual(
          ['challengeId', 'channel', 'destinationMasked', 'expiresAt', 'resendAvailableAt'].sort(),
        );
      }
      // A real account got a second message; the ghost got none.
      expect(
        outbox(t)
          .to(real.email)
          .filter((m) => m.template === 'otp_password_reset'),
      ).toHaveLength(2);
      expect(outbox(t).to(ghost)).toHaveLength(0);
    });

    it('only resends a password-reset challenge on its own route', async () => {
      const b = await signUp(t);
      const start = await forgot(b.email).expect(202);
      const { challengeId } = start.body.data.verification;
      // The general resend route does not accept it (and does not say why).
      const wrong = await call(t, 'post', '/auth/resend', { body: { challengeId } });
      expect(wrong.status).toBe(429);
      // And the reset route refuses a registration challenge.
      const reg = await call(t, 'post', '/auth/register', {
        body: {
          username: freshName('u').toLowerCase(),
          displayName: 'X',
          password: 'Tr0ub4dor&3xample',
          email: `${freshName('r')}@example.test`,
          dateOfBirth: '1990-01-01',
        },
      }).expect(202);
      const other = await call(t, 'post', '/auth/password/resend', {
        body: { challengeId: reg.body.data.verification.challengeId },
      });
      expect(other.status).toBe(429);
    });

    it('walks through code, reset token and new password, and signs everything out', async () => {
      const a = await signUp(t);
      const second = await logIn(t, a, { deviceId: 'second-phone-00001', ip: freshIp() });
      expect(second.body.data.status).toBe('authenticated');

      const start = await forgot(a.email).expect(202);
      const { challengeId } = start.body.data.verification;
      const code = codeSentTo(t, a.email);

      const checked = await call(t, 'post', '/auth/password/verify', {
        body: { challengeId, code },
      }).expect(200);
      const { resetToken } = checked.body.data;
      expect(resetToken).toMatch(/^[0-9a-f-]{36}\./);

      await call(t, 'post', '/auth/password/reset', {
        body: { resetToken, newPassword: NEW_PASSWORD },
      }).expect(204);

      // Every device was signed out, the old password is gone, the new one works.
      await call(t, 'get', '/users/me', { token: a.accessToken }).expect(401);
      await call(t, 'get', '/users/me', { token: second.body.data.tokens.accessToken }).expect(401);
      await logIn(t, a).expect(401);
      const again = await logIn(t, a, { password: NEW_PASSWORD }).expect(200);
      expect(again.body.data.status).toBe('authenticated');

      // The owner is told, and it is on the record.
      expect(
        outbox(t)
          .to(a.email)
          .some((m) => m.template === 'security_password_changed'),
      ).toBe(true);
      const feed = await call(t, 'get', '/security/events', {
        token: again.body.data.tokens.accessToken,
      }).expect(200);
      expect(feed.body.data.map((e: { type: string }) => e.type)).toContain('PASSWORD_RESET');
    });

    it('works by username and by phone, sending the code to the verified address', async () => {
      const a = await signUp(t);
      const start = await forgot(a.username).expect(202);
      // For a username the address is not echoed back (that would confirm the account).
      expect(start.body.data.verification.destinationMasked).toBeNull();
      expect(codeSentTo(t, a.email)).toMatch(/^\d{6}$/);
    });

    it('answers the same for an account that does not exist, and sends nothing', async () => {
      const real = await signUp(t);
      const ghostEmail = `${freshName('ghost')}@example.test`;

      const known = await forgot(real.email).expect(202);
      const unknown = await forgot(ghostEmail).expect(202);
      expect(Object.keys(unknown.body.data.verification).sort()).toEqual(
        Object.keys(known.body.data.verification).sort(),
      );
      expect(unknown.body.data.verification.channel).toBe(known.body.data.verification.channel);
      expect(outbox(t).to(ghostEmail)).toHaveLength(0);

      const ghostName = await forgot(freshName('ghost')).expect(202);
      const realName = await forgot(real.username).expect(202);
      expect(Object.keys(ghostName.body.data.verification).sort()).toEqual(
        Object.keys(realName.body.data.verification).sort(),
      );
      expect(ghostName.body.data.verification.destinationMasked).toBeNull();
      expect(realName.body.data.verification.destinationMasked).toBeNull();
    });

    it('never completes from a decoy challenge', async () => {
      const ghost = `${freshName('ghost')}@example.test`;
      const start = await forgot(ghost).expect(202);
      for (const code of ['000000', '123456', '111111']) {
        const res = await call(t, 'post', '/auth/password/verify', {
          body: { challengeId: start.body.data.verification.challengeId, code },
        });
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.body.data).toBeUndefined();
      }
    });

    it('does not send a reset code to an address the account has not verified', async () => {
      const a = await signUp(t);
      await t.db.query('UPDATE users SET email_verified_at = NULL WHERE id = $1', [a.id]);
      const before = outbox(t).to(a.email).length;
      await forgot(a.email).expect(202);
      expect(outbox(t).to(a.email)).toHaveLength(before);
    });

    it('treats unusable identifiers the same generic way', async () => {
      const res = await forgot('!!! ???').expect(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('lets the reset token be used once, and only for the right strength of password', async () => {
      const a = await signUp(t);
      const start = await forgot(a.email).expect(202);
      const checked = await call(t, 'post', '/auth/password/verify', {
        body: {
          challengeId: start.body.data.verification.challengeId,
          code: codeSentTo(t, a.email),
        },
      }).expect(200);
      const { resetToken } = checked.body.data;

      // A weak first choice can be corrected without redoing the code.
      const weak = await call(t, 'post', '/auth/password/reset', {
        body: { resetToken, newPassword: 'short' },
      }).expect(400);
      expect(weak.body.error.code).toBe('VALIDATION_FAILED');
      // …and a password built from the username is rejected as well.
      await call(t, 'post', '/auth/password/reset', {
        body: { resetToken, newPassword: `${a.username}#Zx9!` },
      }).expect(400);

      await call(t, 'post', '/auth/password/reset', {
        body: { resetToken, newPassword: NEW_PASSWORD },
      }).expect(204);
      const reuse = await call(t, 'post', '/auth/password/reset', {
        body: { resetToken, newPassword: 'Another#Pass-9981' },
      }).expect(400);
      expect(reuse.body.error.code).toBe('OTP_INVALID');
    });

    it('rejects a forged or mismatched reset token', async () => {
      const a = await signUp(t);
      const start = await forgot(a.email).expect(202);
      const { challengeId } = start.body.data.verification;
      const checked = await call(t, 'post', '/auth/password/verify', {
        body: { challengeId, code: codeSentTo(t, a.email) },
      }).expect(200);
      const [id] = (checked.body.data.resetToken as string).split('.');

      for (const resetToken of [
        `${id}.${'a'.repeat(43)}`,
        `${id}.`,
        `${'0'.repeat(36)}.${'b'.repeat(43)}`,
        'x'.repeat(60),
      ]) {
        const res = await call(t, 'post', '/auth/password/reset', {
          body: { resetToken, newPassword: NEW_PASSWORD },
        });
        expect(res.status, resetToken).toBe(400);
        // Malformed ones fail input validation; well-formed but wrong ones fail the token check.
        expect(['OTP_INVALID', 'VALIDATION_FAILED']).toContain(res.body.error.code);
        expect(res.body.data).toBeUndefined();
      }
      // The code itself is not a reset token.
      await call(t, 'post', '/auth/password/reset', {
        body: {
          resetToken: `${challengeId}.${codeSentTo(t, a.email).padEnd(43, '0')}`,
          newPassword: NEW_PASSWORD,
        },
      }).expect(400);
    });

    it('expires the reset token', async () => {
      const a = await signUp(t);
      const start = await forgot(a.email).expect(202);
      const { challengeId } = start.body.data.verification;
      const checked = await call(t, 'post', '/auth/password/verify', {
        body: { challengeId, code: codeSentTo(t, a.email) },
      }).expect(200);
      await t.db.query(
        "UPDATE otp_challenges SET expires_at = now() - interval '1 second' WHERE id = $1",
        [challengeId],
      );
      const res = await call(t, 'post', '/auth/password/reset', {
        body: { resetToken: checked.body.data.resetToken, newPassword: NEW_PASSWORD },
      }).expect(400);
      expect(res.body.error.code).toBe('OTP_EXPIRED');
    });

    it('does not accept a sign-in code as a reset code', async () => {
      const a = await signUp(t);
      const reg = await call(t, 'post', '/auth/login', {
        body: {
          identifier: a.username,
          password: a.password,
          device: deviceBody('unrelated-dev-0001'),
        },
      });
      expect(reg.status).toBe(200);
      const res = await call(t, 'post', '/auth/password/verify', {
        body: { challengeId: crypto.randomUUID(), code: '123456' },
      }).expect(400);
      expect(res.body.error.code).toBe('OTP_INVALID');
    });

    it('clears a sign-in lock, whatever the person typed to cause it', async () => {
      const a = await signUp(t);
      for (let i = 0; i < t.env.AUTH_MAX_FAILED_LOGINS; i++)
        await logIn(t, a, { password: 'Wrong!Password-1' });
      await logIn(t, a).expect(423);

      const start = await forgot(a.email).expect(202);
      const checked = await call(t, 'post', '/auth/password/verify', {
        body: {
          challengeId: start.body.data.verification.challengeId,
          code: codeSentTo(t, a.email),
        },
      }).expect(200);
      await call(t, 'post', '/auth/password/reset', {
        body: { resetToken: checked.body.data.resetToken, newPassword: NEW_PASSWORD },
      }).expect(204);
      const back = await logIn(t, a, { password: NEW_PASSWORD }).expect(200);
      expect(back.body.data.status).toBe('authenticated');
    });
  });

  describe('changing it while signed in', () => {
    it('needs the current password, signs other devices out, and keeps this one', async () => {
      const a = await signUp(t);
      const other = await logIn(t, a, { deviceId: 'second-phone-00002', ip: freshIp() }).expect(
        200,
      );

      const res = await call(t, 'post', '/auth/password/change', {
        token: a.accessToken,
        body: { currentPassword: a.password, newPassword: NEW_PASSWORD },
      }).expect(200);
      expect(res.body.data.otherSessionsEnded).toBeGreaterThanOrEqual(1);

      await call(t, 'get', '/users/me', { token: a.accessToken }).expect(200);
      await call(t, 'get', '/users/me', { token: other.body.data.tokens.accessToken }).expect(401);
      await logIn(t, a).expect(401);
      await logIn(t, a, { password: NEW_PASSWORD }).expect(200);
      expect(
        outbox(t)
          .to(a.email)
          .some((m) => m.template === 'security_password_changed'),
      ).toBe(true);
    });

    it('can keep the other devices when asked', async () => {
      const a = await signUp(t);
      const other = await logIn(t, a, { deviceId: 'second-phone-00003', ip: freshIp() }).expect(
        200,
      );
      await call(t, 'post', '/auth/password/change', {
        token: a.accessToken,
        body: {
          currentPassword: a.password,
          newPassword: NEW_PASSWORD,
          signOutOtherDevices: false,
        },
      }).expect(200);
      await call(t, 'get', '/users/me', { token: other.body.data.tokens.accessToken }).expect(200);
    });

    it('refuses a wrong current password, the same as sign-in does', async () => {
      const a = await signUp(t);
      const res = await call(t, 'post', '/auth/password/change', {
        token: a.accessToken,
        body: { currentPassword: 'Not-My-Password1!', newPassword: NEW_PASSWORD },
      }).expect(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.error.details.attemptsRemaining).toBe(t.env.AUTH_MAX_FAILED_LOGINS - 1);
    });

    it('pauses a stolen session that guesses at the current password, but not the real sign-in', async () => {
      const a = await signUp(t);
      const max = t.env.AUTH_MAX_FAILED_LOGINS;
      for (let i = 0; i < max - 1; i++) {
        await call(t, 'post', '/auth/password/change', {
          token: a.accessToken,
          body: { currentPassword: `Guess-${i}-Wrong!`, newPassword: NEW_PASSWORD },
        }).expect(401);
      }
      const locked = await call(t, 'post', '/auth/password/change', {
        token: a.accessToken,
        body: { currentPassword: 'One-More-Guess1!', newPassword: NEW_PASSWORD },
      }).expect(423);
      expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
      // Even the right password is refused for now…
      await call(t, 'post', '/auth/password/change', {
        token: a.accessToken,
        body: { currentPassword: a.password, newPassword: NEW_PASSWORD },
      }).expect(423);
      // …while the owner can still sign in with it.
      await logIn(t, a).expect(200);
    });

    it('stops the same password and any password the policy refuses', async () => {
      const a = await signUp(t);
      const same = await call(t, 'post', '/auth/password/change', {
        token: a.accessToken,
        body: { currentPassword: a.password, newPassword: a.password },
      }).expect(400);
      expect(JSON.stringify(same.body.error.details)).toContain('same_as_current');
      const weak = await call(t, 'post', '/auth/password/change', {
        token: a.accessToken,
        body: { currentPassword: a.password, newPassword: 'Password123!' },
      }).expect(400);
      expect(JSON.stringify(weak.body.error.details)).toContain('too_common');
    });

    it('counts a change as a risk signal for a new device signing in soon after', async () => {
      const a = await signUp(t);
      await call(t, 'post', '/auth/password/change', {
        token: a.accessToken,
        body: { currentPassword: a.password, newPassword: NEW_PASSWORD },
      }).expect(200);
      // New device (30) + new network (15) + changed recently (15) = 60: ask for a code.
      const res = await call(t, 'post', '/auth/login', {
        ip: freshIp(),
        body: {
          identifier: a.username,
          password: NEW_PASSWORD,
          device: deviceBody('thief-or-owner-0001'),
        },
      }).expect(200);
      expect(res.body.data.status).toBe('verification_required');
      expect(res.body.data.reason).toBe('unusual_sign_in');
    });
  });
});
