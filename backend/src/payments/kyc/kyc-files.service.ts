import { Inject, Injectable } from '@nestjs/common';
import { Errors } from '../../common/errors/app-error.js';
import { uuidv7 } from '../../common/ids.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import { SNIFF_BYTES, sniffMime } from '../../media/processing/sniff.js';
import { ObjectStorage, type PresignedRequest } from '../../media/storage/object-storage.js';
import { KYC_BUCKET } from '../../media/storage/storage.module.js';

const MIMES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
const MAX_BYTES = 8 * 1024 * 1024;
/** Scans one person may announce in a day: enough for a business case, too few to fill the bucket. */
const MAX_SCANS_PER_DAY = 30;

/**
 * Identity document scans.
 *
 * They live in a **separate private bucket**, under a key the server chose (never the person's
 * filename), and there is no route that serves them: the only way to see one is a two-minute
 * signed address handed to a named staff member with the `kyc.documents.view` permission, and
 * each such view is written to the sensitive audit trail. What arrives is checked by its real
 * file type, not the one declared, and anything else is deleted on the spot.
 */
@Injectable()
export class KycFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorage,
    @Inject(ENV) private readonly env: Env,
    @Inject(KYC_BUCKET) private readonly bucket: string,
  ) {}

  /** Announces a scan and returns the address to send it to. */
  async presign(userId: string, contentType: string, sizeBytes: number) {
    const mime = contentType.trim().toLowerCase();
    if (!(MIMES as readonly string[]).includes(mime)) {
      throw Errors.unsupportedMedia('Upload a PDF, JPEG or PNG.', { allowed: MIMES });
    }
    if (!Number.isInteger(sizeBytes) || sizeBytes < 1) {
      throw Errors.validation([{ field: 'sizeBytes', reasons: ['invalid'] }]);
    }
    if (sizeBytes > MAX_BYTES)
      throw Errors.tooLarge('That file is larger than allowed.', { maxBytes: MAX_BYTES });

    const today = await this.prisma.mediaAsset.count({
      where: {
        ownerId: userId,
        purpose: 'KYC_DOCUMENT',
        createdAt: { gt: new Date(Date.now() - 24 * 3_600_000) },
      },
    });
    if (today >= MAX_SCANS_PER_DAY) throw Errors.rateLimited(3600);

    const id = uuidv7();
    const key = `kyc/${userId}/${id}`;
    await this.prisma.mediaAsset.create({
      data: {
        id,
        ownerId: userId,
        kind: 'DOCUMENT',
        purpose: 'KYC_DOCUMENT',
        status: 'PENDING_UPLOAD',
        bucket: this.bucket,
        storageKey: key,
        declaredMime: mime,
        declaredSizeBytes: sizeBytes,
      },
    });
    const upload: PresignedRequest = await this.storage.presignUpload({
      bucket: this.bucket,
      key,
      contentType: mime,
      sizeBytes,
      ttlSeconds: this.env.UPLOAD_URL_TTL_SECONDS,
    });
    return { fileId: id, upload };
  }

  /** Checks what arrived is really a PDF or image of the announced size. */
  async complete(userId: string, fileId: string) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: fileId, ownerId: userId, purpose: 'KYC_DOCUMENT', deletedAt: null },
    });
    if (!asset) throw Errors.notFound('Document');
    if (asset.status === 'READY') return { fileId, ready: true };
    const info = await this.storage.head(asset.bucket, asset.storageKey);
    if (!info) throw Errors.conflict('Nothing has been uploaded yet.');

    const reject = async (reason: string): Promise<never> => {
      await this.storage.delete(asset.bucket, asset.storageKey).catch(() => undefined);
      await this.prisma.mediaAsset.update({
        where: { id: asset.id },
        data: { status: 'REJECTED', failureCode: 'UNSUPPORTED_FORMAT', deletedAt: new Date() },
      });
      throw Errors.validation([{ field: 'file', reasons: [reason] }]);
    };
    if (info.sizeBytes > MAX_BYTES || info.sizeBytes !== asset.declaredSizeBytes)
      return reject('wrong_size');
    const mime = await sniffMime(
      await this.storage.readRange(asset.bucket, asset.storageKey, 0, SNIFF_BYTES - 1),
    );
    if (!mime || !(MIMES as readonly string[]).includes(mime)) return reject('unsupported_file');

    await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        status: 'READY',
        detectedMime: mime,
        sizeBytes: info.sizeBytes,
        uploadedAt: new Date(),
        processedAt: new Date(),
      },
    });
    return { fileId, ready: true };
  }

  /** A two-minute address to one scan, for a named staff member. The caller records the access. */
  async viewUrl(assetId: string): Promise<string> {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: assetId, purpose: 'KYC_DOCUMENT', status: 'READY', deletedAt: null },
    });
    if (!asset) throw Errors.notFound('Document');
    return this.storage.presignDownload(asset.bucket, asset.storageKey, 120);
  }

  async remove(assetId: string): Promise<void> {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: assetId } });
    if (!asset) return;
    await this.storage.delete(asset.bucket, asset.storageKey).catch(() => undefined);
    await this.prisma.mediaAsset.update({
      where: { id: assetId },
      data: { status: 'DELETED', deletedAt: new Date() },
    });
  }
}
