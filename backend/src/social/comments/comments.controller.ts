import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CurrentUser, Publishes } from '../../common/decorators/route-metadata.js';
import type { AuthContext } from '../../common/http/request.js';
import { PageQueryDto } from '../../common/pagination/page-query.dto.js';
import { CommentsService } from './comments.service.js';

class CreateCommentDto {
  @IsString()
  @MaxLength(1000)
  body!: string;

  /** Reply to this comment. A reply to a reply attaches to the comment above it. */
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

const WRITE = { default: { limit: 30, ttl: 60_000 } };
const KEY_HEADER = {
  name: 'Idempotency-Key',
  required: false,
  description:
    'A unique value per attempt; a retry with the same key returns the first answer instead of commenting twice.',
} as const;

@ApiTags('comments')
@ApiBearerAuth('user')
@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Publishes()
  @Throttle(WRITE)
  @Post('posts/:id/comments')
  @ApiHeader(KEY_HEADER)
  @ApiOperation({ summary: 'Comment on a post, or reply to a comment' })
  commentOnPost(
    @CurrentUser() u: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateCommentDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.comments.create(u.userId, { kind: 'post', id }, dto, key);
  }

  @Get('posts/:id/comments')
  @ApiOperation({ summary: 'Top-level comments on a post, newest first (cursor-paginated)' })
  onPost(
    @CurrentUser() u: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() q: PageQueryDto,
  ) {
    return this.comments.listForTarget(u.userId, { kind: 'post', id }, q);
  }

  @Publishes()
  @Throttle(WRITE)
  @Post('reels/:id/comments')
  @ApiHeader(KEY_HEADER)
  @ApiOperation({ summary: 'Comment on a reel, or reply to a comment' })
  commentOnReel(
    @CurrentUser() u: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateCommentDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.comments.create(u.userId, { kind: 'reel', id }, dto, key);
  }

  @Get('reels/:id/comments')
  @ApiOperation({ summary: 'Top-level comments on a reel, newest first' })
  onReel(
    @CurrentUser() u: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() q: PageQueryDto,
  ) {
    return this.comments.listForTarget(u.userId, { kind: 'reel', id }, q);
  }

  @Get('comments/:id/replies')
  @ApiOperation({ summary: 'Replies to a comment, oldest first' })
  replies(
    @CurrentUser() u: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() q: PageQueryDto,
  ) {
    return this.comments.listReplies(u.userId, id, q);
  }

  @Delete('comments/:id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a comment',
    description:
      'By the person who wrote it or the owner of what it is on. Its replies go with it.',
  })
  async remove(
    @CurrentUser() u: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.comments.remove(u.userId, id);
  }

  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post('comments/:id/like')
  @HttpCode(200)
  @ApiOperation({ summary: 'Like a comment (idempotent)' })
  like(@CurrentUser() u: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.comments.like(u.userId, id);
  }

  @Delete('comments/:id/like')
  @ApiOperation({ summary: 'Take back a like on a comment' })
  unlike(@CurrentUser() u: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.comments.unlike(u.userId, id);
  }
}
