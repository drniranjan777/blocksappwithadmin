import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { CurrentUser } from '../../common/decorators/route-metadata.js';
import type { AuthContext } from '../../common/http/request.js';
import { UpdateProfileDto } from './profiles.dto.js';
import { ProfilesService } from './profiles.service.js';

class SearchUsersQuery {
  @IsString()
  @Length(1, 60)
  q!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

@ApiTags('profiles')
@ApiBearerAuth('user')
@Controller()
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get('users/me/profile')
  @ApiOperation({ summary: 'My profile, including the private fields only I see' })
  mine(@CurrentUser() user: AuthContext) {
    return this.profiles.mine(user.userId);
  }

  @Patch('users/me/profile')
  @ApiOperation({
    summary: 'Edit my profile',
    description:
      'Send only what changes; `null` clears an optional field. Cannot change username, badge, counts or account type. `state` must be a real state or union territory.',
  })
  update(@CurrentUser() user: AuthContext, @Body() dto: UpdateProfileDto) {
    return this.profiles.update(user.userId, dto);
  }

  @Get('profiles/:ref')
  @ApiOperation({
    summary: 'A profile, by id or username',
    description:
      'Includes how you relate to them. A person who blocked you is "not found"; for a private account you see the profile but `contentVisible` is false until you are an accepted follower.',
  })
  view(@CurrentUser() user: AuthContext, @Param('ref') ref: string) {
    return this.profiles.view(user.userId, ref);
  }

  @Get('search/users')
  @ApiOperation({ summary: 'Find people by part of a username or name (typeahead, no paging)' })
  search(@CurrentUser() user: AuthContext, @Query() q: SearchUsersQuery) {
    return this.profiles.search(user.userId, q.q, q.limit);
  }
}
