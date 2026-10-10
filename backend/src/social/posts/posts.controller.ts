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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEnum, IsOptional } from 'class-validator';
import { CurrentUser, Publishes } from '../../common/decorators/route-metadata.js';
import type { AuthContext } from '../../common/http/request.js';
import { PageQueryDto } from '../../common/pagination/page-query.dto.js';
import { CreatePostDto, UpdatePostDto } from './posts.dto.js';
import { PostsService } from './posts.service.js';

class UserPostsQuery extends PageQueryDto {
  @IsOptional()
  @IsEnum(['TEXT', 'PHOTO'])
  type?: 'TEXT' | 'PHOTO';
}

@ApiTags('posts')
@ApiBearerAuth('user')
@Controller()
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Publishes()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('posts')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'A unique value per attempt (8-100 of A-Z a-z 0-9 _ -). A retry with the same key returns the first answer instead of posting twice.',
  })
  @ApiOperation({
    summary: 'Publish a text or photo post',
    description:
      'Hashtags and mentions are read from the caption by the server. Reach level, counters, moderation state and location are never accepted from the client. A post the first-pass screen flags is saved but visible only to you until reviewed (`moderation.held`).',
  })
  create(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreatePostDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.posts.create(user.userId, dto, idempotencyKey);
  }

  @Get('posts/:id')
  @ApiOperation({ summary: 'One post, if you are allowed to see it (otherwise 404)' })
  get(@CurrentUser() user: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.posts.get(user.userId, id);
  }

  @Patch('posts/:id')
  @ApiOperation({
    summary: 'Edit your post',
    description:
      'Caption, visibility, label and the comment/share switches. An edit that trips the screen sends the post back to review.',
  })
  update(
    @CurrentUser() user: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePostDto,
  ) {
    return this.posts.update(user.userId, id, dto);
  }

  @Delete('posts/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete your post' })
  async remove(
    @CurrentUser() user: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.posts.remove(user.userId, id);
  }

  @Get('profiles/:ref/posts')
  @ApiOperation({
    summary: 'A person’s posts (cursor-paginated, newest first)',
    description:
      'Only what you are allowed to see. A private account lists nothing (403) until you are an accepted follower.',
  })
  byUser(@CurrentUser() user: AuthContext, @Param('ref') ref: string, @Query() q: UserPostsQuery) {
    return this.posts.listByUser(user.userId, ref, q);
  }
}
