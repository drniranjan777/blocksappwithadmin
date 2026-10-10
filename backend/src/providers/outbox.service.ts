import { Injectable } from '@nestjs/common';

export interface OutboxMessage {
  id: number;
  channel: 'email' | 'sms' | 'push';
  /** E-mail address, phone number or push token. */
  to: string;
  subject?: string;
  body: string;
  template: string;
  createdAt: Date;
}

/**
 * Where the development providers put "sent" messages instead of sending them.
 *
 * It exists so a developer (or a test) can read the one-time code that a real
 * deployment would e-mail or text. Message bodies are held in memory only: they
 * are never written to logs, and the outbox is only wired up when
 * `NODE_ENV` is not production (see `env.ts` and `DevController`).
 */
@Injectable()
export class DevOutbox {
  private readonly messages: OutboxMessage[] = [];
  private nextId = 1;
  private static readonly CAPACITY = 500;

  add(message: Omit<OutboxMessage, 'id' | 'createdAt'>): OutboxMessage {
    const stored: OutboxMessage = { ...message, id: this.nextId++, createdAt: new Date() };
    this.messages.push(stored);
    if (this.messages.length > DevOutbox.CAPACITY) this.messages.shift();
    return stored;
  }

  all(): readonly OutboxMessage[] {
    return this.messages;
  }

  to(address: string, channel?: OutboxMessage['channel']): OutboxMessage[] {
    return this.messages.filter((m) => m.to === address && (!channel || m.channel === channel));
  }

  /** The most recent message for an address, optionally of one template. */
  last(address: string, template?: string): OutboxMessage | undefined {
    return [...this.to(address)].reverse().find((m) => !template || m.template === template);
  }

  /** The 6-digit code in the most recent message to `address`. */
  lastCode(address: string): string | undefined {
    return /\b(\d{6})\b/.exec(this.last(address)?.body ?? '')?.[1];
  }

  clear(): void {
    this.messages.length = 0;
  }
}
