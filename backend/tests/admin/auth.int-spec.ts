import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../support/app.js';
import {
  ADMIN_NEW_PASSWORD,
  ADMIN_PASSWORD,
  adminCall,
  insertAdmin,
  provisionAdmin,
  signInAdmin,
  staffSession,
} from '../support/admin.js';
import {
  AUTH_TEST_ENV,
  call,
  freshIp,
  freshName,
  outbox,
  signUp,
  totpNow,
} from '../support/auth.js';

describe('staff sign-in', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ ...AUTH_TEST_ENV });
  });
  afterAll(async () => {
    await t.close();
  });

  const login = (email: string, password: string, ip = freshIp()) =>
    adminCall(t, 'post', '/auth/login', { ip, body: { email, password } });

  describe('the invitation, from first password to full access', () => {
    it('walks through a new password, an authenticator and a code, in that order', async () => {
      const boss = await staffSession(t, ['super_admin']);
      const email = `${freshName('new')}@blocks.test`;

      // 1. invited: a temporary password goes by e-mail, and nowhere else
      const invited = await adminCall(t, 'post', '/staff', {
        token: boss.accessToken,
        body: { email, name: 'Nisha Verma', roleKeys: ['auditor'] },
      }).expect(201);
      expect(invited.body.data).toMatchObject({ email, status: 'INVITED', inviteEmailSent: true });
      const mail = outbox(t).last(email, 'admin_invite');
      const temp = /Temporary password: (\S+)/.exec(mail?.body ?? '')?.[1];
      expect(temp).toBeDefined();
      expect(temp!.length).toBeGreaterThanOrEqual(16);
      // The API response never carries it (the field names are fine; the value is not).
      expect(JSON.stringify(invited.body)).not.toContain(temp!);
      expect(invited.body.data).not.toHaveProperty('temporaryPassword');
      expect(invited.body.data).not.toHaveProperty('passwordHash');
      const audited = await t.db.query<{ after: unknown }>(
        "SELECT after FROM audit_logs WHERE action = 'admin.invited' AND target_id = $1",
        [invited.body.data.id],
      );
      expect(JSON.stringify(audited.rows)).not.toContain(temp!);

      // 2. password: right away they must replace it
      const first = await login(email, temp!).expect(200);
      expect(first.body.data.nextStep).toBe('password_change');
      const token1 = first.body.data.tokens.accessToken as string;
      const blocked = await adminCall(t, 'get', '/roles', { token: token1 }).expect(403);
      expect(blocked.body.error).toMatchObject({
        code: 'ENROLMENT_REQUIRED',
        details: { nextStep: 'password_change' },
      });
      await adminCall(t, 'get', '/auth/me', { token: token1 }).expect(200);

      const weak = await adminCall(t, 'post', '/auth/password/change', {
        token: token1,
        body: { currentPassword: temp, newPassword: 'Short#Pass-1' },
      }).expect(400);
      expect(JSON.stringify(weak.body.error.details)).toContain('too_short');
      await adminCall(t, 'post', '/auth/password/change', {
        token: token1,
        body: { currentPassword: temp, newPassword: temp },
      }).expect(400);

      const changed = await adminCall(t, 'post', '/auth/password/change', {
        token: token1,
        body: { currentPassword: temp, newPassword: ADMIN_NEW_PASSWORD },
      }).expect(200);
      expect(changed.body.data.nextStep).toBe('two_factor_setup');
      const token2 = changed.body.data.tokens.accessToken as string;
      await login(email, temp!).expect(401);

      // 3. authenticator: still nothing privileged until it works
      const stillBlocked = await adminCall(t, 'get', '/roles', { token: token2 }).expect(403);
      expect(stillBlocked.body.error.details.nextStep).toBe('two_factor_setup');
      const setup = await adminCall(t, 'post', '/auth/two-factor/setup', { token: token2 }).expect(
        200,
      );
      expect(setup.body.data.otpauthUri).toContain('otpauth://totp/');

      const wrong = await adminCall(t, 'post', '/auth/two-factor/confirm', {
        token: token2,
        body: { code: '000000' },
      });
      expect(wrong.status).toBe(400);
      expect(wrong.body.error.code).toBe('OTP_INVALID');
      const done = await adminCall(t, 'post', '/auth/two-factor/confirm', {
        token: token2,
        body: { code: totpNow(setup.body.data.secret) },
      }).expect(200);
      expect(done.body.data.nextStep).toBeNull();
      expect(done.body.data.backupCodes).toHaveLength(10);
      expect(done.body.data.admin).toMatchObject({
        status: 'ACTIVE',
        twoFactorEnabled: true,
        mustChangePassword: false,
      });
      await adminCall(t, 'get', '/roles', { token: done.body.data.tokens.accessToken }).expect(200);

      // 4. from now on: password, then a code
      const again = await login(email, ADMIN_NEW_PASSWORD).expect(200);
      expect(again.body.data.nextStep).toBe('two_factor');
      const gated = await adminCall(t, 'get', '/roles', {
        token: again.body.data.tokens.accessToken,
      }).expect(403);
      expect(gated.body.error.details.nextStep).toBe('two_factor');
      const ok = await adminCall(t, 'post', '/auth/login/verify', {
        token: again.body.data.tokens.accessToken,
        body: { method: 'totp', code: totpNow(setup.body.data.secret, 30) },
      }).expect(200);
      expect(ok.body.data.nextStep).toBeNull();
      await adminCall(t, 'get', '/roles', { token: ok.body.data.tokens.accessToken }).expect(200);

      const actions = await t.db.query<{ action: string }>(
        'SELECT action FROM audit_logs WHERE actor_id = $1 ORDER BY created_at',
        [invited.body.data.id],
      );
      expect(actions.rows.map((r) => r.action)).toEqual(
        expect.arrayContaining([
          'admin.password.changed',
          'admin.two_factor.enrolled',
          'admin.login',
        ]),
      );
    });

    it('lets an invitation lapse', async () => {
      const a = await insertAdmin(t, {
        status: 'INVITED',
        mustChangePassword: true,
        inviteExpiresAt: new Date(Date.now() - 60_000),
      });
      const res = await login(a.email, a.password).expect(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      const audit = await t.db.query(
        "SELECT 1 FROM audit_logs WHERE action = 'admin.login.invite_expired' AND actor_id = $1",
        [a.id],
      );
      expect(audit.rowCount).toBe(1);
    });

    it('does not let a still-invited account skip steps by asking for a bigger token', async () => {
      const a = await insertAdmin(t, {
        status: 'INVITED',
        mustChangePassword: true,
        inviteExpiresAt: new Date(Date.now() + 3_600_000),
      });
      const first = await login(a.email, a.password).expect(200);
      const token = first.body.data.tokens.accessToken as string;
      // Trying to enrol before changing the password, or to verify without having 2FA.
      await adminCall(t, 'post', '/auth/two-factor/setup', { token }).expect(403);
      const verify = await adminCall(t, 'post', '/auth/login/verify', {
        token,
        body: { method: 'totp', code: '123456' },
      }).expect(403);
      expect(verify.body.error.code).toBe('ENROLMENT_REQUIRED');
      await adminCall(t, 'get', '/staff', { token }).expect(403);
    });
  });

  describe('wrong details', () => {
    it('answers an unknown account and a wrong password the same way', async () => {
      const a = await provisionAdmin(t, { roleKeys: ['auditor'] });
      const wrong = await login(a.email, 'Wrong#Password-12345').expect(401);
      const unknown = await login(
        `${freshName('ghost')}@blocks.test`,
        'Wrong#Password-12345',
      ).expect(401);
      expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(unknown.body.error.message).toBe(wrong.body.error.message);
      expect(unknown.body.error.details).toEqual(wrong.body.error.details);
    });

    it('pauses sign-in after a few mistakes, for real and invented accounts alike', async () => {
      const max = t.env.AUTH_MAX_FAILED_LOGINS;
      const real = await provisionAdmin(t, { roleKeys: ['auditor'] });
      const ghost = `${freshName('ghost')}@blocks.test`;
      const run = async (email: string) => {
        const out: Array<[number, string]> = [];
        for (let i = 0; i < max; i++) {
          const res = await login(email, 'Wrong#Password-12345');
          out.push([res.status, res.body.error.code]);
        }
        return out;
      };
      expect(await run(real.email)).toEqual(await run(ghost));
      const locked = await login(real.email, real.password).expect(423);
      expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
      const row = await t.db.query<{ locked_until: Date | null }>(
        'SELECT locked_until FROM admin_users WHERE id = $1',
        [real.id],
      );
      expect(row.rows[0]?.locked_until).not.toBeNull();
      const audited = await t.db.query(
        "SELECT 1 FROM audit_logs WHERE action = 'admin.login.locked' AND actor_id = $1",
        [real.id],
      );
      expect(audited.rowCount).toBe(1);
    });

    it('treats a disabled account like an unknown one, even with the right password', async () => {
      const a = await insertAdmin(t, { status: 'DISABLED' });
      const res = await login(a.email, a.password).expect(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      const audited = await t.db.query(
        "SELECT 1 FROM audit_logs WHERE action = 'admin.login.disabled' AND actor_id = $1",
        [a.id],
      );
      expect(audited.rowCount).toBe(1);
    });

    it('does not take e-mail case or surrounding spaces into account', async () => {
      const a = await provisionAdmin(t, { roleKeys: ['auditor'] });
      const res = await login(`  ${a.email.toUpperCase()} `, a.password).expect(200);
      expect(res.body.data.nextStep).toBe('two_factor');
    });

    it('rejects malformed input before looking anyone up', async () => {
      await adminCall(t, 'post', '/auth/login', { body: { email: 'a@b.test' } }).expect(400);
      await adminCall(t, 'post', '/auth/login', {
        body: { email: 'x'.repeat(300), password: 'p' },
      }).expect(400);
      await adminCall(t, 'post', '/auth/login', {
        body: { email: 'a@b.test', password: 'p', extra: 1 },
      }).expect(400);
    });
  });

  describe('the second step', () => {
    it('counts wrong codes, then ends the sign-in so the password is needed again', async () => {
      const a = await provisionAdmin(t, { roleKeys: ['auditor'] });
      const first = await login(a.email, a.password).expect(200);
      const token = first.body.data.tokens.accessToken as string;
      const max = t.env.AUTH_MAX_FAILED_LOGINS;
      for (let i = 1; i < max; i++) {
        const res = await adminCall(t, 'post', '/auth/login/verify', {
          token,
          body: { method: 'totp', code: '000000' },
        }).expect(400);
        expect(res.body.error.code).toBe('OTP_INVALID');
        expect(res.body.error.details.attemptsLeft).toBe(max - i);
      }
      const last = await adminCall(t, 'post', '/auth/login/verify', {
        token,
        body: { method: 'totp', code: '000000' },
      });
      expect(last.status).toBe(423);
      // The half-finished sign-in is gone.
      const gone = await adminCall(t, 'get', '/auth/me', { token }).expect(401);
      expect(gone.body.error.code).toBe('SESSION_REVOKED');
      const audited = await t.db.query(
        "SELECT 1 FROM audit_logs WHERE action = 'admin.two_factor.locked' AND actor_id = $1",
        [a.id],
      );
      expect(audited.rowCount).toBe(1);
    });

    it('accepts an authenticator code once only', async () => {
      const a = await provisionAdmin(t, { roleKeys: ['auditor'] });
      const code = totpNow(a.secret, 30);
      const one = await login(a.email, a.password).expect(200);
      await adminCall(t, 'post', '/auth/login/verify', {
        token: one.body.data.tokens.accessToken,
        body: { method: 'totp', code },
      }).expect(200);
      const two = await login(a.email, a.password).expect(200);
      const replay = await adminCall(t, 'post', '/auth/login/verify', {
        token: two.body.data.tokens.accessToken,
        body: { method: 'totp', code },
      }).expect(400);
      expect(replay.body.error.code).toBe('OTP_INVALID');
    });

    it('accepts a backup code once only', async () => {
      const a = await provisionAdmin(t, { roleKeys: ['auditor'] });
      const code = a.backupCodes[0]!;
      const one = await login(a.email, a.password).expect(200);
      await adminCall(t, 'post', '/auth/login/verify', {
        token: one.body.data.tokens.accessToken,
        body: { method: 'backup_code', code },
      }).expect(200);
      const two = await login(a.email, a.password).expect(200);
      await adminCall(t, 'post', '/auth/login/verify', {
        token: two.body.data.tokens.accessToken,
        body: { method: 'backup_code', code },
      }).expect(400);
    });

    it('cannot be answered twice for one sign-in', async () => {
      const s = await staffSession(t, ['auditor']);
      const res = await adminCall(t, 'post', '/auth/login/verify', {
        token: s.accessToken,
        body: { method: 'totp', code: totpNow(s.admin.secret, 30) },
      }).expect(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('carries a record of how the person proved themselves', async () => {
      const s = await staffSession(t, ['auditor']);
      const payload = JSON.parse(
        Buffer.from(s.accessToken.split('.')[1]!, 'base64url').toString(),
      ) as { amr: string[]; scp: string };
      expect(payload).toMatchObject({ amr: ['pwd', 'mfa'], scp: 'full' });
    });
  });

  describe('sessions', () => {
    it('ends after a period of inactivity', async () => {
      const s = await staffSession(t, ['auditor']);
      await adminCall(t, 'get', '/auth/me', { token: s.accessToken }).expect(200);
      await t.db.query(
        "UPDATE admin_sessions SET idle_expires_at = now() - interval '1 second' WHERE admin_id = $1",
        [s.admin.id],
      );
      const res = await adminCall(t, 'get', '/auth/me', { token: s.accessToken }).expect(401);
      expect(res.body.error.code).toBe('SESSION_EXPIRED');
      const refresh = await adminCall(t, 'post', '/auth/refresh', {
        body: { refreshToken: s.refreshToken },
      }).expect(401);
      expect(refresh.body.error.code).toBe('SESSION_EXPIRED');
    });

    it('keeps going while it is used', async () => {
      const s = await staffSession(t, ['auditor']);
      // The token names its session; the enrolment session of the same account is a different row.
      const sid = (
        JSON.parse(Buffer.from(s.accessToken.split('.')[1]!, 'base64url').toString()) as {
          sid: string;
        }
      ).sid;
      await t.db.query(
        "UPDATE admin_sessions SET last_used_at = now() - interval '5 minutes', idle_expires_at = now() + interval '1 minute' WHERE id = $1",
        [sid],
      );
      await adminCall(t, 'get', '/auth/me', { token: s.accessToken }).expect(200);
      const row = await t.db.query<{ minutes: number }>(
        'SELECT extract(epoch FROM (idle_expires_at - now())) / 60 AS minutes FROM admin_sessions WHERE id = $1',
        [sid],
      );
      expect(Number(row.rows[0]?.minutes)).toBeGreaterThan(t.env.ADMIN_SESSION_IDLE_MINUTES - 1);
    });

    it('ends at the hard time limit however active the person is', async () => {
      const s = await staffSession(t, ['auditor']);
      await t.db.query(
        "UPDATE admin_sessions SET expires_at = now() - interval '1 second' WHERE admin_id = $1",
        [s.admin.id],
      );
      const res = await adminCall(t, 'get', '/auth/me', { token: s.accessToken }).expect(401);
      expect(res.body.error.code).toBe('SESSION_EXPIRED');
    });

    it('never extends beyond that limit', async () => {
      const s = await staffSession(t, ['auditor']);
      const refreshed = await adminCall(t, 'post', '/auth/refresh', {
        body: { refreshToken: s.refreshToken },
      }).expect(200);
      expect(refreshed.body.data.nextStep).toBeNull();
      const row = await t.db.query<{ idle_ok: boolean }>(
        'SELECT idle_expires_at <= expires_at AS idle_ok FROM admin_sessions WHERE admin_id = $1',
        [s.admin.id],
      );
      expect(row.rows[0]?.idle_ok).toBe(true);
    });

    it('stops working at once on sign-out', async () => {
      const s = await staffSession(t, ['auditor']);
      await adminCall(t, 'post', '/auth/logout', { token: s.accessToken }).expect(204);
      const res = await adminCall(t, 'get', '/auth/me', { token: s.accessToken }).expect(401);
      expect(res.body.error.code).toBe('SESSION_REVOKED');
      await adminCall(t, 'post', '/auth/refresh', {
        body: { refreshToken: s.refreshToken },
      }).expect(401);
    });

    it('stops working on the very next request after the account is disabled', async () => {
      const s = await staffSession(t, ['auditor']);
      await adminCall(t, 'get', '/auth/me', { token: s.accessToken }).expect(200);
      await t.db.query("UPDATE admin_users SET status = 'DISABLED' WHERE id = $1", [s.admin.id]);
      const res = await adminCall(t, 'get', '/auth/me', { token: s.accessToken }).expect(401);
      expect(res.body.error.code).toBe('SESSION_REVOKED');
    });

    it('rotates the refresh token and treats a replayed one as theft', async () => {
      const s = await staffSession(t, ['auditor']);
      const next = await adminCall(t, 'post', '/auth/refresh', {
        body: { refreshToken: s.refreshToken },
      }).expect(200);
      await adminCall(t, 'get', '/auth/me', { token: next.body.data.tokens.accessToken }).expect(
        200,
      );
      await t.db.query(
        "UPDATE admin_sessions SET rotated_at = now() - interval '1 minute' WHERE admin_id = $1",
        [s.admin.id],
      );

      const replay = await adminCall(t, 'post', '/auth/refresh', {
        body: { refreshToken: s.refreshToken },
      }).expect(401);
      expect(replay.body.error.code).toBe('SESSION_REVOKED');
      await adminCall(t, 'get', '/auth/me', { token: next.body.data.tokens.accessToken }).expect(
        401,
      );
      const audited = await t.db.query(
        "SELECT 1 FROM audit_logs WHERE action = 'admin.session.reuse_detected' AND target_id = $1",
        [s.admin.id],
      );
      expect(audited.rowCount).toBe(1);
    });

    it('does not hand a half-finished sign-in a refresh that skips the steps', async () => {
      const a = await provisionAdmin(t, { roleKeys: ['auditor'] });
      const first = await login(a.email, a.password).expect(200);
      const refreshed = await adminCall(t, 'post', '/auth/refresh', {
        body: { refreshToken: first.body.data.tokens.refreshToken },
      }).expect(200);
      expect(refreshed.body.data.nextStep).toBe('two_factor');
      await adminCall(t, 'get', '/roles', { token: refreshed.body.data.tokens.accessToken }).expect(
        403,
      );
    });

    it('signs other devices out when the password is changed', async () => {
      const a = await provisionAdmin(t, { roleKeys: ['auditor'] });
      const one = await signInAdmin(t, a);
      const two = await signInAdmin(t, a, { ip: freshIp() });
      await adminCall(t, 'post', '/auth/password/change', {
        token: one.accessToken,
        body: { currentPassword: a.password, newPassword: ADMIN_NEW_PASSWORD },
      }).expect(200);
      await adminCall(t, 'get', '/auth/me', { token: two.accessToken }).expect(401);
    });
  });

  describe('the two realms stay apart', () => {
    it('refuses an app-user token on a staff route, and a staff token on an app route', async () => {
      const user = await signUp(t);
      const staff = await staffSession(t, ['super_admin']);
      await adminCall(t, 'get', '/staff', { token: user.accessToken }).expect(401);
      await call(t, 'get', '/users/me', { token: staff.accessToken }).expect(401);
    });

    it('does not let a staff route be reached without a token', async () => {
      for (const [method, path] of [
        ['get', '/staff'],
        ['get', '/roles'],
        ['get', '/permissions'],
        ['get', '/audit-logs'],
        ['get', '/auth/me'],
        ['post', '/auth/logout'],
        ['post', '/auth/login/verify'],
        ['post', '/auth/password/change'],
      ] as const) {
        const res = await adminCall(t, method, path);
        expect(res.status, `${method} ${path}`).toBe(401);
      }
    });
  });

  it('keeps the temporary-password policy: staff passwords are at least 14 characters', async () => {
    const s = await staffSession(t, ['auditor']);
    const res = await adminCall(t, 'post', '/auth/password/change', {
      token: s.accessToken,
      body: { currentPassword: ADMIN_PASSWORD, newPassword: 'Abcdef#12345' },
    }).expect(400);
    expect(JSON.stringify(res.body.error.details)).toContain('too_short');
  });
});
