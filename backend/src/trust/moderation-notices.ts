import { Injectable, Logger } from '@nestjs/common';
import type { ReportTargetType } from '../generated/prisma/client.js';
import { NotificationService } from '../notifications/notification.service.js';
import { reasonTitle } from './policy.js';

const LABEL: Record<ReportTargetType, string> = {
  POST: 'post',
  REEL: 'reel',
  STORY: 'story',
  COMMENT: 'comment',
  USER: 'account',
  LIVE: 'live video',
  MESSAGE: 'message',
};

/**
 * What people are told about moderation, in one place.
 *
 * These messages say *that* something happened, which published rule it was under, and what they
 * can do about it. They never carry staff notes, the reporter's identity, or any detail of how
 * the decision was reached. Sending is best-effort: a message that cannot go out never undoes a
 * decision that was already made and audited.
 */
@Injectable()
export class ModerationNotices {
  private readonly logger = new Logger('ModerationNotices');

  constructor(private readonly notifications: NotificationService) {}

  private async send(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (e) {
      this.logger.warn(`Could not send a moderation notice: ${(e as Error).message}`);
    }
  }

  /** A post, reel, story or comment was hidden, removed or warned about. */
  contentDecision(
    userId: string,
    kind: 'restricted' | 'removed' | 'warning' | 'restored',
    targetType: ReportTargetType,
    policyReason: string,
    actionId: string,
    targetId: string,
  ): Promise<void> {
    const vars = { target: LABEL[targetType], rule: reasonTitle(policyReason) };
    const template =
      kind === 'restricted'
        ? 'moderation_content_restricted'
        : kind === 'removed'
          ? 'social_content_removed'
          : kind === 'warning'
            ? 'moderation_warning'
            : 'moderation_content_restored';
    return this.send(() =>
      this.notifications.notify({
        userId,
        type: 'MODERATION_DECISION',
        template,
        vars,
        severity: 'INFO',
        category: 'social',
        data: { actionId, targetType, targetId },
        dedupeKey: `mod-action:${actionId}`,
      }),
    );
  }

  /** Tells the person who reported it that it was looked at, and nothing about the other person. */
  reportOutcome(
    reporterId: string,
    reportId: string,
    outcome: 'action_taken' | 'no_violation',
  ): Promise<void> {
    return this.send(() =>
      this.notifications.notify({
        userId: reporterId,
        type: 'MODERATION_DECISION',
        template: 'moderation_report_outcome',
        vars: { outcome },
        severity: 'INFO',
        category: 'social',
        data: { reportId },
        dedupeKey: `report-outcome:${reportId}`,
      }),
    );
  }

  appealReceived(userId: string, appealId: string): Promise<void> {
    return this.send(() =>
      this.notifications.notify({
        userId,
        type: 'MODERATION_DECISION',
        template: 'moderation_appeal_received',
        severity: 'INFO',
        category: 'social',
        data: { appealId },
        dedupeKey: `appeal-received:${appealId}`,
      }),
    );
  }

  appealDecided(
    userId: string,
    appealId: string,
    outcome: 'UPHELD' | 'OVERTURNED' | 'REJECTED',
  ): Promise<void> {
    return this.send(() =>
      this.notifications.notify({
        userId,
        type: 'MODERATION_DECISION',
        template: 'moderation_appeal_decided',
        vars: { outcome },
        // An appeal outcome can mean an account is usable again: it is always sent.
        severity: 'WARNING',
        data: { appealId },
        dedupeKey: `appeal-decided:${appealId}`,
      }),
    );
  }
}
