import { Injectable } from '@nestjs/common';
import type { MediaAsset } from '../../generated/prisma/client.js';
import { ObjectStorage } from '../storage/object-storage.js';

/** Removes an asset's stored files: the original and everything made from it. */
@Injectable()
export class MediaFilesService {
  constructor(private readonly storage: ObjectStorage) {}

  keysOf(asset: MediaAsset): string[] {
    const keys = new Set<string>([asset.storageKey]);
    for (const k of [asset.thumbnailKey, asset.posterKey, asset.manifestKey]) if (k) keys.add(k);
    if (Array.isArray(asset.renditions)) {
      for (const r of asset.renditions as Array<{ key?: string }>) if (r.key) keys.add(r.key);
    }
    return [...keys];
  }

  async removeAll(asset: MediaAsset): Promise<void> {
    for (const key of this.keysOf(asset))
      await this.storage.delete(asset.bucket, key).catch(() => undefined);
  }

  /** Only the original (processed copies stay): once it is past its retention it has no further use. */
  async removeOriginal(asset: MediaAsset): Promise<void> {
    await this.storage.delete(asset.bucket, asset.storageKey).catch(() => undefined);
  }
}
