import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EmailProvider } from '../../src/providers/providers.js';
import { SmtpEmailProvider } from '../../src/providers/smtp-email.provider.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { AUTH_TEST_ENV, PASSWORD, call, deviceBody, freshIp, freshName } from '../support/auth.js';
import { startSmtpSink, type SmtpSink } from '../support/smtp-sink.js';

/**
 * One-time codes by e-mail, end to end: the real endpoints, the real code logic and the real SMTP
 * provider talking to a local SMTP server (not a mock of the provider). It proves that the code
 * leaves the API only inside the e-mail, that the e-mail says what it should, and that the code in
 * it is the one the API accepts. It does not prove delivery by a real mail host.
 */
describe('one-time codes by SMTP', () => {
  let t: TestApp;
  let sink: SmtpSink;

  const smtpEnv = (s: SmtpSink) => ({
    ...AUTH_TEST_ENV,
    EMAIL_PROVIDER: 'smtp',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(s.port),
    SMTP_SECURE: 'false',
    SMTP_USER: s.user,
    SMTP_PASS: s.pass,
    SMTP_FROM_EMAIL: 'noreply@mail.test',
  });

  /** The real provider, pointed at the sink, which has no TLS. */
  const providerFor = (s: SmtpSink, pass = s.pass) =>
    new SmtpEmailProvider(
      {
        host: '127.0.0.1',
        port: s.port,
        secure: false,
        requireTls: false,
        user: s.user,
        pass,
        fromEmail: 'noreply@mail.test',
        fromName: 'BLOCKS',
      },
      { retryDelayMs: 0 },
    );

  beforeAll(async () => {
    sink = await startSmtpSink();
    t = await createTestApp(smtpEnv(sink), (builder) => {
      builder.overrideProvider(EmailProvider).useValue(providerFor(sink));
    });
  });
  afterAll(async () => {
    await t.close();
    await sink.close();
  });

  const registration = () => {
    const username = freshName();
    return {
      username,
      displayName: 'Asha Rao',
      email: `${username}@mail.test`,
      password: PASSWORD,
      dateOfBirth: '1999-06-01',
      device: deviceBody(`dev-${username}`),
    };
  };

  /** The newest message to an address, once it has arrived. */
  async function mailTo(address: string, since = 0) {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const found = sink.messages
        .slice(since)
        .filter((m) => m.envelopeTo.includes(address))
        .at(-1);
      if (found) return found;
      if (Date.now() > deadline) throw new Error(`no mail arrived for ${address}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  }
  const codeIn = (text: string | undefined): string => {
    const code = /^\d{6}$/m.exec(text ?? '')?.[0];
    if (!code) throw new Error('no code in the message');
    return code;
  };

  /** An account whose address is verified, by reading the code out of the e-mail it was sent. */
  async function verifiedAccount(): Promise<{ email: string }> {
    const b = registration();
    const reg = await call(t, 'post', '/auth/register', { body: b }).expect(202);
    const code = codeIn((await mailTo(b.email)).mail.text);
    await call(t, 'post', '/auth/verify-contact', {
      body: { challengeId: reg.body.data.verification.challengeId, code, device: b.device },
    }).expect(200);
    return { email: b.email };
  }

  it('mails the code in the specified message, and that code signs the person in', async () => {
    const b = registration();
    const reg = await call(t, 'post', '/auth/register', { body: b }).expect(202);
    const { challengeId } = reg.body.data.verification;

    const mail = await mailTo(b.email);
    expect(mail.mail.from?.value[0]).toMatchObject({
      name: 'BLOCKS',
      address: 'noreply@mail.test',
    });
    expect(mail.mail.subject).toBe('Your BLOCKS App Verification Code');
    const code = codeIn(mail.mail.text);
    expect(mail.mail.text?.trim().split('\n')).toEqual([
      'Here is your BLOCKS app verification code:',
      code,
      'Please make sure you never share this code with anyone.',
      'Note: Code will expire in 15 Minutes.',
    ]);
    expect(mail.mail.html).toContain(`>${code}<`);

    // The code is in the mail and nowhere in what the API answered.
    expect(JSON.stringify(reg.body)).not.toContain(code);
    expect(JSON.stringify(reg.body)).not.toMatch(/accessToken|refreshToken/);

    // Sending the mail did not verify anyone: the code has to come back.
    const wrong = code === '000000' ? '000001' : '000000';
    await call(t, 'post', '/auth/verify-contact', {
      body: { challengeId, code: wrong, device: b.device },
    }).expect(400);
    const ok = await call(t, 'post', '/auth/verify-contact', {
      body: { challengeId, code, device: b.device },
    }).expect(200);
    expect(ok.body.data.status).toBe('authenticated');

    // Used once.
    await call(t, 'post', '/auth/verify-contact', {
      body: { challengeId, code, device: b.device },
    }).expect(400);
  });

  it('gives the code exactly fifteen minutes', async () => {
    const b = registration();
    const reg = await call(t, 'post', '/auth/register', { body: b }).expect(202);
    const row = await t.db.query<{ seconds: string }>(
      'SELECT extract(epoch FROM (expires_at - created_at)) AS seconds FROM otp_challenges WHERE id = $1',
      [reg.body.data.verification.challengeId],
    );
    expect(Number(row.rows[0]?.seconds)).toBeCloseTo(900, 0);
    expect(t.env.OTP_TTL_MINUTES).toBe(15);
  });

  it('waits out the resend cooldown before mailing another code', async () => {
    const b = registration();
    const reg = await call(t, 'post', '/auth/register', { body: b }).expect(202);
    const { challengeId } = reg.body.data.verification;
    const res = await call(t, 'post', '/auth/resend', { body: { challengeId } });
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('only honours the newest code when a second one is requested', async () => {
    const account = await verifiedAccount();
    // Mail is delivered in the background, so note where the mailbox stands before each request.
    const beforeFirst = sink.messages.length;
    const firstStart = await call(t, 'post', '/auth/password/forgot', {
      body: { identifier: account.email },
    }).expect(202);
    const first = codeIn((await mailTo(account.email, beforeFirst)).mail.text);

    const beforeSecond = sink.messages.length;
    const secondStart = await call(t, 'post', '/auth/password/forgot', {
      body: { identifier: account.email },
    }).expect(202);
    const second = codeIn((await mailTo(account.email, beforeSecond)).mail.text);

    const firstId: string = firstStart.body.data.verification.challengeId;
    const secondId: string = secondStart.body.data.verification.challengeId;
    const states = await t.db.query<{ id: string; consumed: boolean }>(
      'SELECT id, consumed_at IS NOT NULL AS consumed FROM otp_challenges WHERE id = ANY($1)',
      [[firstId, secondId]],
    );
    const consumed = new Map(states.rows.map((r) => [r.id, r.consumed]));
    expect(consumed.get(firstId)).toBe(true);
    expect(consumed.get(secondId)).toBe(false);

    // The earlier code no longer opens its own challenge; the newest one does.
    const stale = await call(t, 'post', '/auth/password/verify', {
      body: { challengeId: firstId, code: first },
    });
    expect(stale.status).toBe(400);
    const current = await call(t, 'post', '/auth/password/verify', {
      body: { challengeId: secondId, code: second },
    });
    expect(current.status).toBe(200);
  });

  it('answers a stranger exactly as it answers an account holder, and mails only the latter', async () => {
    const account = await verifiedAccount();
    const ghost = `${freshName('ghost')}@mail.test`;
    const seen = sink.messages.length;

    const real = await call(t, 'post', '/auth/password/forgot', {
      ip: freshIp(),
      body: { identifier: account.email },
    });
    const none = await call(t, 'post', '/auth/password/forgot', {
      ip: freshIp(),
      body: { identifier: ghost },
    });
    expect(none.status).toBe(real.status);
    expect(Object.keys(none.body.data.verification).sort()).toEqual(
      Object.keys(real.body.data.verification).sort(),
    );

    await mailTo(account.email, seen);
    await new Promise((r) => setTimeout(r, 300));
    expect(sink.messages.slice(seen).some((m) => m.envelopeTo.includes(ghost))).toBe(false);
  });
});

describe('when the mail server refuses us', () => {
  let t: TestApp;
  let sink: SmtpSink;
  const WRONG = 'wrong-smtp-password-7c41';

  beforeAll(async () => {
    sink = await startSmtpSink();
    const env = {
      ...AUTH_TEST_ENV,
      EMAIL_PROVIDER: 'smtp',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(sink.port),
      SMTP_SECURE: 'false',
      SMTP_USER: sink.user,
      SMTP_PASS: WRONG,
      SMTP_FROM_EMAIL: 'noreply@mail.test',
    };
    t = await createTestApp(env, (builder) => {
      builder.overrideProvider(EmailProvider).useValue(
        new SmtpEmailProvider(
          {
            host: '127.0.0.1',
            port: sink.port,
            secure: false,
            requireTls: false,
            user: sink.user,
            pass: WRONG,
            fromEmail: 'noreply@mail.test',
            fromName: 'BLOCKS',
          },
          { retryDelayMs: 0 },
        ),
      );
    });
  });
  afterAll(async () => {
    await t.close();
    await sink.close();
  });

  it('still answers normally, records the failure, and keeps the password and the code out of it', async () => {
    const username = freshName();
    const email = `${username}@mail.test`;
    const reg = await call(t, 'post', '/auth/register', {
      body: {
        username,
        displayName: 'Asha Rao',
        email,
        password: PASSWORD,
        dateOfBirth: '1999-06-01',
        device: deviceBody(`dev-${username}`),
      },
    });
    // The person is told the code is on its way, as ever: the caller cannot be told otherwise
    // without revealing which addresses have accounts.
    expect(reg.status).toBe(202);

    // The failure is recorded (the delivery is written after the send returns).
    const deadline = Date.now() + 10_000;
    let row: { status: string; last_error: string | null; template: string } | undefined;
    while (Date.now() < deadline) {
      const res = await t.db.query<{ status: string; last_error: string | null; template: string }>(
        `SELECT d.status, d.last_error, d.template
           FROM notification_deliveries d JOIN users u ON u.id = d.user_id
          WHERE u.username = $1 AND d.channel = 'EMAIL'`,
        [username],
      );
      row = res.rows[0];
      if (row) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(row?.status).toBe('FAILED');
    expect(row?.last_error).toMatch(/refused the login/);
    expect(JSON.stringify(row)).not.toContain(WRONG);
    expect(sink.messages).toHaveLength(0);
    expect(sink.refusedLogins).toBeGreaterThan(0);
  });
});
