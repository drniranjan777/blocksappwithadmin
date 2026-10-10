import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CurrentUser } from '../../common/decorators/route-metadata.js';
import type { AuthContext } from '../../common/http/request.js';
import { UPLOADABLE_PURPOSES } from '../media-policy.js';
import { UploadsService } from './uploads.service.js';

class StartUploadDto {
  @IsEnum(UPLOADABLE_PURPOSES)
  purpose!: (typeof UPLOADABLE_PURPOSES)[number];

  @IsEnum(['IMAGE', 'VIDEO'])
  kind!: 'IMAGE' | 'VIDEO';

  /** What the file claims to be. It is verified from the file's own bytes after upload. */
  @IsString()
  @Length(3, 100)
  contentType!: string;

  @IsInt()
  @Min(1)
  @Max(2_000_000_000)
  sizeBytes!: number;

  /** For display only; never used in the stored name. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  filename?: string;
}

class PartNumbersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  @Min(1, { each: true })
  partNumbers!: number[];
}

class PartDto {
  @IsInt()
  @Min(1)
  @Max(10_000)
  partNumber!: number;

  @IsString()
  @Length(1, 128)
  etag!: string;
}

class CompleteUploadDto {
  /** Large uploads only: every part with the `ETag` storage returned for it. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => PartDto)
  parts?: PartDto[];
}

/**
 * Uploading photos and videos.
 *
 * 1. `POST /media/uploads` announces the file and gets a signed address.
 * 2. The app sends the bytes **directly to storage** (never through the API).
 * 3. `POST /media/uploads/:id/complete` tells the server it is there; the server
 *    checks the size, then the file goes to processing.
 * 4. `GET /media/:id` shows progress until `ready` is true.
 */
@ApiTags('media')
@ApiBearerAuth('user')
@Controller('media')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('uploads')
  @ApiOperation({
    summary: 'Announce an upload and get a signed address for it',
    description:
      'Only listed purposes, types and sizes are accepted. Small files get one address (`mode: single`); large ones are sent in parts (`mode: multipart`) so an interrupted upload can resume. The file name never becomes part of the stored name.',
  })
  start(@CurrentUser() u: AuthContext, @Body() dto: StartUploadDto) {
    return this.uploads.start(u.userId, dto);
  }

  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Post('uploads/:id/parts')
  @HttpCode(200)
  @ApiOperation({ summary: 'Signed addresses for some parts of a multipart upload' })
  parts(
    @CurrentUser() u: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: PartNumbersDto,
  ) {
    return this.uploads.partAddresses(u.userId, id, dto.partNumbers);
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('uploads/:id/complete')
  @HttpCode(200)
  @ApiOperation({
    summary: 'The bytes are uploaded: check them and start processing',
    description:
      'Safe to call twice. A file whose size differs from what was announced is deleted and refused.',
  })
  complete(
    @CurrentUser() u: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CompleteUploadDto,
  ) {
    return this.uploads.complete(u.userId, id, dto.parts);
  }

  @Delete('uploads/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Cancel an upload that is not finished' })
  async cancel(
    @CurrentUser() u: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.uploads.cancel(u.userId, id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Where a media item is in processing',
    description: 'Poll until `ready` (or a `failureCode` appears). Only the owner can ask.',
  })
  status(@CurrentUser() u: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.uploads.status(u.userId, id);
  }
}
