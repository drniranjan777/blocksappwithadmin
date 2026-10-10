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
import { CreateReelDto, UpdateReelDto } from './reels.dto.js';
import { ReelsService } from './reels.service.js';

@ApiTags('reels')
@ApiBearerAuth('user')
@Controller()
export class ReelsController {
  constructor(private readonly reels: ReelsService) {}

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
