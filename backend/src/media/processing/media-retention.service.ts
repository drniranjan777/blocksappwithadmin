import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { MediaFilesService } from './media-files.service.js';

/**
 * How long originals are kept. The re-encoded copies are what people see; the
 * original is only kept for a while in case it has to be processed again (a better
 * encoder, a bug fixed), then removed, so storage does not fill with files nobody
 * will ever open, and so a removal request is honoured in a bounded time.
 */
@Injectable()
export class MediaRetentionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: MediaFilesService,
  ) {}

  /** Deletes originals whose retention has passed. Returns how many. */
  async purgeOriginals(limit = 100): Promise<number> {
    const due = await this.prisma.mediaAsset.findMany({
      where: { deleteAfter: { lte: new Date() }, status: 'READY' },
      take: limit,
    });
    for (const asset of due) {
      await this.files.removeOriginal(asset);
      // Cleared so it is not looked at again; the processed copies stay.
      await this.prisma.mediaAsset.update({ where: { id: asset.id }, data: { deleteAfter: null } });
    }
    return due.length;
  }
}
