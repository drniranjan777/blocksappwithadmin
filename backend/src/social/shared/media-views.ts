import { Inject, Injectable } from '@nestjs/common';
import { hmacHex } from '../../common/crypto/tokens.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { MediaLinks } from '../../media/delivery/media-links.js';

/** One quality of a video or photo. */
export interface MediaVariant {
  profile: string;
  url: string;
  width: number;
  height: number;
  bitrateKbps: number | null;
}

/** What the API shows of a media asset: addresses and dimensions, never storage internals. */
export interface MediaView {
  id: string;
  kind: string;
  /** The default quality to play or show. */
  url: string | null;
  thumbnailUrl: string | null;
  /** A still from a video. */
  posterUrl: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  /** Every quality available, so a client on a poor connection can pick a lighter one. */
  variants: MediaVariant[];
}

/** The columns `MediaViews` needs. Select exactly these wherever media is included. */
export const mediaSelect = {
  id: true,
  kind: true,
  status: true,
  storageKey: true,
  thumbnailKey: true,
  posterKey: true,
  manifestKey: true,
  renditions: true,
  width: true,
  height: true,
  durationMs: true,
} satisfies Prisma.MediaAssetSelect;

export type MediaRow = Prisma.MediaAssetGetPayload<{ select: typeof mediaSelect }>;

/**
 * Turns a stored media asset into the addresses a client may load.
 *
 * Originals live in a private bucket and are never handed out. A client gets links to
 * the processed (re-encoded, metadata-stripped) renditions and thumbnails. Each link is
 * signed and expires (see `MediaLinks`); when a CDN fronts the storage, links go
 * straight to it instead.
 */
export abstract class MediaViews {
  abstract view(asset: MediaRow | null | undefined): MediaView | null;

  /** A signed address for one stored key (a music preview, a cover), or `null` if there is none. */
  abstract link(key: string | null | undefined): string | null;

  avatarUrl(asset: MediaRow | null | undefined): string | null {
    const v = this.view(asset);
    return v ? (v.thumbnailUrl ?? v.url) : null;
  }
}

interface StoredRendition {
  profile?: string;
  key?: string;
  width?: number;
  height?: number;
  bitrateKbps?: number;
}

@Injectable()
export class DefaultMediaViews extends MediaViews {
  private readonly links: MediaLinks;

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
    this.links = new MediaLinks(hmacHex(env.JWT_SECRET, 'blocks:media:link'));
  }

  /** The address for a stored key. */
  link(key: string | null | undefined): string | null {
    if (!key) return null;
    if (this.env.CDN_BASE_URL) return `${this.env.CDN_BASE_URL.replace(/\/$/, '')}/${key}`;
    const { e, s } = this.links.sign(key);
    return `${this.env.PUBLIC_API_URL.replace(/\/$/, '')}/api/v1/media/f/${key}?e=${e}&s=${s}`;
  }

  view(asset: MediaRow | null | undefined): MediaView | null {
    // Only finished media is shown; a half-processed asset has nothing safe to serve.
    if (!asset || asset.status !== 'READY') return null;
    const stored = Array.isArray(asset.renditions) ? (asset.renditions as StoredRendition[]) : [];
    const variants: MediaVariant[] = stored.flatMap((r) => {
      const url = this.link(r.key);
      return url
        ? [
            {
              profile: r.profile ?? 'BALANCED',
              url,
              width: r.width ?? 0,
              height: r.height ?? 0,
              bitrateKbps: r.bitrateKbps ?? null,
            },
          ]
        : [];
    });
    return {
      id: asset.id,
      kind: asset.kind,
      url: this.link(asset.manifestKey) ?? variants[0]?.url ?? null,
      thumbnailUrl: this.link(asset.thumbnailKey ?? asset.posterKey),
      posterUrl: this.link(asset.posterKey),
      width: asset.width,
      height: asset.height,
      durationMs: asset.durationMs,
      variants,
    };
  }
}
