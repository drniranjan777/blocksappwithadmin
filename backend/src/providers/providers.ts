import { Injectable } from '@nestjs/common';
import { DevOutbox } from './outbox.service.js';

/**
 * The seams to the outside world. The application depends on these abstract
 * classes only; which concrete provider runs is chosen by configuration:
 *
 *   dev      writes to the in-memory DevOutbox (development and tests)
 *   <real>   a vendor adapter, added when credentials exist
 *
 * A production deployment with no real provider configured refuses to start
 * (`env.ts`), so a message can never be silently "sent" to nowhere.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Template key, for provider-side analytics and for the delivery log. */
  template: string;
}

export abstract class EmailProvider {
  abstract send(message: EmailMessage): Promise<{ providerMessageId: string }>;
}

export interface SmsMessage {
  /** E.164. */
  to: string;
  text: string;
  template: string;
}

export abstract class SmsProvider {
  abstract send(message: SmsMessage): Promise<{ providerMessageId: string }>;
}

export interface PushMessage {
  /** Device tokens (FCM registration tokens / APNs tokens). */
  tokens: string[];
  title: string;
  body: string;
  /** Ids only, so the app can open the right screen. Never personal content. */
  data?: Record<string, string>;
  template: string;
}

export abstract class PushProvider {
  abstract send(message: PushMessage): Promise<{ delivered: number; invalidTokens: string[] }>;
}

@Injectable()
export class DevEmailProvider extends EmailProvider {
  constructor(private readonly outbox: DevOutbox) {
    super();
  }
  async send(message: EmailMessage): Promise<{ providerMessageId: string }> {
    const stored = this.outbox.add({
      channel: 'email',
      to: message.to,
      subject: message.subject,
      body: message.text,
      template: message.template,
    });
    return { providerMessageId: `dev-${stored.id}` };
  }
}

@Injectable()
export class DevSmsProvider extends SmsProvider {
  constructor(private readonly outbox: DevOutbox) {
    super();
  }
  async send(message: SmsMessage): Promise<{ providerMessageId: string }> {
    const stored = this.outbox.add({
      channel: 'sms',
      to: message.to,
      body: message.text,
      template: message.template,
    });
    return { providerMessageId: `dev-${stored.id}` };
  }
}

@Injectable()
export class DevPushProvider extends PushProvider {
  constructor(private readonly outbox: DevOutbox) {
    super();
  }
  async send(message: PushMessage): Promise<{ delivered: number; invalidTokens: string[] }> {
    for (const token of message.tokens) {
      this.outbox.add({
        channel: 'push',
        to: token,
        subject: message.title,
        body: message.body,
        template: message.template,
      });
    }
    return { delivered: message.tokens.length, invalidTokens: [] };
  }
}
