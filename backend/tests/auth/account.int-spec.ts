import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountService } from '../../src/account/account.service.js';
import { MaintenanceScheduler } from '../../src/workers/maintenance.scheduler.js';
import { createTestApp, type TestApp } from '../support/app.js';
import {
  AUTH_TEST_ENV,
  call,
  codeSentTo,
  freshIp,
  freshName,
  logIn,
  outbox,
  signUp,
} from '../support/auth.js';

describe('the account: contact details and deletion', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ ...AUTH_TEST_ENV });
  });
  afterAll(async () => {
    await t.close();
  });

  describe('contact details', () => {
    it('shows both, masked, with whether each is verified', async () => {
      const a = await signUp(t);
      const res = await call(t, 'get', '/account/contacts', { token: a.accessToken }).expect(200);
      expect(res.body.data.email).toEqual({
        value: expect.stringContaining('***'),
        verified: true,
      });
      expect(res.body.data.email.value).not.toBe(a.email);
      expect(res.body.data.phone).toBeNull();
    });

    it('does not offer to verify what is verified already, or what is missing', async () => {
      const a = await signUp(t);
      const done = await call(t, 'post', '/account/contacts/verify', {
        token: a.accessToken,
        body: { kind: 'email' },
      }).expect(409);
      expect(done.body.error.code).toBe('CONFLICT');
      const none = await call(t, 'post', '/account/contacts/verify', {
        token: a.accessToken,
        body: { kind: 'phone' },
      }).expect(412);
      expect(none.body.error.code).toBe('PRECONDITION_FAILED');
    });

    describe('changing the e-mail address', () => {
      it('needs the password, then a code sent to the new address, and warns the old one', async () => {
        const a = await signUp(t);
        const newEmail = `${freshName('new')}@example.test`;

        const wrong = await call(t, 'post', '/account/contacts/change', {
          token: a.accessToken,
          body: { kind: 'email', newValue: newEmail, password: 'Not-My-Password1!' },
        }).expect(401);
        expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
        expect(outbox(t).to(newEmail)).toHaveLength(0);

        const start = await call(t, 'post', '/account/contacts/change', {
          token: a.accessToken,
          body: { kind: 'email', newValue: newEmail, password: a.password },
        }).expect(200);
        const { challengeId } = start.body.data.verification;
        // Until the code is entered nothing has changed.
        const mid = await call(t, 'get', '/account/contacts', { token: a.accessToken }).expect(200);
        expect(mid.body.data.email.value).not.toContain('new');

        // A code for the old address would not do.
        const bad = await call(t, 'post', '/account/contacts/change/confirm', {
          token: a.accessToken,
          body: { challengeId, code: '000000' },
        }).expect(400);
        expect(bad.body.error.code).toBe('OTP_INVALID');

        const done = await call(t, 'post', '/account/contacts/change/confirm', {
          token: a.accessToken,
          body: { challengeId, code: codeSentTo(t, newEmail) },
        }).expect(200);
        expect(done.body.data.email.verified).toBe(true);

        // The old address was told, and the new one now signs in.
        expect(
          outbox(t)
            .to(a.email)
            .some((m) => m.template === 'security_contact_changed'),
        ).toBe(true);
        await logIn(t, a, { identifier: newEmail }).expect(200);
        const old = await logIn(t, a, { identifier: a.email }).expect(401);
        expect(old.body.error.code).toBe('INVALID_CREDENTIALS');
        const feed = await call(t, 'get', '/security/events', { token: a.accessToken }).expect(200);
        expect(feed.body.data.map((e: { type: string }) => e.type)).toContain('EMAIL_CHANGED');
      });

      it('can send the code again, always to the new address and never elsewhere', async () => {
        const a = await signUp(t);
        const newEmail = `${freshName('again')}@example.test`;
        const start = await call(t, 'post', '/account/contacts/change', {
          token: a.accessToken,
          body: { kind: 'email', newValue: newEmail, password: a.password },
        }).expect(200);
        const { challengeId } = start.body.data.verification;
        const oldBefore = outbox(t).to(a.email).length;

        await t.db.query(
          "UPDATE otp_challenges SET expires_at = expires_at - interval '31 seconds' WHERE id = $1",
          [challengeId],
        );
        const again = await call(t, 'post', '/auth/resend', { body: { challengeId } }).expect(200);
        expect(again.body.data.challengeId).toBe(challengeId);

        const sent = outbox(t)
          .to(newEmail)
          .filter((m) => m.template === 'otp_contact_change');
        expect(sent).toHaveLength(2);
        expect(outbox(t).to(a.email)).toHaveLength(oldBefore);

        // The newest code is the one that works.
        const done = await call(t, 'post', '/account/contacts/change/confirm', {
          token: a.accessToken,
          body: { challengeId, code: codeSentTo(t, newEmail) },
        }).expect(200);
        expect(done.body.data.email.verified).toBe(true);
      });

      it('answers the same for an address someone else has, and sends them nothing', async () => {
        const a = await signUp(t);
        const other = await signUp(t);
        const before = outbox(t).to(other.email).length;

        const fresh = await call(t, 'post', '/account/contacts/change', {
          token: a.accessToken,
          body: {
            kind: 'email',
            newValue: `${freshName('free')}@example.test`,
            password: a.password,
          },
        }).expect(200);
        const taken = await call(t, 'post', '/account/contacts/change', {
          token: a.accessToken,
          body: { kind: 'email', newValue: other.email, password: a.password },
        }).expect(200);

        expect(Object.keys(taken.body.data.verification).sort()).toEqual(
          Object.keys(fresh.body.data.verification).sort(),
        );
        // Nothing is sent to the owner of that address, and no code can ever work.
        expect(outbox(t).to(other.email)).toHaveLength(before);
        for (const code of ['000000', '123456']) {
          const res = await call(t, 'post', '/account/contacts/change/confirm', {
            token: a.accessToken,
            body: { challengeId: taken.body.data.verification.challengeId, code },
          });
          expect(res.status).toBe(400);
        }
        const still = await call(t, 'get', '/users/me', { token: other.accessToken }).expect(200);
        expect(still.body.data.id).toBe(other.id);
      });

      it('rejects something that is not an address', async () => {
        const a = await signUp(t);
        const res = await call(t, 'post', '/account/contacts/change', {
          token: a.accessToken,
          body: { kind: 'email', newValue: 'nope', password: a.password },
        }).expect(400);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
      });

      it('cannot be confirmed by somebody else’s session', async () => {
        const a = await signUp(t);
        const b = await signUp(t);
        const newEmail = `${freshName('mine')}@example.test`;
        const start = await call(t, 'post', '/account/contacts/change', {
          token: a.accessToken,
          body: { kind: 'email', newValue: newEmail, password: a.password },
        }).expect(200);
        const res = await call(t, 'post', '/account/contacts/change/confirm', {
          token: b.accessToken,
          body: {
            challengeId: start.body.data.verification.challengeId,
            code: codeSentTo(t, newEmail),
          },
        }).expect(400);
        expect(res.body.error.code).toBe('OTP_INVALID');
      });
    });

    describe('adding and verifying a phone number', () => {
      it('takes the number in the usual ways, verifies it, and allows sign-in with it', async () => {
        const a = await signUp(t);
        const start = await call(t, 'post', '/account/contacts/change', {
          token: a.accessToken,
          body: { kind: 'phone', newValue: '98765 01234', password: a.password },
        }).expect(200);
        expect(start.body.data.verification.channel).toBe('SMS');
        const done = await call(t, 'post', '/account/contacts/change/confirm', {
          token: a.accessToken,
          body: {
            challengeId: start.body.data.verification.challengeId,
            code: codeSentTo(t, '+919876501234'),
          },
        }).expect(200);
        expect(done.body.data.phone.verified).toBe(true);
        const phoneLogin = await logIn(t, a, { identifier: '9876501234' }).expect(200);
        expect(phoneLogin.body.data.status).toBe('authenticated');
      });
    });
  });

  describe('deleting the account', () => {
    it('needs the password, ends other devices, schedules for later and tells the owner', async () => {
      const a = await signUp(t);
      const other = await logIn(t, a, { deviceId: 'second-phone-00001', ip: freshIp() }).expect(
        200,
      );

      await call(t, 'post', '/account/deletion/request', {
        token: a.accessToken,
        body: { password: 'Not-My-Password1!' },
      }).expect(401);

      const res = await call(t, 'post', '/account/deletion/request', {
        token: a.accessToken,
        body: { password: a.password },
      }).expect(200);
      expect(res.body.data.pending).toBe(true);
      expect(res.body.data.graceDays).toBe(t.env.ACCOUNT_DELETION_GRACE_DAYS);
      const days = (new Date(res.body.data.scheduledFor).getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(t.env.ACCOUNT_DELETION_GRACE_DAYS - 0.01);
      expect(days).toBeLessThan(t.env.ACCOUNT_DELETION_GRACE_DAYS + 0.01);

      await call(t, 'get', '/users/me', { token: other.body.data.tokens.accessToken }).expect(401);
      const me = await call(t, 'get', '/users/me', { token: a.accessToken }).expect(200);
      expect(me.body.data.status).toBe('PENDING_DELETION');
      const mail = outbox(t)
        .to(a.email)
        .find((m) => m.template === 'security_deletion_scheduled');
      expect(mail?.body).toContain('Keep my account');
    });

    it('can be requested twice without moving the date', async () => {
      const a = await signUp(t);
      const one = await call(t, 'post', '/account/deletion/request', {
        token: a.accessToken,
        body: { password: a.password },
      }).expect(200);
      const two = await call(t, 'post', '/account/deletion/request', {
        token: a.accessToken,
        body: { password: a.password },
      }).expect(200);
      expect(two.body.data.scheduledFor).toBe(one.body.data.scheduledFor);
    });

    it('is undone only by an explicit cancel, not by signing in', async () => {
      const a = await signUp(t);
      await call(t, 'post', '/account/deletion/request', {
        token: a.accessToken,
        body: { password: a.password },
      }).expect(200);

      const login = await logIn(t, a).expect(200);
      expect(login.body.data.user.status).toBe('PENDING_DELETION');
      const still = await call(t, 'get', '/account/deletion', {
        token: login.body.data.tokens.accessToken,
      }).expect(200);
      expect(still.body.data.pending).toBe(true);

      const cancelled = await call(t, 'post', '/account/deletion/cancel', {
        token: login.body.data.tokens.accessToken,
      }).expect(200);
      expect(cancelled.body.data).toMatchObject({ pending: false, scheduledFor: null });
      const me = await call(t, 'get', '/users/me', {
        token: login.body.data.tokens.accessToken,
      }).expect(200);
      expect(me.body.data.status).toBe('ACTIVE');
      expect(
        outbox(t)
          .to(a.email)
          .some((m) => m.template === 'security_deletion_cancelled'),
      ).toBe(true);
    });

    it('erases personal data when the grace period ends, keeping the row that records point at', async () => {
      const a = await signUp(t);
      await call(t, 'post', '/account/deletion/request', {
        token: a.accessToken,
        body: { password: a.password },
      }).expect(200);

      // Not yet due: nothing happens.
      const accounts = t.app.get(AccountService, { strict: false });
      expect(await accounts.eraseDue()).toBe(0);
      expect(
        (await t.db.query('SELECT 1 FROM users WHERE id = $1 AND email IS NOT NULL', [a.id]))
          .rowCount,
      ).toBe(1);

      await t.db.query(
        "UPDATE users SET deletion_scheduled_for = now() - interval '1 minute' WHERE id = $1",
        [a.id],
      );
      expect(await accounts.eraseDue()).toBe(1);

      const user = await t.db.query<Record<string, unknown>>(
        'SELECT username, email, phone, password_hash, status, deleted_at, two_factor_enabled FROM users WHERE id = $1',
        [a.id],
      );
      expect(user.rows[0]).toMatchObject({
        email: null,
        phone: null,
        status: 'DELETED',
        two_factor_enabled: false,
      });
      expect(String(user.rows[0]?.['username'])).toMatch(/^deleted_[0-9a-f]{12}$/);
      expect(String(user.rows[0]?.['password_hash'])).toMatch(/^erased:/);
      expect(user.rows[0]?.['deleted_at']).not.toBeNull();

      const profile = await t.db.query<Record<string, unknown>>(
        'SELECT display_name, bio, date_of_birth, state, is_private FROM profiles WHERE user_id = $1',
        [a.id],
      );
      expect(profile.rows[0]).toMatchObject({
        display_name: 'Deleted user',
        bio: null,
        date_of_birth: null,
        state: null,
        is_private: true,
      });

      const left = await t.db.query<{ n: string }>(
        'SELECT (SELECT count(*) FROM otp_challenges WHERE user_id = $1) + (SELECT count(*) FROM notifications WHERE user_id = $1) AS n',
        [a.id],
      );
      expect(Number(left.rows[0]?.n)).toBe(0);

      // Every way in is closed…
      await call(t, 'get', '/users/me', { token: a.accessToken }).expect(401);
      await logIn(t, a).expect(401);
      // …and the name and address are free to be used again.
      const again = await signUp(t, { username: a.username, email: a.email });
      expect(again.id).not.toBe(a.id);
    });

    it('is run by the maintenance scheduler, whose other tasks also run cleanly', async () => {
      expect(t.env.workersEnabled).toBe(false); // timers stay off under test; tasks are driven by hand
      const scheduler = t.app.get(MaintenanceScheduler, { strict: false });
      const names = scheduler.tasks().map((x) => x.name);
      expect(names).toEqual(
        expect.arrayContaining([
          'retry-deliveries',
          'purge-codes',
          'purge-sessions',
          'erase-accounts',
          'expire-uploads',
          'purge-originals',
          'recompute-trending',
        ]),
      );
      for (const task of scheduler.tasks()) {
        const result = await task.run();
        expect(typeof result).toBe('number');
      }
    });
  });
});
