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
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CurrentUser, Publishes } from '../../common/decorators/route-metadata.js';
import type { AuthContext } from '../../common/http/request.js';
import { PageQueryDto } from '../../common/pagination/page-query.dto.js';
import { StoriesService } from './stories.service.js';

class CreateStoryDto {
  /** A processed `STORY` image or video of your own. */
  @IsUUID()
  mediaId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  caption?: string;

  @IsOptional()
  @IsEnum(['PUBLIC', 'FOLLOWERS', 'CLOSE_FRIENDS'])
  visibility?: 'PUBLIC' | 'FOLLOWERS' | 'CLOSE_FRIENDS';
}

@ApiTags('stories')
@ApiBearerAuth('user')
@Controller()
export class StoriesController {
  constructor(private readonly stories: StoriesService) {}

  @Publishes()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('stories')
  @ApiOperation({ summary: 'Share a story (disappears after 24 hours)' })
  create(@CurrentUser() u: AuthContext, @Body() dto: CreateStoryDto) {
    return this.stories.create(u.userId, dto);
  }

  @Get('stories/tray')
  @ApiOperation({ summary: 'The stories bar: me and people I follow who have something to watch' })
  tray(@CurrentUser() u: AuthContext) {
    return this.stories.tray(u.userId);
  }

  @Get('profiles/:ref/stories')
  @ApiOperation({ summary: 'Someone’s live stories, oldest first' })
  ofUser(@CurrentUser() u: AuthContext, @Param('ref') ref: string) {
    return this.stories.ofUser(u.userId, ref);
  }

  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @Post('stories/:id/view')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark a story as watched' })
  view(@CurrentUser() u: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.stories.view(u.userId, id);
  }

  @Get('stories/:id/viewers')
  @ApiOperation({ summary: 'Who watched my story' })
  viewers(
    @CurrentUser() u: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() q: PageQueryDto,
  ) {
    return this.stories.viewers(u.userId, id, q);
  }

  @Delete('stories/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete my story' })
  async remove(
    @CurrentUser() u: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.stories.remove(u.userId, id);
  }
}
