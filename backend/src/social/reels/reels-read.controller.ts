import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/route-metadata.js';
import type { AuthContext } from '../../common/http/request.js';
import { PageQueryDto } from '../../common/pagination/page-query.dto.js';
import { ReelReader } from './reel-reader.service.js';

@ApiTags('reels')
@ApiBearerAuth('user')
@Controller()
export class ReelsReadController {
  constructor(private readonly reels: ReelReader) {}

  @Get('reels/:id')
  @ApiOperation({
    summary: 'One reel, if you are allowed to see it (otherwise 404)',
    description:
      'A reel is visible to others only once it is published. Its author also sees how far it has got (`status`) and why it failed.',
  })
  get(@CurrentUser() u: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.reels.get(u.userId, id);
  }

  @Get('profiles/:ref/reels')
  @ApiOperation({
    summary: 'A person’s reels (cursor-paginated, newest first)',
    description:
      'Only what you are allowed to see. A private account lists nothing (403) until you are an accepted follower.',
  })
  byUser(@CurrentUser() u: AuthContext, @Param('ref') ref: string, @Query() q: PageQueryDto) {
    return this.reels.listByUser(u.userId, ref, q);
  }
}
