import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEnum, IsOptional } from 'class-validator';
import { CurrentUser } from '../../common/decorators/route-metadata.js';
import type { AuthContext } from '../../common/http/request.js';
import { PageQueryDto } from '../../common/pagination/page-query.dto.js';
import { BlocksService } from './blocks.service.js';
import { FollowsService } from './follows.service.js';

class BlockListQuery extends PageQueryDto {
  @IsOptional()
  @IsEnum(['BLOCK', 'MUTE'])
  kind?: 'BLOCK' | 'MUTE';
}

const WRITE = { default: { limit: 60, ttl: 60_000 } };

@ApiTags('follows')
@ApiBearerAuth('user')
@Controller()
export class FollowsController {
  constructor(
    private readonly follows: FollowsService,
    private readonly blocks: BlocksService,
  ) {}

  // --- following ---------------------------------------------------------------

  @Throttle(WRITE)
  @Post('users/:id/follow')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Follow someone',
    description:
      'Idempotent. Following a private account sends a request (`REQUESTED`) until they approve. Blocked people cannot be followed.',
  })
  follow(@CurrentUser() user: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.follows.follow(user.userId, id);
  }

  @Throttle(WRITE)
  @Delete('users/:id/follow')
  @ApiOperation({ summary: 'Unfollow, or withdraw a follow request' })
  unfollow(@CurrentUser() user: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.follows.unfollow(user.userId, id);
  }

  @Get('profiles/:ref/followers')
  @ApiOperation({ summary: 'Who follows this person (cursor-paginated)' })
  followers(@CurrentUser() user: AuthContext, @Param('ref') ref: string, @Query() q: PageQueryDto) {
    return this.follows.list(user.userId, ref, 'followers', q);
  }

  @Get('profiles/:ref/following')
  @ApiOperation({ summary: 'Who this person follows (cursor-paginated)' })
  following(@CurrentUser() user: AuthContext, @Param('ref') ref: string, @Query() q: PageQueryDto) {
    return this.follows.list(user.userId, ref, 'following', q);
  }

  // --- requests to follow me ------------------------------------------------------

  @Get('users/me/follow-requests')
  @ApiOperation({ summary: 'People waiting for me to approve them' })
  requests(@CurrentUser() user: AuthContext, @Query() q: PageQueryDto) {
    return this.follows.requests(user.userId, q);
  }

  @Post('users/me/follow-requests/:userId/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve a follow request' })
  approve(@CurrentUser() user: AuthContext, @Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.follows.approve(user.userId, userId);
  }

  @Post('users/me/follow-requests/:userId/decline')
  @HttpCode(204)
  @ApiOperation({ summary: 'Decline a follow request' })
  async decline(
    @CurrentUser() user: AuthContext,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ): Promise<void> {
    await this.follows.decline(user.userId, userId);
  }

  @Delete('users/me/followers/:userId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a follower (they are not told)' })
  async removeFollower(
    @CurrentUser() user: AuthContext,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ): Promise<void> {
    await this.follows.removeFollower(user.userId, userId);
  }

  // --- close friends --------------------------------------------------------------

  @Get('users/me/close-friends')
  @ApiOperation({ summary: 'Followers I marked as close friends' })
  closeFriends(@CurrentUser() user: AuthContext, @Query() q: PageQueryDto) {
    return this.follows.closeFriends(user.userId, q);
  }

  @Put('users/me/close-friends/:userId')
  @ApiOperation({ summary: 'Add a follower to my close friends' })
  addCloseFriend(
    @CurrentUser() user: AuthContext,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.follows.setCloseFriend(user.userId, userId, true);
  }

  @Delete('users/me/close-friends/:userId')
  @ApiOperation({ summary: 'Remove someone from my close friends' })
  removeCloseFriend(
    @CurrentUser() user: AuthContext,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.follows.setCloseFriend(user.userId, userId, false);
  }

  // --- blocking and muting ----------------------------------------------------------

  @Throttle(WRITE)
  @Post('users/:id/block')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Block someone',
    description:
      'Silent and mutual in effect: neither can see the other, and any follow between them is removed.',
  })
  block(@CurrentUser() user: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.blocks.block(user.userId, id);
  }

  @Delete('users/:id/block')
  @HttpCode(204)
  @ApiOperation({ summary: 'Unblock' })
  async unblock(
    @CurrentUser() user: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.blocks.unblock(user.userId, id);
  }

  @Throttle(WRITE)
  @Post('users/:id/mute')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mute someone: stop seeing them in feeds, silently' })
  mute(@CurrentUser() user: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.blocks.mute(user.userId, id);
  }

  @Delete('users/:id/mute')
  @HttpCode(204)
  @ApiOperation({ summary: 'Unmute' })
  async unmute(
    @CurrentUser() user: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.blocks.unmute(user.userId, id);
  }

  @Get('users/me/blocks')
  @ApiOperation({ summary: 'People I blocked (or, with kind=MUTE, muted)' })
  blocked(@CurrentUser() user: AuthContext, @Query() q: BlockListQuery) {
    return this.blocks.list(user.userId, q.kind ?? 'BLOCK', q);
  }
}
