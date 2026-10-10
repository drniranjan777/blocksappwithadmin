import { Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { maskEmail } from '../common/crypto/mask.js';
import { EmailProvider, type EmailMessage } from './providers.js';

/**
 * Sends e-mail through an SMTP server (Hostinger in production).
 *
 *  - Credentials come from the environment only; they are never logged, returned or put in an
 *    error message. Recipient addresses are masked in logs; message bodies (which carry one-time
 *    codes) are never logged at all.
 *  - Every network step has a time limit, so a stalled mail server cannot hold a request or the
 *    process open.
 *  - "Sent" means the server *accepted* the message for the recipient. That is not the same as
 *    the recipient having received it, and nothing here claims it is.
 *  - Connection-level trouble is retried once; a refused login or a refused recipient is not
 *    (the answer would be the same, and repeating a wrong password risks locking the mailbox).
 */

export interface SmtpSettings {
  host: string;
  port: number;
  /** TLS from the first byte (port 465). Otherwise the connection must upgrade with STARTTLS. */
  secure: boolean;
  user: string;
  pass: string;
  fromEmail: string;
  fromName: string;
  /** Overrides, for tests that talk to a local server without TLS. Production leaves these out. */
  requireTls?: boolean;
  rejectUnauthorized?: boolean;
}

export interface SmtpProviderOptions {
  /** Check the connection and login once, right after start-up, and log the outcome. */
  verifyOnStart?: boolean;
  /** Pause before the single retry. */
  retryDelayMs?: number;
}

export type EmailFailureKind = 'auth' | 'connection' | 'rejected' | 'other';

/** A delivery failure described without any secret or personal detail. */
export class EmailDeliveryError extends Error {
  constructor(
    message: string,
    readonly kind: EmailFailureKind,
    readonly code?: string,
    readonly responseCode?: number,
  ) {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

const CONNECTION_CODES = new Set([
  'ECONNECTION',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ESOCKET',
  'EDNS',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPROTOCOL',
  'ETLS',
]);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class SmtpEmailProvider
  extends EmailProvider
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger('Smtp');
  private readonly transport: Transporter;
  private readonly from: { name: string; address: string };

  constructor(
    private readonly settings: SmtpSettings,
    private readonly options: SmtpProviderOptions = {},
  ) {
    super();
    this.from = { name: settings.fromName, address: settings.fromEmail };
    this.transport = createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      // Never send the password over a connection that has not been encrypted.
      requireTLS: settings.requireTls ?? !settings.secure,
      auth: { user: settings.user, pass: settings.pass },
      tls: { minVersion: 'TLSv1.2', rejectUnauthorized: settings.rejectUnauthorized ?? true },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  onApplicationBootstrap(): void {
    if (!this.options.verifyOnStart) return;
    // In the background: a mail outage must not stop the API from starting, but it must be loud.
    void this.verify().catch(() => undefined);
  }

  onModuleDestroy(): void {
    this.transport.close();
  }

  /** Connects and logs in without sending anything. Throws an `EmailDeliveryError` if it cannot. */
  async verify(): Promise<void> {
    try {
      await this.transport.verify();
      this.logger.log(
        `SMTP connection verified: host=${this.settings.host} port=${this.settings.port} ` +
          `secure=${this.settings.secure} user=${maskEmail(this.settings.user)}`,
      );
    } catch (e) {
      const failure = this.describe(e);
      this.logger.error(
        `SMTP check failed: kind=${failure.kind} code=${failure.code ?? '-'} ` +
          `responseCode=${failure.responseCode ?? '-'} host=${this.settings.host} ` +
          `port=${this.settings.port}: ${failure.message}`,
      );
      throw failure;
    }
  }

  async send(message: EmailMessage): Promise<{ providerMessageId: string }> {
    const started = Date.now();
    for (let attempt = 1; ; attempt++) {
      try {
        const info = await this.transport.sendMail({
          from: this.from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
          headers: { 'Auto-Submitted': 'auto-generated' },
        });
        const accepted = (info.accepted ?? []).map((a) => String(a).toLowerCase());
        if (!accepted.includes(message.to.toLowerCase()) || (info.rejected ?? []).length > 0) {
          throw new EmailDeliveryError(
            'The mail server did not accept the recipient',
            'rejected',
            'ERECIPIENT',
          );
        }
        this.logger.log(
          `SMTP accepted message: template=${message.template} to=${maskEmail(message.to)} ` +
            `messageId=${info.messageId} attempt=${attempt} ms=${Date.now() - started}`,
        );
        return { providerMessageId: info.messageId };
      } catch (e) {
        const failure = this.describe(e);
        if (failure.kind === 'connection' && attempt < 2) {
          this.logger.warn(
            `SMTP connection problem, retrying once: code=${failure.code ?? '-'} ` +
              `host=${this.settings.host} template=${message.template}`,
          );
          await sleep(this.options.retryDelayMs ?? 1000);
          continue;
        }
        this.logger.error(
          `SMTP delivery failed: kind=${failure.kind} code=${failure.code ?? '-'} ` +
            `responseCode=${failure.responseCode ?? '-'} host=${this.settings.host} ` +
            `template=${message.template} to=${maskEmail(message.to)} attempt=${attempt}: ${failure.message}`,
        );
        throw failure;
      }
    }
  }

  /** Turns whatever the SMTP library threw into a message that is safe to log and store. */
  private describe(error: unknown): EmailDeliveryError {
    if (error instanceof EmailDeliveryError) return error;
    const e = error as { code?: unknown; responseCode?: unknown; response?: unknown };
    const code = typeof e.code === 'string' ? e.code : undefined;
    const responseCode = typeof e.responseCode === 'number' ? e.responseCode : undefined;
    // The server's own words help an operator ("535 authentication failed"), but they can echo the
    // recipient's address, so any address is removed first.
    const server =
      typeof e.response === 'string'
        ? e.response
            .replace(/[^\s<>"']+@[^\s<>"']+/g, '[address]')
            .replace(/\s+/g, ' ')
            .slice(0, 120)
        : '';
    const detail = server ? ` (server said: ${server})` : '';

    if (code === 'EAUTH' || responseCode === 535) {
      return new EmailDeliveryError(
        `The mail server refused the login; check SMTP_USER and SMTP_PASS${detail}`,
        'auth',
        code,
        responseCode,
      );
    }
    if (code && CONNECTION_CODES.has(code)) {
      return new EmailDeliveryError(
        `Could not reach or keep a connection to the mail server (${code})`,
        'connection',
        code,
        responseCode,
      );
    }
    if (code === 'EENVELOPE' || (responseCode !== undefined && responseCode >= 500)) {
      return new EmailDeliveryError(
        `The mail server refused the message or the recipient${detail}`,
        'rejected',
        code,
        responseCode,
      );
    }
    return new EmailDeliveryError(
      `The message could not be sent (${code ?? 'unknown error'})${detail}`,
      'other',
      code,
      responseCode,
    );
  }
}
