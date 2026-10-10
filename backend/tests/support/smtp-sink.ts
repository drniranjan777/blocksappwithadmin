import { simpleParser, type ParsedMail } from 'mailparser';
import { SMTPServer } from 'smtp-server';

export interface SinkMessage {
  envelopeFrom: string;
  envelopeTo: string[];
  mail: ParsedMail;
}

export interface SmtpSink {
  port: number;
  user: string;
  pass: string;
  /** Everything the server accepted, in order. */
  messages: SinkMessage[];
  /** How many logins were refused. */
  refusedLogins: number;
  /** Resolves when `count` messages have arrived (or throws after `timeoutMs`). */
  waitFor(count: number, timeoutMs?: number): Promise<SinkMessage[]>;
  close(): Promise<void>;
}

/**
 * A real SMTP server on a local port, for tests. It speaks the protocol (greeting, AUTH, MAIL
 * FROM, RCPT TO, DATA), so what is tested is the same wire exchange a hosting provider would see.
 * It refuses a wrong login with 535 and any recipient in `refuse` with 550. It does not do TLS:
 * tests give the provider `secure: false, requireTls: false`.
 */
export async function startSmtpSink(
  o: { user?: string; pass?: string; refuse?: string[] } = {},
): Promise<SmtpSink> {
  const user = o.user ?? 'noreply@mail.test';
  const pass = o.pass ?? 'correct-horse-battery-staple';
  const refuse = new Set((o.refuse ?? []).map((a) => a.toLowerCase()));
  const messages: SinkMessage[] = [];
  const sink = { refusedLogins: 0 };

  const server = new SMTPServer({
    logger: false,
    authOptional: false,
    allowInsecureAuth: true,
    disabledCommands: ['STARTTLS'],
    onAuth(auth, _session, callback) {
      if (auth.username === user && auth.password === pass) {
        callback(null, { user: auth.username });
      } else {
        sink.refusedLogins += 1;
        callback(new Error('Invalid login'));
      }
    },
    onRcptTo(address, _session, callback) {
      if (refuse.has(address.address.toLowerCase())) {
        callback(Object.assign(new Error('Mailbox unavailable'), { responseCode: 550 }));
      } else {
        callback();
      }
    },
    onData(stream, session, callback) {
      simpleParser(stream)
        .then((mail) => {
          messages.push({
            envelopeFrom: session.envelope.mailFrom ? session.envelope.mailFrom.address : '',
            envelopeTo: session.envelope.rcptTo.map((r) => r.address),
            mail,
          });
          callback();
        })
        .catch((e: Error) => callback(e));
    },
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    port,
    user,
    pass,
    messages,
    get refusedLogins() {
      return sink.refusedLogins;
    },
    async waitFor(count, timeoutMs = 10_000) {
      const deadline = Date.now() + timeoutMs;
      while (messages.length < count) {
        if (Date.now() > deadline) {
          throw new Error(`expected ${count} message(s), got ${messages.length}`);
        }
        await new Promise((r) => setTimeout(r, 25));
      }
      return messages;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
