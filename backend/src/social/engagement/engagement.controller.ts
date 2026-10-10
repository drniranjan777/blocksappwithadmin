import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEnum } from 'class-validator';
import { CurrentUser } from '../../common/decorators/route-metadata.js';
import type { AuthContext } from '../../common/http/request.js';
import { PageQueryDto } from '../../common/pagination/page-query.dto.js';
import { EngagementService } from './engagement.service.js';

class ShareDto {
  @IsEnum(['LINK', 'MESSAGE', 'EXTERNAL'])
  channel!: 'LINK' | 'MESSAGE' | 'EXTERNAL';
}

const TAP = { default: { limit: 120, ttl: 60_000 } };

/** Likes, saves and shares for posts and reels: the same behaviour on both. */
@ApiTags('engagement')
@ApiBearerAuth('user')
@Controller()
export class EngagementController {
  constructor(private readonly engagement: EngagementService) {}

  // --- posts -----------------------------------------------------------------------

  @Throttle(TAP)
  @Post('posts/:id/like')
  @HttpCode(200)
  @ApiOperation({ summary: 'Like a post (idempotent)' })
  likePost(@CurrentUser() u: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.engagement.like(u.userId, { kind: 'post', id });
  }

  @Delete('posts/:id/like')
  @ApiOperation({ summary: 'Take back a like' })
  unlikePost(@CurrentUser() u: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.engagement.unlike(u.userId, { kind: 'post', id });
  }

  @Throttle(TAP)
  @Post('posts/:id/save')
  @HttpCode(200)
  @ApiOperation({ summary: 'Save a post for later (idempotent)' })
  savePost(@CurrentUser() u: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.engagement.save(u.userId, { kind: 'post', id });
  }

  @Delete('posts/:id/save')
  @ApiOperation({ summary: 'Remove a post from saved' })
  unsavePost(@CurrentUser() u: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.engagement.unsave(u.userId, { kind: 'post', id });
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('posts/:id/share')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Record a share and get the link',
    description:
      'A person’s share of the same post counts once a day. `url` is null when the post is not public.',
  })
  sharePost(
    @CurrentUser() u: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ShareDto,
  ) {
    return this.engagement.share(u.userId, { kind: 'post', id }, dto.channel);
  }

  // --- reels -----------------------------------------------------------------------

  @Throttle(TAP)
  @Post('reels/:id/like')
  @HttpCode(200)
  @ApiOperation({ summary: 'Like a reel (idempotent)' })
  likeReel(@CurrentUser() u: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.engagement.like(u.userId, { kind: 'reel', id });
  }

  @Delete('reels/:id/like')
  @ApiOperation({ summary: 'Take back a like on a reel' })
  unlikeReel(@CurrentUser() u: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.engagement.unlike(u.userId, { kind: 'reel', id });
  }

  @Throttle(TAP)
  @Post('reels/:id/save')
  @HttpCode(200)
  @ApiOperation({ summary: 'Save a reel (idempotent)' })
  saveReel(@CurrentUser() u: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.engagement.save(u.userId, { kind: 'reel', id });
  }

  @Delete('reels/:id/save')
  @ApiOperation({ summary: 'Remove a reel from saved' })
  unsaveReel(@CurrentUser() u: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.engagement.unsave(u.userId, { kind: 'reel', id });
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('reels/:id/share')
  @HttpCode(200)
  @ApiOperation({ summary: 'Record a share of a reel and get the link' })
  shareReel(
    @CurrentUser() u: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ShareDto,
  ) {
    return this.engagement.share(u.userId, { kind: 'reel', id }, dto.channel);
  }

  // --- saved -----------------------------------------------------------------------

  @Get('users/me/saved')
  @ApiOperation({ summary: 'Posts and reels I saved, newest first (only those I can still see)' })
  saved(@CurrentUser() u: AuthContext, @Query() q: PageQueryDto) {
    return this.engagement.saved(u.userId, q);
  }
}
