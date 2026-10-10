import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import type { MediaJob } from '../../generated/prisma/client.js';
import { MediaJobsService } from '../jobs/media-jobs.service.js';
import { MediaToolError } from './ffmpeg.js';
import { Deferred, Rejected } from './job-errors.js';
import { MediaProcessor } from './media-processor.js';

/** Debugging aid, off unless `MEDIA_TRACE=1`: one line per job start, finish and failure. */
const TRACE = process.env['MEDIA_TRACE'] === '1';
function trace(line: string): void {
  if (TRACE) process.stderr.write(`[media ${new Date().toISOString().slice(11, 23)}] ${line}\n`);
}

/**
 * Works through the media queue.
 *
 * Every API process can run this; the queue's row locking means they share the work
 * without taking the same job. It is deliberately simple: take what is due (as many
 * as `MEDIA_WORKER_CONCURRENCY` at once), run each, record the outcome. A file that
 * is the problem is refused for good; anything else is retried with growing delays.
 */
@Injectable()
export class MediaWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('MediaWorker');
  private timer: NodeJS.Timeout | undefined;
  private busy: Promise<unknown> | undefined;
  private stopping = false;

  constructor(
    private readonly jobs: MediaJobsService,
    private readonly processor: MediaProcessor,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.env.workersEnabled) return;
    this.timer = setInterval(() => {
      if (this.busy || this.stopping) return;
      this.busy = this.drain()
        .catch((e: Error) => this.logger.error(`queue run failed: ${e.message}`))
        .finally(() => {
          this.busy = undefined;
        });
    }, 1000);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.busy;
  }

  /** Runs due jobs until none are left (or `max` have run). Returns how many ran. */
  async drain(max = 500): Promise<number> {
    let ran = 0;
    trace('drain begins');
    while (ran < max && !this.stopping) {
      await this.jobs.recoverStuck();
      const batch = await this.jobs.claim(this.env.MEDIA_WORKER_CONCURRENCY);
      if (batch.length === 0) break;
      await Promise.all(batch.map((job) => this.runOne(job)));
      ran += batch.length;
    }
    trace(`drain ends after ${ran} job(s)`);
    return ran;
  }

  private async runOne(job: MediaJob): Promise<void> {
    const started = Date.now();
    trace(
      `start ${job.type} job=${job.id.slice(-6)} asset=${job.assetId.slice(-6)} try=${job.attempts}`,
    );
    try {
      await this.processor.process(job);
      await this.jobs.succeed(job.id);
      trace(`done  ${job.type} job=${job.id.slice(-6)} in ${Date.now() - started}ms`);
    } catch (error) {
      trace(
        `threw ${job.type} job=${job.id.slice(-6)} after ${Date.now() - started}ms: ${(error as Error).message}`,
      );
      if (error instanceof Deferred) {
        await this.jobs.defer(job, error.seconds);
        return;
      }
      const permanent =
        error instanceof Rejected || (error instanceof MediaToolError && error.permanent);
      const outcome = await this.jobs.fail(job, (error as Error).message, permanent);
      this.logger.warn(`Job ${job.id} (${job.type}) ${outcome}: ${(error as Error).message}`);
      if (outcome === 'failed') {
        await this.processor
          .onGivenUp(job, error)
          .catch((e: Error) => this.logger.error(`could not record failure: ${e.message}`));
      }
    }
  }
}
