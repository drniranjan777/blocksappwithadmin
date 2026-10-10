import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser } from '../../common/decorators/route-metadata.js';
import type { AuthContext } from '../../common/http/request.js';
import { PageQueryDto } from '../../common/pagination/page-query.dto.js';
import { FEED_SCOPES, type FeedScope, FeedService } from './feed.service.js';
import { TrendingService, type TrendScopeName } from './trending.service.js';

class FeedQuery extends PageQueryDto {
  @IsOptional()
  @IsEnum(FEED_SCOPES)
  scope?: FeedScope;
}

class TrendingQuery {
  @IsOptional()
  @IsEnum(['district', 'state', 'national', 'global'])
  scope?: TrendScopeName;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

class TagSearchQuery {
  @IsString()
  @Length(1, 60)
  q!: string;
}

@ApiTags('feed')
@ApiBearerAuth('user')
@Controller()
export class FeedController {
  constructor(
    private readonly feed: FeedService,
    private readonly trending: TrendingService,
  ) {}

  @Get('feed')
  @ApiOperation({
    summary: 'The feed: posts and reels together (cursor-paginated, newest first)',
    description:
      '`scope`: `following` (default), `local` (my district), `state`, `national` and `global` (earned on the Reach Ladder). Local and state are empty until the profile has a place.',
  })
  get(@CurrentUser() u: AuthContext, @Query() q: FeedQuery) {
    return this.feed.feed(u.userId, q.scope ?? 'following', q);
  }

  @Get('feed/reels')
  @ApiOperation({
    summary: 'Only reels, for the vertical player (cursor-paginated, newest first)',
    description: 'The same scopes and visibility rules as `GET /feed`.',
  })
  reels(@CurrentUser() u: AuthContext, @Query() q: FeedQuery) {
    return this.feed.reelsFeed(u.userId, q.scope ?? 'following', q);
  }

  @Get('hashtags/:tag/posts')
  @ApiOperation({ summary: 'Posts with a hashtag, newest first' })
  byTag(@CurrentUser() u: AuthContext, @Param('tag') tag: string, @Query() q: PageQueryDto) {
    return this.feed.byHashtag(u.userId, tag, q);
  }

  @Get('trending')
  @ApiOperation({
    summary: 'Trending hashtags for my district, state or the country',
    description:
      'Counted from public, approved posts in the last 24 hours; a tag needs at least two posts.',
  })
  top(@CurrentUser() u: AuthContext, @Query() q: TrendingQuery) {
    return this.trending.top(u.userId, q.scope ?? 'state', q.limit);
  }

  @Get('search/hashtags')
  @ApiOperation({ summary: 'Hashtag suggestions while typing' })
  suggest(@Query() q: TagSearchQuery) {
    return this.trending.suggest(q.q);
  }
}
