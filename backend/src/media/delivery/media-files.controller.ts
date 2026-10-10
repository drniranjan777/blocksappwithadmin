import {
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { hmacHex } from '../../common/crypto/tokens.js';
import { Public, RawResponse } from '../../common/decorators/route-metadata.js';
import { Errors } from '../../common/errors/app-error.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { LocalObjectStorage } from '../storage/local-object-storage.js';
import { ObjectStorage } from '../storage/object-storage.js';
import { MEDIA_BUCKET } from '../storage/storage.module.js';
import { MediaLinks } from './media-links.js';

/**
 * Only processed output is ever served, and only from here. Originals (`orig/`), the full
 * copy of a track, licence documents and KYC files are not reachable. A track's 30-second
 * preview and its cover are the only music files that are.
 */
const SERVED =
  /^(pub\/[0-9a-f-]{36}\/[A-Za-z0-9_.-]{1,80}|music\/[0-9a-f-]{36}\/(preview\.m4a|cover\.jpg))$/;
const INLINE = /^(image\/(jpeg|png|webp)|video\/(mp4|webm|quicktime|3gpp)|audio\/(mpeg|mp4|aac))$/;

/**
 * Where a media link ends up. The link was signed by the API (see `MediaLinks`), so it
 * proves nothing more than "the API handed this address out recently": no sign-in is
 * needed, which lets image widgets and video players load it directly.
 *
 * Only keys under `pub/` (processed renditions) are served. An original, a KYC
 * document or anything else cannot be reached through here even with a valid
 * signature for it, because the path itself is checked before the signature matters.
 */
@ApiExcludeController()
@Public()
@Controller('media')
export class MediaFilesController {
  private readonly links: MediaLinks;

  constructor(
    private readonly storage: ObjectStorage,
    @Inject(ENV) env: Env,
    @Inject(MEDIA_BUCKET) private readonly bucket: string,
  ) {
    this.links = new MediaLinks(hmacHex(env.JWT_SECRET, 'blocks:media:link'));
  }

  @Throttle({ default: { limit: 1200, ttl: 60_000 } })
  @Get('f/*path')
  @RawResponse()
  async file(
    @Param('path') segments: string[] | string,
    @Query('e') e: string | undefined,
    @Query('s') s: string | undefined,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const key = Array.isArray(segments) ? segments.join('/') : segments;
    if (!SERVED.test(key)) throw new NotFoundException();
    if (!this.links.verify(key, e, s))
      throw Errors.forbidden('This link is not valid or has expired.');

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    // The link is stable for hours, so the file may be cached for as long.
    res.setHeader('Cache-Control', 'private, max-age=3600');

    if (this.storage instanceof LocalObjectStorage) {
      const info = await this.storage.head(this.bucket, key);
      if (!info) throw new NotFoundException();
      const file = {
        path: this.storage.pathOf(this.bucket, key),
        contentType: info.contentType ?? 'application/octet-stream',
        sizeBytes: info.sizeBytes,
      };
      await sendFile(res, file, range);
      return;
    }
    // A real bucket: hand the client a short-lived address straight to it.
    res.redirect(302, await this.storage.presignDownload(this.bucket, key, 300));
  }
}

export async function sendFile(
  res: Response,
  file: { path: string; contentType: string; sizeBytes: number },
  range: string | undefined,
): Promise<void> {
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Disposition', INLINE.test(file.contentType) ? 'inline' : 'attachment');
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  let start = 0;
  let end = file.sizeBytes - 1;
  if (m && (m[1] !== '' || m[2] !== '')) {
    if (m[1] === '') start = Math.max(0, file.sizeBytes - Number(m[2]));
    else {
      start = Number(m[1]);
      if (m[2] !== '') end = Math.min(Number(m[2]), end);
    }
    if (start > end || start >= file.sizeBytes) {
      res.status(416).setHeader('Content-Range', `bytes */${file.sizeBytes}`).end();
      return;
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${file.sizeBytes}`);
  }
  res.setHeader('Content-Length', String(end - start + 1));
  await pipeline(createReadStream(file.path, { start, end }), res);
}
