import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../../admin/audit/audit.service.js';
import { Errors } from '../../common/errors/app-error.js';
import type { AdminAuthContext } from '../../common/http/request.js';
import { Page, clampLimit, decodeCursor } from '../../common/pagination/cursor.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { JobStatus, MediaJobType, MediaStatus } from '../../generated/prisma/client.js';
import { MediaViews, mediaSelect } from '../../social/shared/media-views.js';
import { MediaModerationService } from '../processing/media-moderation.service.js';

const cursorSchema = z.object({ t: z.string(), id: z.string() });

interface Meta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

/** What a failed job's asset goes back to, so the pipeline picks up where it left off. */
const RESUME_AS: Partial<Record<MediaJobType, MediaStatus>> = {
  VALIDATE: 'UPLOADED',
  TRANSCODE: 'PROCESSING',
  MODERATE: 'READY',
};

/**
 * The staff view of the media pipeline: what failed, what is waiting for a person to look at, and
 * the decision on it.
 *
 * A decision here goes through exactly the same code as an automated one (`MediaModerationService`),
 * so a post, a reel or a story is released or taken down the same way whoever decided. Deciding
 * needs `content.moderate`; each decision is a recorded, reasoned act.
 */
@Injectable()
export class MediaAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly decisions: MediaModerationService,
    private readonly media: MediaViews,
  ) {}

  async jobs(q: {
    status?: JobStatus | undefined;
    type?: MediaJobType | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
  }) {
    const limit = clampLimit(q.limit);
    const after = decodeCursor(q.cursor, cursorSchema);
    const rows = await this.prisma.mediaJob.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.type ? { type: q.type } : {}),
        ...(after
          ? {
              OR: [
                { queuedAt: { lt: new Date(after.t) } },
                { queuedAt: new Date(after.t), id: { lt: after.id } },
              ],
            }
          : {}),
      },
      include: {
        asset: {
          select: {
            id: true,
            ownerId: true,
            kind: true,
            purpose: true,
            status: true,
            failureCode: true,
          },
        },
      },
      orderBy: [{ queuedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.queuedAt.toISOString(), id: r.id }),
      (r) => ({
        id: r.id,
        type: r.type,
        status: r.status,
        attempts: r.attempts,
        maxAttempts: r.maxAttempts,
        lastError: r.lastError,
        queuedAt: r.queuedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
        asset: r.asset,
      }),
    );
  }

  /** Puts a failed job back in the queue. Not for refused files (they were refused, not broken). */
  async retry(actor: AdminAuthContext, jobId: string, meta: Meta) {
    await this.prisma.$transaction(async (tx) => {
      const job = await tx.mediaJob.findUnique({ where: { id: jobId }, include: { asset: true } });
      if (!job) throw Errors.notFound('Job');
      if (job.status !== 'FAILED') throw Errors.conflict('Only a failed job can be retried.');
      if (job.asset.status === 'REJECTED' || job.asset.status === 'DELETED') {
        throw Errors.conflict('That file was refused or removed; retrying cannot change that.');
      }
      const resumeAs = RESUME_AS[job.type];
      const res = await tx.mediaJob.updateMany({
        where: { id: jobId, status: 'FAILED' },
        data: {
          status: 'QUEUED',
          attempts: 0,
          runAfter: new Date(),
          lastError: null,
          finishedAt: null,
        },
      });
      if (res.count !== 1) throw Errors.conflict('This job was changed by someone else.');
      if (resumeAs) {
        await tx.mediaAsset.update({
          where: { id: job.assetId },
          data: { status: resumeAs, failureCode: null, failureDetail: null },
        });
      }
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'media.job_retried',
          targetType: 'media_job',
          targetId: jobId,
          after: { type: job.type, assetId: job.assetId },
          ...meta,
        },
        tx,
      );
    });
    return { retried: true };
  }

  /** Finished files nobody has cleared yet, oldest first, with links so the reviewer can see them. */
  async reviewQueue(q: { cursor?: string | undefined; limit?: number | undefined }) {
    const limit = clampLimit(q.limit);
    const after = decodeCursor(q.cursor, cursorSchema);
    const rows = await this.prisma.mediaAsset.findMany({
      where: {
        status: 'READY',
        moderationStatus: 'PENDING',
        deletedAt: null,
        ...(after
          ? {
              OR: [
                { processedAt: { gt: new Date(after.t) } },
                { processedAt: new Date(after.t), id: { gt: after.id } },
              ],
            }
          : {}),
      },
      select: { ...mediaSelect, ownerId: true, purpose: true, processedAt: true },
      orderBy: [{ processedAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: (r.processedAt as Date).toISOString(), id: r.id }),
      (r) => ({
        id: r.id,
        ownerId: r.ownerId,
        purpose: r.purpose,
        processedAt: r.processedAt?.toISOString() ?? null,
        media: this.media.view(r),
      }),
    );
  }

  async decide(
    actor: AdminAuthContext,
    assetId: string,
    decision: 'APPROVE' | 'REJECT',
    note: string,
    meta: Meta,
  ) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
      select: { moderationStatus: true, status: true },
    });
    if (!asset) throw Errors.notFound('Media');
    if (asset.moderationStatus !== 'PENDING')
      throw Errors.conflict('That file has already been decided.');
    await this.decisions.decide(assetId, decision, { by: actor.adminId });
    await this.audit.record({
      actorType: 'ADMIN',
      actorId: actor.adminId,
      actorLabel: actor.name,
      action: `media.${decision.toLowerCase()}`,
      targetType: 'media_asset',
      targetId: assetId,
      reason: note,
      before: { moderation: asset.moderationStatus },
      after: { moderation: decision === 'APPROVE' ? 'APPROVED' : 'REMOVED' },
      ...meta,
    });
    return { decided: decision };
  }
}
