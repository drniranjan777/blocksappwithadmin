import { Inject, Injectable, Logger } from '@nestjs/common';
import { Errors, type FieldIssue } from '../../common/errors/app-error.js';
import { uuidv7 } from '../../common/ids.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { MediaAsset, MediaKind, MediaPurpose } from '../../generated/prisma/client.js';
import { cleanLine } from '../../social/shared/text.js';
import { MediaJobsService } from '../jobs/media-jobs.service.js';
import {
  MAX_DAILY_UPLOAD_BYTES,
  MAX_OPEN_UPLOADS,
  PART_SIZE_BYTES,
  SINGLE_UPLOAD_MAX_BYTES,
  extensionFor,
  ruleFor,
} from '../media-policy.js';
import { ObjectStorage, type PresignedRequest } from '../storage/object-storage.js';
import { MEDIA_BUCKET } from '../storage/storage.module.js';

export interface StartUploadInput {
  purpose: MediaPurpose;
  kind: MediaKind;
  contentType: string;
  sizeBytes: number;
  filename?: string | undefined;
}

export type StartedUpload =
  | {
      assetId: string;
      sessionId: string;
      expiresAt: string;
      mode: 'single';
      upload: PresignedRequest;
    }
  | {
      assetId: string;
      sessionId: string;
      expiresAt: string;
      mode: 'multipart';
      multipart: { partSizeBytes: number; partCount: number };
    };

/** What an owner sees about their own upload. Never the storage key or bucket. */
export function toOwnerView(a: MediaAsset) {
  return {
    id: a.id,
    kind: a.kind,
    purpose: a.purpose,
    status: a.status,
    ready: a.status === 'READY',
    moderation: a.moderationStatus,
    failureCode: a.failureCode,
    width: a.width,
    height: a.height,
    durationMs: a.durationMs,
    createdAt: a.createdAt.toISOString(),
  };
}

/**
 * The life of an upload: announce, send directly to storage, finish.
 *
 * The API never touches the file's bytes. It decides whether the upload may happen
 * (allowed type, size, quota), hands out a signed address that works for exactly
 * that file, and afterwards checks that what arrived is what was announced. Only
 * then does the file enter the processing queue, where its *real* type is checked
 * again from the bytes (a declared type is only a claim).
 */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger('Uploads');

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorage,
    private readonly jobs: MediaJobsService,
    @Inject(ENV) private readonly env: Env,
    @Inject(MEDIA_BUCKET) private readonly bucket: string,
  ) {}

  // ----------------------------------------------------------------- start --

  async start(userId: string, input: StartUploadInput): Promise<StartedUpload> {
    const mime = input.contentType.trim().toLowerCase();
    const rule = ruleFor(input.purpose, input.kind);
    const issues: FieldIssue[] = [];
    if (!rule) issues.push({ field: 'purpose', reasons: ['not_allowed_for_this_kind'] });
    else {
      if (!rule.mimes.includes(mime))
        issues.push({ field: 'contentType', reasons: ['unsupported_type'] });
      if (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 1) {
        issues.push({ field: 'sizeBytes', reasons: ['invalid'] });
      } else if (input.sizeBytes > rule.maxBytes) {
        issues.push({ field: 'sizeBytes', reasons: ['too_large'] });
      }
    }
    if (issues.length || !rule) {
      // A file that is too big has its own status so the app can say "too large".
      if (issues.some((i) => i.reasons.includes('too_large'))) {
        throw Errors.tooLarge('That file is larger than allowed.', {
          maxBytes: rule?.maxBytes,
        });
      }
      if (issues.some((i) => i.reasons.includes('unsupported_type'))) {
        throw Errors.unsupportedMedia('That kind of file cannot be uploaded here.', {
          allowed: rule?.mimes,
        });
      }
      throw Errors.validation(issues);
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { status: true },
    });
    if (user.status !== 'ACTIVE')
      throw Errors.forbidden('Cancel the scheduled account deletion to upload.');

    const since = new Date(Date.now() - 24 * 3_600_000);
    const [open, announced] = await Promise.all([
      this.prisma.uploadSession.count({
        where: { userId, status: 'OPEN', expiresAt: { gt: new Date() } },
      }),
      this.prisma.mediaAsset.aggregate({
        where: { ownerId: userId, createdAt: { gt: since }, status: { not: 'DELETED' } },
        _sum: { declaredSizeBytes: true },
      }),
    ]);
    if (open >= MAX_OPEN_UPLOADS) throw Errors.rateLimited(300);
    if ((announced._sum.declaredSizeBytes ?? 0) + input.sizeBytes > MAX_DAILY_UPLOAD_BYTES) {
      throw Errors.rateLimited(3600);
    }

    const assetId = uuidv7();
    const now = new Date();
    const key = [
      'orig',
      now.getUTCFullYear(),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      `${assetId}.${extensionFor(mime)}`,
    ].join('/');
    const expiresAt = new Date(now.getTime() + this.env.UPLOAD_URL_TTL_SECONDS * 1000);
    const multipart = input.sizeBytes > SINGLE_UPLOAD_MAX_BYTES;
    const partCount = multipart ? Math.ceil(input.sizeBytes / PART_SIZE_BYTES) : 1;

    const filename = input.filename
      ? cleanLine(input.filename).replace(/[\\/]/g, '_').slice(0, 255)
      : null;
    const uploadId = multipart
      ? (await this.storage.createMultipart({ bucket: this.bucket, key, contentType: mime }))
          .uploadId
      : null;

    try {
      const sessionId = uuidv7();
      await this.prisma.mediaAsset.create({
        data: {
          id: assetId,
          ownerId: userId,
          kind: input.kind,
          purpose: input.purpose,
          status: 'PENDING_UPLOAD',
          bucket: this.bucket,
          storageKey: key,
          originalFilename: filename || null,
          declaredMime: mime,
          declaredSizeBytes: input.sizeBytes,
          uploadSession: {
            create: {
              id: sessionId,
              userId,
              status: 'OPEN',
              multipartUploadId: uploadId,
              partSizeBytes: multipart ? PART_SIZE_BYTES : input.sizeBytes,
              totalBytes: input.sizeBytes,
              expiresAt,
            },
          },
        },
      });
      if (multipart) {
        return {
          assetId,
          sessionId,
          expiresAt: expiresAt.toISOString(),
          mode: 'multipart',
          multipart: { partSizeBytes: PART_SIZE_BYTES, partCount },
        };
      }
      const upload = await this.storage.presignUpload({
        bucket: this.bucket,
        key,
        contentType: mime,
        sizeBytes: input.sizeBytes,
        ttlSeconds: this.env.UPLOAD_URL_TTL_SECONDS,
      });
      return { assetId, sessionId, expiresAt: expiresAt.toISOString(), mode: 'single', upload };
    } catch (error) {
      if (uploadId)
        await this.storage
          .abortMultipart({ bucket: this.bucket, key, uploadId })
          .catch(() => undefined);
      throw error;
    }
  }

  // ----------------------------------------------------------------- parts --

  private async openSession(userId: string, sessionId: string) {
    const s = await this.prisma.uploadSession.findFirst({
      where: { id: sessionId, userId },
      include: { asset: true },
    });
    if (!s) throw Errors.notFound('Upload');
    return s;
  }

  /** Signed addresses for some parts of a large upload. */
  async partAddresses(userId: string, sessionId: string, partNumbers: number[]) {
    const s = await this.openSession(userId, sessionId);
    if (s.status !== 'OPEN' || s.expiresAt <= new Date() || !s.multipartUploadId) {
      throw Errors.conflict('That upload is not open.');
    }
    const count = Math.ceil(s.totalBytes / s.partSizeBytes);
    const wanted = [...new Set(partNumbers)];
    if (wanted.some((n) => !Number.isInteger(n) || n < 1 || n > count)) {
      throw Errors.validation([
        { field: 'partNumbers', reasons: [`must_be_between_1_and_${count}`] },
      ]);
    }
    const parts = await Promise.all(
      wanted.map(async (partNumber) => {
        const size =
          partNumber === count ? s.totalBytes - s.partSizeBytes * (count - 1) : s.partSizeBytes;
        const request = await this.storage.presignPart({
          bucket: s.asset.bucket,
          key: s.asset.storageKey,
          uploadId: s.multipartUploadId as string,
          partNumber,
          sizeBytes: size,
          ttlSeconds: Math.max(60, Math.floor((s.expiresAt.getTime() - Date.now()) / 1000)),
        });
        return { partNumber, sizeBytes: size, ...request };
      }),
    );
    return { parts };
  }

  // -------------------------------------------------------------- complete --

  async complete(
    userId: string,
    sessionId: string,
    parts?: Array<{ partNumber: number; etag: string }>,
  ) {
    const s = await this.openSession(userId, sessionId);
    // Finishing twice is fine: the answer is the same.
    if (s.status === 'COMPLETED') return toOwnerView(s.asset);
    if (s.status !== 'OPEN') throw Errors.conflict('That upload is no longer open.');
    if (s.expiresAt <= new Date()) {
      await this.discard(s.id, s.asset, s.multipartUploadId, 'EXPIRED', 'UPLOAD_EXPIRED');
      throw Errors.conflict('That upload has expired. Start again.');
    }

    if (s.multipartUploadId) {
      const count = Math.ceil(s.totalBytes / s.partSizeBytes);
      const given = [...(parts ?? [])].sort((a, b) => a.partNumber - b.partNumber);
      const complete =
        given.length === count &&
        given.every((p, i) => p.partNumber === i + 1 && p.etag.length > 0);
      if (!complete) {
        throw Errors.validation([{ field: 'parts', reasons: [`need_all_${count}_parts`] }]);
      }
      try {
        await this.storage.completeMultipart({
          bucket: s.asset.bucket,
          key: s.asset.storageKey,
          uploadId: s.multipartUploadId,
          parts: given.map((p) => ({ partNumber: p.partNumber, etag: p.etag.replaceAll('"', '') })),
        });
      } catch (error) {
        this.logger.warn(`Could not join parts for ${s.asset.id}: ${(error as Error).message}`);
        throw Errors.conflict(
          'The parts could not be joined. Check that every part was sent, then try again.',
        );
      }
    }

    const info = await this.storage.head(s.asset.bucket, s.asset.storageKey);
    if (!info) throw Errors.conflict('Nothing has been uploaded yet.');
    if (info.sizeBytes !== s.asset.declaredSizeBytes) {
      // What arrived is not what was announced: throw it away.
      await this.storage.delete(s.asset.bucket, s.asset.storageKey).catch(() => undefined);
      await this.discard(s.id, s.asset, null, 'FAILED', 'SIZE_MISMATCH');
      throw Errors.badRequest(
        'VALIDATION_FAILED',
        'The uploaded file is not the size that was announced.',
      );
    }

    const asset = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.uploadSession.updateMany({
        where: { id: s.id, status: 'OPEN' },
        data: { status: 'COMPLETED', completedAt: new Date(), uploadedBytes: info.sizeBytes },
      });
      if (claimed.count === 0) return null; // lost a race with an identical request
      const updated = await tx.mediaAsset.update({
        where: { id: s.asset.id },
        data: { status: 'UPLOADED', uploadedAt: new Date(), sizeBytes: info.sizeBytes },
      });
      await tx.mediaJob.create({ data: { assetId: updated.id, type: 'VALIDATE' } });
      return updated;
    });
    return toOwnerView(
      asset ?? (await this.prisma.mediaAsset.findUniqueOrThrow({ where: { id: s.asset.id } })),
    );
  }

  // ---------------------------------------------------------------- cancel --

  async cancel(userId: string, sessionId: string): Promise<void> {
    const s = await this.openSession(userId, sessionId);
    if (s.status !== 'OPEN') return;
    await this.storage.delete(s.asset.bucket, s.asset.storageKey).catch(() => undefined);
    await this.discard(s.id, s.asset, s.multipartUploadId, 'CANCELLED', null);
  }

  /** Ends a session and its asset, aborting a half-sent multipart upload. */
  private async discard(
    sessionId: string,
    asset: MediaAsset,
    multipartUploadId: string | null,
    sessionStatus: 'EXPIRED' | 'CANCELLED' | 'FAILED',
    failureCode: string | null,
  ): Promise<void> {
    if (multipartUploadId) {
      await this.storage
        .abortMultipart({
          bucket: asset.bucket,
          key: asset.storageKey,
          uploadId: multipartUploadId,
        })
        .catch(() => undefined);
    }
    await this.prisma.$transaction([
      this.prisma.uploadSession.update({
        where: { id: sessionId },
        data: {
          status: sessionStatus,
          ...(sessionStatus === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
        },
      }),
      this.prisma.mediaAsset.update({
        where: { id: asset.id },
        data: {
          status: failureCode === 'SIZE_MISMATCH' ? 'FAILED' : 'DELETED',
          deletedAt: failureCode === 'SIZE_MISMATCH' ? null : new Date(),
          failureCode,
        },
      }),
    ]);
  }

  // ---------------------------------------------------------------- status --

  async status(userId: string, assetId: string) {
    const a = await this.prisma.mediaAsset.findFirst({
      where: { id: assetId, ownerId: userId, status: { not: 'DELETED' } },
    });
    if (!a) throw Errors.notFound('Media');
    return toOwnerView(a);
  }

  // ----------------------------------------------------------- housekeeping --

  /** Uploads nobody finished: close them, and give back what they were holding in storage. */
  async expireStale(limit = 100): Promise<number> {
    const stale = await this.prisma.uploadSession.findMany({
      where: { status: 'OPEN', expiresAt: { lt: new Date() } },
      include: { asset: true },
      take: limit,
    });
    for (const s of stale) {
      await this.storage.delete(s.asset.bucket, s.asset.storageKey).catch(() => undefined);
      await this.discard(s.id, s.asset, s.multipartUploadId, 'EXPIRED', 'UPLOAD_EXPIRED');
    }
    return stale.length;
  }
}
