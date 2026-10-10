import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { maskEmail, maskPhone } from '../common/crypto/mask.js';
import { PrismaService } from '../database/prisma.service.js';
import { renderOtpEmail } from './otp-email.js';
import type { NotificationType } from '../generated/prisma/client.js';
import { EmailProvider, PushProvider, SmsProvider } from '../providers/providers.js';
import {
  type CodeTemplate,
  type NoticeTemplate,
  renderCode,
  renderCodeSms,
  renderNotice,
} from './templates.js';

export type Severity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface NoticeInput {
  userId: string;
  type: NotificationType;
  template: NoticeTemplate;
  vars?: Record<string, string | number>;
  /**
   * INFO alerts honour the user's notification switches. WARNING and CRITICAL
   * ones always go out: you cannot opt out of being told your account may be
   * compromised.
   */
  severity: Severity;
  /**
   * `security` (default) alerts about the account; `social` is activity from
   * other people, which is never e-mailed and follows the push switch.
   */
  category?: 'security' | 'social';
  /** Ids only, so the app can open the right screen. */
  data?: Record<string, string>;
  dedupeKey?: string;
}

/** Minutes to wait before attempt N+1 (index = attempts already made). */
const BACKOFF_MINUTES = [1, 5, 30, 120, 720];
export const MAX_DELIVERY_ATTEMPTS = BACKOFF_MINUTES.length;

/**
 * Everything the platform tells a user, through three kinds of channel:
 *
 *   in-app   a `notifications` row, always
 *   e-mail / push / SMS   through the provider interfaces, with a delivery row
 *
 * One-time codes are sent directly and never stored: the delivery log keeps the
 * template, the masked destination and the outcome, not the code. Other messages
 * keep their (non-secret) variables so a failed delivery can be retried.
 */
@Injectable()
export class NotificationService implements OnModuleDestroy {
  private readonly logger = new Logger('Notifications');
  /** Code deliveries running in the background, so a shutdown can wait for them. */
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailProvider,
    private readonly sms: SmsProvider,
    private readonly push: PushProvider,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ---------------------------------------------------------------- codes --

  /**
   * Sends a one-time code. Failure is logged and swallowed: the caller cannot
   * react to it without revealing whether the account exists, and the user can
   * simply ask for another code.
   *
   * With a real provider the delivery runs in the background. Waiting for a mail server would
   * make a request for a real account slower than one for an address with no account (which
   * sends nothing), and that difference in time would tell a stranger which addresses are
   * registered. The development outbox is instant, so it is awaited and tests can read it at once.
   */
  async sendCode(input: {
    userId?: string | undefined;
    channel: 'EMAIL' | 'SMS';
    to: string;
    template: CodeTemplate;
    code: string;
  }): Promise<void> {
    const provider = input.channel === 'EMAIL' ? this.env.EMAIL_PROVIDER : this.env.SMS_PROVIDER;
    const delivery = this.deliverCode(input);
    if (provider === 'dev') {
      await delivery;
      return;
    }
    const tracked: Promise<void> = delivery
      .catch((e: unknown) =>
        this.logger.error(
          'Could not record the delivery of ' + input.template + ': ' + (e as Error).message,
        ),
      )
      .finally(() => this.inFlight.delete(tracked));
    this.inFlight.add(tracked);
  }

  /** Lets deliveries that have already started finish (a few seconds at most) before exit. */
  async onModuleDestroy(): Promise<void> {
    if (this.inFlight.size === 0) return;
    await Promise.race([
      Promise.allSettled(this.inFlight),
      new Promise((resolve) => setTimeout(resolve, 10_000)),
    ]);
  }

  private async deliverCode(input: {
    userId?: string | undefined;
    channel: 'EMAIL' | 'SMS';
    to: string;
    template: CodeTemplate;
    code: string;
  }): Promise<void> {
    const minutes = this.env.OTP_TTL_MINUTES;
    // Every code e-mail carries the same message (see otp-email.ts); the purpose of the code is
    // the app's business, not the e-mail's.
    const email = input.channel === 'EMAIL' ? renderOtpEmail(input.code, minutes) : undefined;
    const rendered = email ?? renderCode(input.template, input.code, minutes);
    const toMasked = input.channel === 'EMAIL' ? maskEmail(input.to) : maskPhone(input.to);
    let providerMessageId: string | undefined;
    let error: string | undefined;
    try {
      if (input.channel === 'EMAIL') {
        providerMessageId = (
          await this.email.send({
            to: input.to,
            subject: rendered.subject,
            text: rendered.text,
            ...(email ? { html: email.html } : {}),
            template: input.template,
          })
        ).providerMessageId;
      } else {
        providerMessageId = (
          await this.sms.send({
            to: input.to,
            text: renderCodeSms(input.template, input.code, minutes),
            template: input.template,
          })
        ).providerMessageId;
      }
    } catch (e) {
      error = (e as Error).message.slice(0, 200);
      this.logger.warn(`Could not send ${input.template} by ${input.channel}: ${error}`);
    }

    if (input.userId) {
      await this.prisma.notificationDelivery.create({
        data: {
          userId: input.userId,
          channel: input.channel,
          status: error ? 'FAILED' : 'SENT',
          template: input.template,
          subject: rendered.subject,
          toMasked,
          attempts: 1,
          lastError: error ?? null,
          providerMessageId: providerMessageId ?? null,
          sentAt: error ? null : new Date(),
          // Deliberately no payload and no retry: the code lives only in memory.
        },
      });
    }
  }

  // -------------------------------------------------------------- notices --

  async notify(input: NoticeInput): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        email: true,
        emailVerifiedAt: true,
        phone: true,
        phoneVerifiedAt: true,
        settings: true,
        pushDevices: { where: { disabledAt: null }, select: { token: true } },
      },
    });
    if (!user) return;

    const rendered = renderNotice(input.template, input.vars);
    const forced = input.severity !== 'INFO';
    const settings = user.settings;
    // Social notices (likes, follows, comments) are in-app and push only, and
    // follow the person's push switch; they are never e-mailed.
    const social = input.category === 'social';
    const wantsEmail = !social && (forced || (settings?.securityAlertEmail ?? true));
    const wantsPush = social
      ? (settings?.pushEnabled ?? true)
      : forced
        ? true
        : (settings?.securityAlertPush ?? true) && (settings?.pushEnabled ?? true);

    const notification = await this.prisma.notification
      .create({
        data: {
          userId: input.userId,
          type: input.type,
          title: rendered.subject.slice(0, 120),
          body: rendered.text.slice(0, 400),
          data: input.data ?? {},
          dedupeKey: input.dedupeKey ?? null,
        },
      })
      .catch((e: { code?: string }) => {
        // The same event notifying twice is expected and harmless (unique dedupe key).
        if (e.code === 'P2002') return null;
        throw e;
      });
    if (!notification) return;

    const queue = async (channel: 'EMAIL' | 'PUSH' | 'SMS', toMasked: string): Promise<string> =>
      (
        await this.prisma.notificationDelivery.create({
          data: {
            notificationId: notification.id,
            userId: input.userId,
            channel,
            status: 'QUEUED',
            template: input.template,
            subject: rendered.subject,
            toMasked,
            payload: input.vars ?? {},
            nextAttemptAt: new Date(),
          },
        })
      ).id;

    const jobs: Promise<void>[] = [];
    // Only a verified address is trusted with an alert about the account.
    if (user.email && user.emailVerifiedAt && wantsEmail) {
      jobs.push(queue('EMAIL', maskEmail(user.email)).then((id) => this.attempt(id)));
    }
    if (user.pushDevices.length && wantsPush) {
      jobs.push(
        queue('PUSH', `${user.pushDevices.length} device(s)`).then((id) => this.attempt(id)),
      );
    }
    // A critical alert with no verified e-mail still reaches the person, by SMS.
    if (
      input.severity === 'CRITICAL' &&
      !(user.email && user.emailVerifiedAt) &&
      user.phone &&
      user.phoneVerifiedAt
    ) {
      jobs.push(queue('SMS', maskPhone(user.phone)).then((id) => this.attempt(id)));
    }
    await Promise.all(jobs);
  }

  // -------------------------------------------------------------- delivery --

  /** Sends one queued delivery now. Used right after queuing and by the retry worker. */
  async attempt(deliveryId: string): Promise<void> {
    const d = await this.prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        notification: { select: { data: true, title: true, body: true } },
      },
    });
    if (!d || d.status === 'SENT') return;

    const user = await this.prisma.user.findUnique({
      where: { id: d.userId },
      select: {
        email: true,
        emailVerifiedAt: true,
        phone: true,
        phoneVerifiedAt: true,
        pushDevices: { where: { disabledAt: null }, select: { id: true, token: true } },
      },
    });
    const attempts = d.attempts + 1;
    try {
      const vars = (d.payload ?? {}) as Record<string, string | number>;
      const rendered = renderNotice(d.template as NoticeTemplate, vars);
      let providerMessageId: string | undefined;

      if (d.channel === 'EMAIL') {
        if (!user?.email || !user.emailVerifiedAt) return this.skip(d.id, 'no verified e-mail');
        providerMessageId = (
          await this.email.send({
            to: user.email,
            subject: rendered.subject,
            text: rendered.text,
            template: d.template,
          })
        ).providerMessageId;
      } else if (d.channel === 'SMS') {
        if (!user?.phone || !user.phoneVerifiedAt) return this.skip(d.id, 'no verified phone');
        providerMessageId = (
          await this.sms.send({ to: user.phone, text: rendered.subject, template: d.template })
        ).providerMessageId;
      } else {
        if (!user?.pushDevices.length) return this.skip(d.id, 'no devices');
        const result = await this.push.send({
          tokens: user.pushDevices.map((p) => p.token),
          title: d.notification?.title ?? rendered.subject,
          body: d.notification?.body ?? rendered.text,
          data: (d.notification?.data ?? {}) as Record<string, string>,
          template: d.template,
        });
        // A token the provider says is dead is retired so it is not tried again.
        if (result.invalidTokens.length) {
          await this.prisma.pushDevice.updateMany({
            where: { token: { in: result.invalidTokens } },
            data: { disabledAt: new Date() },
          });
        }
        providerMessageId = `push:${result.delivered}`;
      }

      await this.prisma.notificationDelivery.update({
        where: { id: d.id },
        data: {
          status: 'SENT',
          attempts,
          sentAt: new Date(),
          providerMessageId: providerMessageId ?? null,
          lastError: null,
          nextAttemptAt: null,
        },
      });
    } catch (error) {
      const message = (error as Error).message.slice(0, 300);
      const giveUp = attempts >= MAX_DELIVERY_ATTEMPTS;
      const wait = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)] ?? 720;
      this.logger.warn(
        `Delivery ${d.id} (${d.template}/${d.channel}) failed, attempt ${attempts}: ${message}`,
      );
      await this.prisma.notificationDelivery.update({
        where: { id: d.id },
        data: {
          status: 'FAILED',
          attempts,
          lastError: message,
          nextAttemptAt: giveUp ? null : new Date(Date.now() + wait * 60_000),
        },
      });
    }
  }

  private async skip(id: string, reason: string): Promise<void> {
    await this.prisma.notificationDelivery.update({
      where: { id },
      data: { status: 'SKIPPED', lastError: reason, nextAttemptAt: null },
    });
  }

  /**
   * Retries deliveries that failed or never started. Safe to run on every API
   * instance at once: rows are claimed with `FOR UPDATE SKIP LOCKED` and pushed
   * forward, so no two workers take the same one.
   */
  async retryDue(limit = 50): Promise<number> {
    const claimed = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE notification_deliveries
         SET next_attempt_at = now() + interval '10 minutes'
       WHERE id IN (
         SELECT id FROM notification_deliveries
          WHERE status IN ('QUEUED', 'FAILED')
            AND next_attempt_at IS NOT NULL
            AND next_attempt_at <= now()
            AND attempts < ${MAX_DELIVERY_ATTEMPTS}
          ORDER BY next_attempt_at
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED)
      RETURNING id`;
    for (const { id } of claimed) await this.attempt(id);
    return claimed.length;
  }
}
