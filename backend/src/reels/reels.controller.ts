import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Publishes } from '../common/decorators/route-metadata.js';
import type { AuthContext } from '../common/http/request.js';
import { PURPOSE_RULES } from '../media/media-policy.js';
import {
  CreateReelDto,
  MAX_CLIPS,
  MAX_REEL_MS,
  MIN_CLIP_MS,
  MIN_REEL_MS,
  PHOTO_DEFAULT_MS,
  PHOTO_MAX_MS,
  PHOTO_MIN_MS,
  UpdateReelDto,
} from './reels.dto.js';
import { ReelsService } from './reels.service.js';

const MiB = 1024 * 1024;

@ApiTags('reels')
@ApiBearerAuth('user')
@Controller()
export class ReelsController {
  constructor(private readonly reels: ReelsService) {}

  @Get('creator/reel-config')
  @ApiOperation({
    summary: 'The limits the reel editor works within',
    description:
      'Read from the same constants the server enforces when a reel is made, so the editor can never offer more than will be accepted. Lengths are in milliseconds unless the name says seconds; sizes are in megabytes.',
  })
  config() {
    const clip = PURPOSE_RULES.REEL_CLIP;
    const video = clip?.VIDEO;
    const photo = clip?.IMAGE;
    const longestSeconds = Math.floor(MAX_REEL_MS / 1000);
    return {
      maxDurationSeconds: longestSeconds,
      minDurationMs: MIN_REEL_MS,
      // Choices the editor may offer for "how long should this reel be", never beyond the maximum.
      durationOptionsSeconds: [15, 30, 60, 90, 180].filter((s) => s <= longestSeconds),
      defaultLimitSeconds: 30,
      maxClips: MAX_CLIPS,
      minClipDurationMs: MIN_CLIP_MS,
      defaultPhotoDurationMs: PHOTO_DEFAULT_MS,
      minPhotoDurationMs: PHOTO_MIN_MS,
      maxPhotoDurationMs: PHOTO_MAX_MS,
      maxVideoSizeMb: Math.floor((video?.maxBytes ?? 0) / MiB),
      maxVideoDurationMs: video?.maxDurationMs ?? MAX_REEL_MS,
      maxPhotoSizeMb: Math.floor((photo?.maxBytes ?? 0) / MiB),
      videoTypes: [...(video?.mimes ?? [])],
      photoTypes: [...(photo?.mimes ?? [])],
      captionMaxLength: 2200,
    };
  }

  @Publishes()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('reels')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'A unique value per attempt (8-100 of A-Z a-z 0-9 _ -). A retry with the same key returns the first answer instead of making a second reel.',
  })
  @ApiOperation({
    summary: 'Make a reel from clips you uploaded',
    description:
      'Upload each clip or photo first (`purpose: REEL_CLIP`), wait until it is being processed, then send the edit: which parts, in what order, with which filter, adjustments and transition, over which music. The server renders the video itself and queues it; poll `GET /reels/{id}` and watch `status.publish` (`PROCESSING`, `MODERATION`, `PUBLISHED`, `FAILED`, `REMOVED`). Hashtags and mentions are read from the caption. Reach level, counters, moderation state, location and the finished file are never accepted from the client. Music is checked against your country and its licence.',
  })
  create(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreateReelDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.reels.create(user.userId, dto, idempotencyKey);
  }

  @Patch('reels/:id')
  @ApiOperation({
    summary: 'Edit your reel',
    description:
      'Caption, visibility, label and the comment/remix/share switches. The video and its sound cannot change. An edit that trips the screen sends a published reel back to review.',
  })
  update(
    @CurrentUser() user: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateReelDto,
  ) {
    return this.reels.update(user.userId, id, dto);
  }

  @Delete('reels/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete your reel' })
  async remove(
    @CurrentUser() user: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.reels.remove(user.userId, id);
  }

  @Get('audios/:id')
  @ApiOperation({
    summary: 'A creator’s original sound',
    description:
      'Visible while you can see the reel it came from. Use `reusedAudioId` when making a reel to reuse it.',
  })
  audio(@CurrentUser() user: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.reels.getAudio(user.userId, id);
  }
}
