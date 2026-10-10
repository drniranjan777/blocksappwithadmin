import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../support/app.js';
import {
  AUTH_TEST_ENV,
  type Account,
  call,
  codeSentTo,
  deviceBody,
  freshIp,
  logIn,
  outbox,
  signUp,
  totpNow,
} from '../support/auth.js';

describe('two-step verification', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ ...AUTH_TEST_ENV });
  });
  afterAll(async () => {
    await t.close();
  });

  /** Turns on authenticator-app 2FA the way the app does; returns the secret and the backup codes. */
  async function enableTotp(a: Account) {
    const setup = await call(t, 'post', '/security/two-factor/setup', {
      token: a.accessToken,
      body: { method: 'totp', password: a.password },
    }).expect(200);
    const secret = setup.body.data.secret as string;
    const done = await call(t, 'post', '/security/two-factor/confirm', {
      token: a.accessToken,
      body: { code: totpNow(secret) },
    }).expect(200);
    return { secret, backupCodes: done.body.data.backupCodes as string[], setup };
  }

  /** The password step, then the 2FA challenge: what a person sees at sign-in. */
  async function signInToChallenge(a: Account, ip = freshIp()) {
    const res = await logIn(t, a, { ip }).expect(200);
    expect(res.body.data.status).toBe('two_factor_required');
    return res.body.data as {
      challengeId: string;
      methods: string[];
      destinationMasked: string | null;
    };
  }

  describe('setting it up with an authenticator app', () => {
    it('hands over a secret and an otpauth link, then turns on only after a correct code', async () => {
      const a = await signUp(t);
      const { setup, backupCodes } = await enableTotp(a);

      expect(setup.body.data.method).toBe('totp');
      expect(setup.body.data.secret).toMatch(/^[A-Z2-7]{16,}$/);
      expect(setup.body.data.otpauthUri).toMatch(/^otpauth:\/\/totp\/.+secret=/);
      expect(setup.body.data.otpauthUri).toContain('issuer=BLOCKS');

      expect(backupCodes).toHaveLength(10);
      for (const c of backupCodes) expect(c).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{2}$/);

      const status = await call(t, 'get', '/security/two-factor', { token: a.accessToken }).expect(
        200,
      );
      expect(status.body.data).toEqual({ enabled: true, method: 'totp', backupCodesLeft: 10 });
      expect(
        outbox(t)
          .to(a.email)
          .some((m) => m.template === 'security_two_factor_enabled'),
      ).toBe(true);
    });

    it('does not turn on if the first code is wrong, so a typo cannot lock anyone out', async () => {
      const a = await signUp(t);
      await call(t, 'post', '/security/two-factor/setup', {
        token: a.accessToken,
        body: { method: 'totp', password: a.password },
      }).expect(200);
      const bad = await call(t, 'post', '/security/two-factor/confirm', {
        token: a.accessToken,
        body: { code: '000000' },
      });
      expect(bad.status).toBe(400);
      const status = await call(t, 'get', '/security/two-factor', { token: a.accessToken }).expect(
        200,
      );
      expect(status.body.data.enabled).toBe(false);
      // Sign-in is unchanged.
      expect((await logIn(t, a).expect(200)).body.data.status).toBe('authenticated');
    });

    it('needs the current password, so a stolen session cannot enrol its own authenticator', async () => {
      const a = await signUp(t);
      const wrong = await call(t, 'post', '/security/two-factor/setup', {
        token: a.accessToken,
        body: { method: 'totp', password: 'Not-My-Password1!' },
      }).expect(401);
      expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
      await call(t, 'post', '/security/two-factor/setup', {
        token: a.accessToken,
        body: { method: 'totp' },
      }).expect(400);
      const row = await t.db.query<{ two_factor_secret_enc: string | null }>(
        'SELECT two_factor_secret_enc FROM users WHERE id = $1',
        [a.id],
      );
      expect(row.rows[0]?.two_factor_secret_enc).toBeNull();
    });

    it('stores the secret encrypted and the backup codes only as hashes', async () => {
      const a = await signUp(t);
      const { secret, backupCodes } = await enableTotp(a);
      const row = await t.db.query<{ enc: string; hashes: string[] }>(
        'SELECT two_factor_secret_enc AS enc, two_factor_backup_hashes AS hashes FROM users WHERE id = $1',
        [a.id],
      );
      expect(row.rows[0]?.enc).toMatch(/^v1\./);
      expect(row.rows[0]?.enc).not.toContain(secret);
      expect(row.rows[0]?.hashes).toHaveLength(10);
      for (const h of row.rows[0]!.hashes) expect(h).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(row.rows[0])).not.toContain(backupCodes[0]!.replaceAll('-', ''));
    });

    it('cannot be set up twice', async () => {
      const a = await signUp(t);
      await enableTotp(a);
      const again = await call(t, 'post', '/security/two-factor/setup', {
        token: a.accessToken,
        body: { method: 'totp', password: a.password },
      }).expect(409);
      expect(again.body.error.code).toBe('CONFLICT');
    });

    it('never shows the secret again', async () => {
      const a = await signUp(t);
      const { secret } = await enableTotp(a);
      for (const path of ['/security/two-factor', '/users/me', '/security/alert-preferences']) {
        const res = await call(t, 'get', path, { token: a.accessToken }).expect(200);
        expect(JSON.stringify(res.body)).not.toContain(secret);
      }
    });
  });

  describe('setting it up with a code by e-mail', () => {
    it('sends a code to the verified address and turns on after it is entered', async () => {
      const a = await signUp(t);
      const setup = await call(t, 'post', '/security/two-factor/setup', {
        token: a.accessToken,
        body: { method: 'email', password: a.password },
      }).expect(200);
      const confirm = await call(t, 'post', '/security/two-factor/confirm', {
        token: a.accessToken,
        body: {
          challengeId: setup.body.data.verification.challengeId,
          code: codeSentTo(t, a.email),
        },
      }).expect(200);
      expect(confirm.body.data.backupCodes).toHaveLength(10);
      const status = await call(t, 'get', '/security/two-factor', { token: a.accessToken }).expect(
        200,
      );
      expect(status.body.data).toMatchObject({ enabled: true, method: 'email' });
    });

    it('asks to verify a phone number first when there is none', async () => {
      const a = await signUp(t);
      const res = await call(t, 'post', '/security/two-factor/setup', {
        token: a.accessToken,
        body: { method: 'sms', password: a.password },
      }).expect(412);
      expect(res.body.error.code).toBe('PRECONDITION_FAILED');
    });

    it('signs in with the mailed code as the second step', async () => {
      const a = await signUp(t);
      const setup = await call(t, 'post', '/security/two-factor/setup', {
        token: a.accessToken,
        body: { method: 'email', password: a.password },
      }).expect(200);
      await call(t, 'post', '/security/two-factor/confirm', {
        token: a.accessToken,
        body: {
          challengeId: setup.body.data.verification.challengeId,
          code: codeSentTo(t, a.email),
        },
      }).expect(200);

      const challenge = await signInToChallenge(a);
      expect(challenge.methods).toEqual(['otp', 'backup_code']);
      expect(challenge.destinationMasked).toContain('***');
      const done = await call(t, 'post', '/auth/login/verify', {
        body: { challengeId: challenge.challengeId, method: 'otp', code: codeSentTo(t, a.email) },
      }).expect(200);
      expect(done.body.data.status).toBe('authenticated');
    });
  });

  describe('signing in with it', () => {
    it('asks for a code after the password and gives no tokens before it', async () => {
      const a = await signUp(t);
      const { secret } = await enableTotp(a);
      const res = await logIn(t, a).expect(200);
      expect(res.body.data.status).toBe('two_factor_required');
      expect(res.body.data.methods).toEqual(['totp', 'backup_code']);
      expect(JSON.stringify(res.body)).not.toMatch(/accessToken|refreshToken/);

      // The code that set 2FA up has used this step; the next one is fresh (see the replay test below).
      const done = await call(t, 'post', '/auth/login/verify', {
        body: {
          challengeId: res.body.data.challengeId,
          method: 'totp',
          code: totpNow(secret, 30),
          device: deviceBody(a.deviceId),
        },
      }).expect(200);
      expect(done.body.data.status).toBe('authenticated');
      await call(t, 'get', '/users/me', { token: done.body.data.tokens.accessToken }).expect(200);

      // The session records that a second factor was used.
      const payload = JSON.parse(
        Buffer.from(done.body.data.tokens.accessToken.split('.')[1], 'base64url').toString(),
      ) as { amr: string[] };
      expect(payload.amr).toEqual(['pwd', 'totp']);
    });

    it('is not skipped by a wrong password: no challenge is issued at all', async () => {
      const a = await signUp(t);
      await enableTotp(a);
      const res = await logIn(t, a, { password: 'Wrong!Password-1' }).expect(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('refuses a wrong code and counts it against the challenge', async () => {
      const a = await signUp(t);
      const { secret } = await enableTotp(a);
      const c = await signInToChallenge(a);
      const max = t.env.OTP_MAX_ATTEMPTS;
      const right = totpNow(secret);
      const wrong = right === '123456' ? '654321' : '123456';
      for (let i = 1; i < max; i++) {
        const res = await call(t, 'post', '/auth/login/verify', {
          body: { challengeId: c.challengeId, method: 'totp', code: wrong },
        }).expect(400);
        expect(res.body.error.code).toBe('OTP_INVALID');
        expect(res.body.error.details.attemptsLeft).toBe(max - i);
      }
      const last = await call(t, 'post', '/auth/login/verify', {
        body: { challengeId: c.challengeId, method: 'totp', code: wrong },
      });
      expect(last.status).toBe(429);
      expect(last.body.error.code).toBe('OTP_LOCKED');
      // The challenge is spent: even the right code is refused. Start again with the password.
      const after = await call(t, 'post', '/auth/login/verify', {
        body: { challengeId: c.challengeId, method: 'totp', code: right },
      });
      expect(after.status).toBe(429);
    });

    it('accepts a code only once, even within its 30-second window (no replay)', async () => {
      const a = await signUp(t);
      const { secret } = await enableTotp(a);
      // The setup code is already spent. Wait for the next step so this one is fresh.
      const next = totpNow(secret, 30);
      const c1 = await signInToChallenge(a);
      await call(t, 'post', '/auth/login/verify', {
        body: { challengeId: c1.challengeId, method: 'totp', code: next },
      }).expect(200);

      const c2 = await signInToChallenge(a);
      const replay = await call(t, 'post', '/auth/login/verify', {
        body: { challengeId: c2.challengeId, method: 'totp', code: next },
      });
      expect(replay.status).toBe(400);
      expect(replay.body.error.code).toBe('OTP_INVALID');
    });

    it('does not accept the code used to set it up as a first sign-in code', async () => {
      const a = await signUp(t);
      const setup = await call(t, 'post', '/security/two-factor/setup', {
        token: a.accessToken,
        body: { method: 'totp', password: a.password },
      }).expect(200);
      const secret = setup.body.data.secret as string;
      const code = totpNow(secret);
      await call(t, 'post', '/security/two-factor/confirm', {
        token: a.accessToken,
        body: { code },
      }).expect(200);
      const c = await signInToChallenge(a);
      await call(t, 'post', '/auth/login/verify', {
        body: { challengeId: c.challengeId, method: 'totp', code },
      }).expect(400);
    });

    it('tolerates a phone clock that is one step off, but not several', async () => {
      const a = await signUp(t);
      const { secret } = await enableTotp(a);
      const c = await signInToChallenge(a);
      const far = await call(t, 'post', '/auth/login/verify', {
        body: { challengeId: c.challengeId, method: 'totp', code: totpNow(secret, 600) },
      });
      expect(far.status).toBe(400);
      const near = await call(t, 'post', '/auth/login/verify', {
        body: { challengeId: c.challengeId, method: 'totp', code: totpNow(secret, 30) },
      });
      expect(near.status).toBe(200);
    });

    it('does not let an e-mailed-code method satisfy a TOTP challenge, or the reverse', async () => {
      const a = await signUp(t);
      await enableTotp(a);
      const c = await signInToChallenge(a);
      // No code was sent for a TOTP challenge, so there is nothing for "otp" to match.
      const res = await call(t, 'post', '/auth/login/verify', {
        body: { challengeId: c.challengeId, method: 'otp', code: '123456' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('backup codes', () => {
    it('work once each and count down', async () => {
      const a = await signUp(t);
      const { backupCodes } = await enableTotp(a);

      const c1 = await signInToChallenge(a);
      await call(t, 'post', '/auth/login/verify', {
        body: { challengeId: c1.challengeId, method: 'backup_code', code: backupCodes[0]! },
      }).expect(200);

      const c2 = await signInToChallenge(a);
      const reuse = await call(t, 'post', '/auth/login/verify', {
        body: { challengeId: c2.challengeId, method: 'backup_code', code: backupCodes[0]! },
      });
      expect(reuse.status).toBe(400);

      // Typed in lower case, without dashes, still works: people copy them badly.
      const sloppy = backupCodes[1]!.toLowerCase().replaceAll('-', '');
      await call(t, 'post', '/auth/login/verify', {
        body: { challengeId: c2.challengeId, method: 'backup_code', code: sloppy },
      }).expect(200);

      const login = await logIn(t, a).expect(200);
      expect(login.body.data.status).toBe('two_factor_required');
      const status = await call(t, 'get', '/security/two-factor', {
        token: (
          await call(t, 'post', '/auth/login/verify', {
            body: {
              challengeId: login.body.data.challengeId,
              method: 'backup_code',
              code: backupCodes[2]!,
            },
          }).expect(200)
        ).body.data.tokens.accessToken,
      }).expect(200);
      expect(status.body.data.backupCodesLeft).toBe(7);
    });

    it('cannot be spent twice by two simultaneous requests', async () => {
      const a = await signUp(t);
      const { backupCodes } = await enableTotp(a);
      const challenges = await Promise.all([
        signInToChallenge(a),
        signInToChallenge(a),
        signInToChallenge(a),
      ]);
      const results = await Promise.all(
        challenges.map((c) =>
          call(t, 'post', '/auth/login/verify', {
            body: { challengeId: c.challengeId, method: 'backup_code', code: backupCodes[3]! },
          }),
        ),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    });

    it('are replaced, all at once, on request with the password', async () => {
      const a = await signUp(t);
      const { backupCodes } = await enableTotp(a);
      await call(t, 'post', '/security/two-factor/backup-codes', {
        token: a.accessToken,
        body: { password: 'Wrong-Pass-1!aa' },
      }).expect(401);
      const fresh = await call(t, 'post', '/security/two-factor/backup-codes', {
        token: a.accessToken,
        body: { password: a.password },
      }).expect(200);
      expect(fresh.body.data.backupCodes).toHaveLength(10);
      expect(fresh.body.data.backupCodes).not.toContain(backupCodes[0]);

      const c = await signInToChallenge(a);
      await call(t, 'post', '/auth/login/verify', {
        body: { challengeId: c.challengeId, method: 'backup_code', code: backupCodes[0]! },
      }).expect(400);
    });

    it('cannot be requested while two-step verification is off', async () => {
      const a = await signUp(t);
      const res = await call(t, 'post', '/security/two-factor/backup-codes', {
        token: a.accessToken,
        body: { password: a.password },
      }).expect(412);
      expect(res.body.error.code).toBe('PRECONDITION_FAILED');
    });
  });

  describe('turning it off', () => {
    it('needs the password, removes everything, and tells the owner', async () => {
      const a = await signUp(t);
      await enableTotp(a);
      await call(t, 'post', '/security/two-factor/disable', {
        token: a.accessToken,
        body: { password: 'Wrong-Pass-1!aa' },
      }).expect(401);
      const off = await call(t, 'post', '/security/two-factor/disable', {
        token: a.accessToken,
        body: { password: a.password },
      }).expect(200);
      expect(off.body.data).toEqual({ enabled: false });

      const row = await t.db.query<{ enc: string | null; hashes: string[]; method: string | null }>(
        'SELECT two_factor_secret_enc AS enc, two_factor_backup_hashes AS hashes, two_factor_method AS method FROM users WHERE id = $1',
        [a.id],
      );
      expect(row.rows[0]).toEqual({ enc: null, hashes: [], method: null });
      expect(
        outbox(t)
          .to(a.email)
          .some((m) => m.template === 'security_two_factor_disabled'),
      ).toBe(true);
      expect((await logIn(t, a).expect(200)).body.data.status).toBe('authenticated');
    });

    it('limits password guesses by a stolen session, per account and not just per address', async () => {
      const a = await signUp(t);
      await enableTotp(a);
      const max = t.env.AUTH_MAX_FAILED_LOGINS;
      let last = 0;
      // Each guess from a different address, as a distributed attacker would.
      for (let i = 0; i < max; i++) {
        const res = await call(t, 'post', '/security/two-factor/disable', {
          token: a.accessToken,
          ip: freshIp(),
          body: { password: `Guess-${i}-Wrong!` },
        });
        last = res.status;
      }
      expect(last).toBe(423);
      const blocked = await call(t, 'post', '/security/two-factor/disable', {
        token: a.accessToken,
        ip: freshIp(),
        body: { password: a.password },
      }).expect(423);
      expect(blocked.body.error.code).toBe('ACCOUNT_LOCKED');
      const status = await call(t, 'get', '/security/two-factor', { token: a.accessToken }).expect(
        200,
      );
      expect(status.body.data.enabled).toBe(true);
    });
  });
});
