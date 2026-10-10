import {
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public, RawResponse } from '../../common/decorators/route-metadata.js';
import { Errors } from '../../common/errors/app-error.js';
import { sendFile } from '../delivery/media-files.controller.js';
import { LocalObjectStorage, UploadRejected } from './local-object-storage.js';
import { ObjectStorage } from './object-storage.js';

/**
 * Stands in for a bucket during development: accepts uploads to, and serves
 * downloads from, the local disk. The address in each request is a signed,
 * expiring token (so these routes need no sign-in; the token *is* the permission).
 *
 * With `STORAGE_DRIVER=s3` none of this exists: the routes answer "not found".
 */
@ApiExcludeController()
@Public()
@Controller('media')
export class LocalStorageController {
  private readonly local: LocalObjectStorage | null;

  constructor(storage: ObjectStorage) {
    this.local = storage instanceof LocalObjectStorage ? storage : null;
  }

  @Throttle({ default: { limit: 1200, ttl: 60_000 } })
  @Put('local-upload/:token')
  @RawResponse()
  @HttpCode(200)
  async upload(
    @Param('token') token: string,
    @Headers('content-type') contentType: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    if (!this.local) throw new NotFoundException();
    try {
      const { etag } = await this.local.acceptUpload(token, req, contentType);
      res.setHeader('ETag', `"${etag}"`);
      res.setHeader('Access-Control-Expose-Headers', 'ETag');
    } catch (error) {
      if (!(error instanceof UploadRejected)) throw error;
      if (error.reason === 'bad_token' || error.reason === 'expired')
        throw Errors.forbidden('This upload address is not valid.');
      if (error.reason === 'wrong_size')
        throw Errors.badRequest(
          'VALIDATION_FAILED',
          'The upload is not the size that was approved.',
        );
      if (error.reason === 'wrong_type')
        throw Errors.unsupportedMedia('The upload is not the type that was approved.');
      throw Errors.internal();
    }
  }

  @Throttle({ default: { limit: 1200, ttl: 60_000 } })
  @Get('local-download/:token')
  @RawResponse()
  async download(
    @Param('token') token: string,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.local) throw new NotFoundException();
    let file: Awaited<ReturnType<LocalObjectStorage['resolveDownload']>>;
    try {
      file = await this.local.resolveDownload(token);
    } catch (error) {
      if (error instanceof UploadRejected && error.reason === 'io') throw new NotFoundException();
      throw Errors.forbidden('This address is not valid.');
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=300');
    await sendFile(res, file, range);
  }
}
