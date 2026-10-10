import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { MediaJob, MediaJobType, Prisma } from '../../generated/prisma/client.js';

/** Seconds to wait before attempt N+1 (index = attempts already made). */
const BACKOFF_SECONDS = [30, 120, 600];

export interface EnqueueOptions {
  payload?: Prisma.InputJsonValue;
  runAfter?: Date;
  maxAttempts?: number;
}

/**
 * The media work queue, kept in PostgreSQL.
 *
 * Jobs are rows. A worker claims the next due ones with `FOR UPDATE SKIP LOCKED`, so
 * any number of API processes can work the queue at once and no job is taken twice.
 * A job that dies with its process is noticed (`recoverStuck`) and retried. Because
 * the queue *is* the durable record, staff can see exactly what failed and why, and
 * nothing is lost if Redis is down. (Redis/BullMQ can take over the hot path later
 * for very high volume; these rows would remain the record of truth.)
 */
@Injectable()
export class MediaJobsService {
  constructor(private readonly prisma: PrismaService) {}

  enqueue(assetId: string, type: MediaJobType, options: EnqueueOptions = {}): Promise<MediaJob> {
    return this.prisma.mediaJob.create({
      data: {
        assetId,
        type,
        maxAttempts: options.maxAttempts ?? 3,
        ...(options.runAfter ? { runAfter: options.runAfter } : {}),
        ...(options.payload === undefined ? {} : { payload: options.payload }),
      },
    });
  }

  /** Takes up to `limit` due jobs, marks them running, and returns them. */
  async claim(limit: number): Promise<MediaJob[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE media_jobs
         SET status = 'RUNNING', attempts = attempts + 1, started_at = now()
       WHERE id IN (
         SELECT id FROM media_jobs
          WHERE status IN ('QUEUED', 'RETRYING') AND run_after <= now()
          ORDER BY run_after, queued_at
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED)
      RETURNING id`;
    if (rows.length === 0) return [];
    return this.prisma.mediaJob.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      orderBy: { queuedAt: 'asc' },
    });
  }

  async succeed(id: string): Promise<void> {
    await this.prisma.mediaJob.update({
      where: { id },
      data: { status: 'SUCCEEDED', finishedAt: new Date(), lastError: null },
    });
  }

  /**
   * Puts a job back to run again in `seconds` without counting this run as an attempt. For work
   * that is waiting on something else, not work that went wrong.
   */
  async defer(job: MediaJob, seconds: number): Promise<void> {
    await this.prisma.mediaJob.update({
      where: { id: job.id },
      data: {
        status: 'RETRYING',
        attempts: Math.max(0, job.attempts - 1),
        runAfter: new Date(Date.now() + seconds * 1000),
      },
    });
  }

  /**
   * Records a failure. A permanent one (the file is not a video, say) ends the job; a
   * transient one retries with growing delays until the attempts run out.
   */
  async fail(job: MediaJob, error: string, permanent: boolean): Promise<'retrying' | 'failed'> {
    const message = error.slice(0, 1000);
    if (permanent || job.attempts >= job.maxAttempts) {
      await this.prisma.mediaJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', finishedAt: new Date(), lastError: message },
      });
      return 'failed';
    }
    const wait = BACKOFF_SECONDS[Math.min(job.attempts - 1, BACKOFF_SECONDS.length - 1)] ?? 600;
    await this.prisma.mediaJob.update({
      where: { id: job.id },
      data: {
        status: 'RETRYING',
        lastError: message,
        runAfter: new Date(Date.now() + wait * 1000),
      },
    });
    return 'retrying';
  }

  /** Jobs that have been "running" far too long belong to a process that died. */
  async recoverStuck(olderThanMinutes = 20): Promise<number> {
    const res = await this.prisma.mediaJob.updateMany({
      where: {
        status: 'RUNNING',
        startedAt: { lt: new Date(Date.now() - olderThanMinutes * 60_000) },
      },
      data: {
        status: 'RETRYING',
        runAfter: new Date(),
        lastError: 'worker stopped before finishing',
      },
    });
    return res.count;
  }

  /** Housekeeping: finished jobs are only history after a while. */
  async purgeFinished(olderThanDays = 30): Promise<number> {
    const res = await this.prisma.mediaJob.deleteMany({
      where: {
        status: { in: ['SUCCEEDED', 'CANCELLED'] },
        finishedAt: { lt: new Date(Date.now() - olderThanDays * 86_400_000) },
      },
    });
    return res.count;
  }
}
