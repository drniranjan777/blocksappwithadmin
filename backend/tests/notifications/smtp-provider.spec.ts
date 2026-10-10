import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderOtpEmail } from '../../src/notifications/otp-email.js';
import {
  EmailDeliveryError,
  SmtpEmailProvider,
  type SmtpSettings,
} from '../../src/providers/smtp-email.provider.js';
import { startSmtpSink, type SmtpSink } from '../support/smtp-sink.js';

describe('the SMTP e-mail provider', () => {
  let sink: SmtpSink;

  beforeAll(async () => {
    sink = await startSmtpSink({ refuse: ['nobody@mail.test'] });
  });
  afterAll(async () => {
    await sink.close();
  });

  const settings = (over: Partial<SmtpSettings> = {}): SmtpSettings => ({
    host: '127.0.0.1',
    port: sink.port,
    secure: false,
    requireTls: false,
    user: sink.user,
    pass: sink.pass,
    fromEmail: 'noreply@mail.test',
    fromName: 'BLOCKS',
    ...over,
  });
  const provider = (over: Partial<SmtpSettings> = {}) =>
    new SmtpEmailProvider(settings(over), { retryDelayMs: 0 });

  const failureOf = async (p: Promise<unknown>): Promise<EmailDeliveryError> => {
    try {
      await p;
    } catch (e) {
      expect(e).toBeInstanceOf(EmailDeliveryError);
      return e as EmailDeliveryError;
    }
    throw new Error('expected a failure');
  };

  it('connects and logs in with the right credentials', async () => {
    await expect(provider().verify()).resolves.toBeUndefined();
  });

  it('delivers the code e-mail with the right sender, subject and words', async () => {
    const before = sink.messages.length;
    const mail = renderOtpEmail('654321', 15);
    const p = provider();
    const sent = await p.send({
      to: 'asha@mail.test',
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      template: 'otp_login',
    });
    expect(sent.providerMessageId).toMatch(/^<.+>$/);

    const [m] = (await sink.waitFor(before + 1)).slice(before);
    expect(m?.envelopeTo).toEqual(['asha@mail.test']);
    expect(m?.mail.from?.value[0]).toMatchObject({ name: 'BLOCKS', address: 'noreply@mail.test' });
    expect(m?.mail.subject).toBe('Your BLOCKS App Verification Code');
    expect(m?.mail.text?.trim()).toBe(
      [
        'Here is your BLOCKS app verification code:',
        '654321',
        'Please make sure you never share this code with anyone.',
        'Note: Code will expire in 15 Minutes.',
      ].join('\n'),
    );
    expect(m?.mail.html).toContain('654321');
    p.onModuleDestroy();
  });

  it('reports a refused login as an authentication failure, without leaking the password', async () => {
    const wrong = 'not-the-right-password-9f3a';
    const before = sink.refusedLogins;
    const failure = await failureOf(provider({ pass: wrong }).verify());
    expect(failure.kind).toBe('auth');
    expect(failure.message).not.toContain(wrong);
    expect(JSON.stringify(failure)).not.toContain(wrong);

    const sending = await failureOf(
      provider({ pass: wrong }).send({
        to: 'asha@mail.test',
        subject: 's',
        text: 't',
        template: 'x',
      }),
    );
    expect(sending.kind).toBe('auth');
    // A refused login is not repeated: the answer would be the same, and repeating a wrong
    // password is how a mailbox gets locked. One verify + one send = two refusals, no retries.
    expect(sink.refusedLogins - before).toBe(2);
  });

  it('reports a refused recipient, and masks the address in what it says', async () => {
    const failure = await failureOf(
      provider().send({ to: 'nobody@mail.test', subject: 's', text: 't', template: 'x' }),
    );
    expect(failure.kind).toBe('rejected');
    expect(failure.responseCode).toBe(550);
    expect(failure.message).not.toContain('nobody@mail.test');
  });

  it('reports an unreachable server as a connection failure', async () => {
    const failure = await failureOf(
      provider({ port: 1 }).send({ to: 'asha@mail.test', subject: 's', text: 't', template: 'x' }),
    );
    expect(failure.kind).toBe('connection');
  });

  it('refuses to send the password over a connection that is not encrypted', async () => {
    // The sink offers no STARTTLS, so a provider that requires it must not log in at all.
    const before = sink.refusedLogins + sink.messages.length;
    const failure = await failureOf(
      provider({ requireTls: true }).send({
        to: 'asha@mail.test',
        subject: 's',
        text: 't',
        template: 'x',
      }),
    );
    expect(['connection', 'other']).toContain(failure.kind);
    expect(sink.refusedLogins + sink.messages.length).toBe(before);
  });
});
