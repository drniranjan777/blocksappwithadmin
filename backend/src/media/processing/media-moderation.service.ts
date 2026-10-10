import { Injectable, Logger } from '@nestjs/common';
import { Errors } from '../../common/errors/app-error.js';
import { PrismaService } from '../../database/prisma.service.js';
import { ContentReleaseService } from './content-release.service.js';
import { MediaFilesService } from './media-files.service.js';

/**
 * The outcome of looking at a piece of media, applied in one place whoever decided:
 * the automated check, or a moderator.
 *
 *   APPROVE  it may be shown; anything waiting on it is released
 *   REJECT   it is removed for good (its files are deleted) and anything using it is
 *            taken down and its author told
 */
@Injectable()
export class MediaModerationService {
  private readonly logger = new Logger('MediaModeration');

  constructor(
    private readonly prisma: PrismaService,
    private readonly files: MediaFilesService,
    private readonly release: ContentReleaseService,
  ) {}

  async decide(
    assetId: string,
    decision: 'APPROVE' | 'REJECT',
    detail: { labels?: string[]; by?: string } = {},
  ): Promise<void> {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: assetId } });
    if (!asset || asset.status === 'DELETED') throw Errors.notFound('Media');
    if (asset.status !== 'READY' && decision === 'APPROVE') {
      throw Errors.conflict('That media is not ready, so it cannot be approved yet.');
    }

    if (decision === 'APPROVE') {
      await this.prisma.mediaAsset.update({
        where: { id: assetId },
        data: { moderationStatus: 'APPROVED' },
      });
    } else {
      const updated = await this.prisma.mediaAsset.update({
        where: { id: assetId },
        data: {
          status: 'REJECTED',
          moderationStatus: 'REMOVED',
          failureCode: 'MODERATION_REJECTED',
          failureDetail: detail.labels?.join(',').slice(0, 500) || null,
        },
      });
      await this.files.removeAll(updated);
    }
    this.logger.log(`Asset ${assetId} ${decision}${detail.by ? ` by ${detail.by}` : ''}`);
    await this.release.onAssetModerated(assetId);
  }
}
