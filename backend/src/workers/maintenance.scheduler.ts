import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AccountService } from '../account/account.service.js';
import { AdsDeliveryService } from '../ads/ads-delivery.service.js';
import { OtpService } from '../auth/otp.service.js';
import { UserSessionService } from '../auth/user-session.service.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { IdempotencyService } from '../common/idempotency/idempotency.service.js';
import { AdminSessionService } from '../admin/auth/admin-session.service.js';
import { MediaJobsService } from '../media/jobs/media-jobs.service.js';
import { MediaRetentionService } from '../media/processing/media-retention.service.js';
import { UploadsService } from '../media/uploads/uploads.service.js';
import { CreatorProfileService } from '../earnings/creator-profile.service.js';
import { EarningsService } from '../earnings/earnings.service.js';
import { MusicAdminService } from '../music/music-admin.service.js';
import { KycService } from '../payments/kyc/kyc.service.js';
import { PayoutsService } from '../payments/payouts/payouts.service.js';
import { ReachScoringService } from '../reach/reach-scoring.service.js';
import { NotificationService } from '../notifications/notification.service.js';
import { TrendingService } from '../social/feed/trending.service.js';
import { StoriesService } from '../social/stories/stories.service.js';

interface Task {
  name: string;
  everyMs: number;
  run: () => Promise<unknown>;
}

/**
 * Recurring housekeeping that has to happen whether or not anyone is using the
 * app. Every task is safe to run on every API instance at once (work is claimed
 * with row locks, or is an idempotent delete), so no leader election is needed.
 *
 * It is an in-process timer. If they ever need to move to a queue or a cron
 * service, only this class changes; the tasks themselves do not.
 */
@Injectable()
export class MaintenanceScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Maintenance');
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly notifications: NotificationService,
    private readonly otp: OtpService,
    private readonly sessions: UserSessionService,
    private readonly accounts: AccountService,
    private readonly adminSessions: AdminSessionService,
    private readonly uploads: UploadsService,
    private readonly retention: MediaRetentionService,
    private readonly mediaJobs: MediaJobsService,
    private readonly idempotency: IdempotencyService,
    private readonly stories: StoriesService,
    private readonly trending: TrendingService,
    private readonly music: MusicAdminService,
    private readonly reach: ReachScoringService,
    private readonly creators: CreatorProfileService,
    private readonly earnings: EarningsService,
    private readonly kyc: KycService,
    private readonly payouts: PayoutsService,
    private readonly ads: AdsDeliveryService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  tasks(): Task[] {
    return [
      { name: 'retry-deliveries', everyMs: 60_000, run: () => this.notifications.retryDue() },
      { name: 'purge-codes', everyMs: 3_600_000, run: () => this.otp.purgeExpired() },
      { name: 'purge-sessions', everyMs: 6 * 3_600_000, run: () => this.sessions.purgeExpired() },
      { name: 'erase-accounts', everyMs: 3_600_000, run: () => this.accounts.eraseDue() },
      {
        name: 'purge-admin-sessions',
        everyMs: 6 * 3_600_000,
        run: () => this.adminSessions.purgeExpired(),
      },
      { name: 'expire-uploads', everyMs: 300_000, run: () => this.uploads.expireStale() },
      { name: 'purge-originals', everyMs: 3_600_000, run: () => this.retention.purgeOriginals() },
      {
        name: 'purge-media-jobs',
        everyMs: 6 * 3_600_000,
        run: () => this.mediaJobs.purgeFinished(),
      },
      { name: 'purge-idempotency', everyMs: 3_600_000, run: () => this.idempotency.purgeExpired() },
      { name: 'purge-stories', everyMs: 6 * 3_600_000, run: () => this.stories.purgeExpired() },
      { name: 'expire-licences', everyMs: 900_000, run: () => this.music.expireLicences() },
      { name: 'score-reach', everyMs: 120_000, run: () => this.reach.scorePending() },
      { name: 'refresh-creators', everyMs: 900_000, run: () => this.creators.refreshAll() },
      { name: 'refresh-estimates', everyMs: 900_000, run: () => this.earnings.refreshEstimates() },
      { name: 'send-payouts', everyMs: 60_000, run: () => this.payouts.sendApproved() },
      { name: 'settle-payouts', everyMs: 120_000, run: () => this.payouts.settleProcessing() },
      { name: 'recheck-kyc', everyMs: 120_000, run: () => this.kyc.recheckPending() },
      { name: 'expire-kyc', everyMs: 3_600_000, run: () => this.kyc.expireLapsed() },
      {
        name: 'purge-kyc-documents',
        everyMs: 6 * 3_600_000,
        run: () => this.kyc.purgeExpiredDocuments(),
      },
      { name: 'recompute-trending', everyMs: 900_000, run: () => this.trending.recompute() },
      { name: 'run-campaigns', everyMs: 60_000, run: () => this.ads.tick() },
    ];
  }

  /** Runs one task now, logging (not throwing) any failure. Used by the timers and by tests. */
  async runTask(task: Task): Promise<void> {
    try {
      const result = await task.run();
      if (typeof result === 'number' && result > 0) this.logger.log(`${task.name}: ${result}`);
    } catch (error) {
      this.logger.error(`${task.name} failed: ${(error as Error).message}`);
    }
  }

  onApplicationBootstrap(): void {
    if (!this.env.workersEnabled) return;
    for (const task of this.tasks()) {
      const timer = setInterval(() => void this.runTask(task), task.everyMs);
      timer.unref();
      this.timers.push(timer);
    }
  }

  onApplicationShutdown(): void {
    this.timers.forEach(clearInterval);
    this.timers = [];
  }
}
