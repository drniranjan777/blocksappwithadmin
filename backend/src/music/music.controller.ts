import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/route-metadata.js';
import type { AuthContext } from '../common/http/request.js';
import { MusicListQueryDto } from './dto/music.dto.js';
import { MusicService } from './music.service.js';

@ApiTags('music')
@ApiBearerAuth('user')
@Controller('music')
export class MusicController {
  constructor(private readonly music: MusicService) {}

  @Get('categories')
  @ApiOperation({ summary: 'Music categories, for the picker tabs' })
  categories() {
    return this.music.categories();
  }

  @Get('tracks')
  @ApiOperation({
    summary: 'Music you can use',
    description:
      'Only tracks that are live, licensed for your country and allowed for the chosen `use` (default `REEL`) are listed. Most used first. Each has a 30-second preview and a cover; the full track is never sent to the app.',
  })
  tracks(@CurrentUser() u: AuthContext, @Query() q: MusicListQueryDto) {
    return this.music.list(u.userId, q);
  }

  @Get('tracks/:id')
  @ApiOperation({ summary: 'One track you can use' })
  track(@CurrentUser() u: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.music.get(u.userId, id);
  }
}
