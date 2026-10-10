import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsUUID, Length } from 'class-validator';
import { CurrentUser } from '../../common/decorators/route-metadata.js';
import type { AuthContext } from '../../common/http/request.js';
import { PageQueryDto } from '../../common/pagination/page-query.dto.js';
import { AppealsService } from './appeals.service.js';

class CreateAppealDto {
  @IsUUID()
  moderationActionId!: string;

  /** Why the decision was wrong, in the person's own words. */
  @IsString()
  @Length(10, 2000)
  reason!: string;
}

@ApiTags('appeals')
@ApiBearerAuth('user')
@Controller()
export class AppealsController {
  constructor(private readonly appeals: AppealsService) {}

  @Get('moderation/decisions')
  @ApiOperation({
    summary: 'Decisions that were made about your content or account',
    description:
      'Each says which published rule it was under and whether you can still appeal it. Staff notes are never shown.',
  })
  decisions(@CurrentUser() u: AuthContext, @Query() q: PageQueryDto) {
    return this.appeals.decisionsFor(u.userId, q);
  }

  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Post('appeals')
  @ApiOperation({
    summary: 'Appeal a decision',
    description:
      'Once per decision, within the appeal window. Someone who was not involved in the decision reviews it.',
  })
  create(@CurrentUser() u: AuthContext, @Body() dto: CreateAppealDto) {
    return this.appeals.create(u.userId, dto);
  }

  @Get('appeals')
  @ApiOperation({ summary: 'Your appeals, newest first' })
  list(@CurrentUser() u: AuthContext, @Query() q: PageQueryDto) {
    return this.appeals.listMine(u.userId, q);
  }

  @Get('appeals/:id')
  @ApiOperation({ summary: 'One of your appeals' })
  get(@CurrentUser() u: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.appeals.mine(u.userId, id);
  }
}
