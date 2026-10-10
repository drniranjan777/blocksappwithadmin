import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import type { Request } from 'express';
import {
  AdminRoute,
  CurrentAdmin,
  RequirePermissions,
} from '../../common/decorators/route-metadata.js';
import type { AdminAuthContext } from '../../common/http/request.js';
import { PageQueryDto } from '../../common/pagination/page-query.dto.js';
import type { AppealKind, AppealStatus } from '../../generated/prisma/client.js';
import { QueryFlag, meta } from '../query.js';
import { AppealsService } from './appeals.service.js';

const uuid = () => new ParseUUIDPipe();

class AppealsQueryDto extends PageQueryDto {
  /** `waiting` (default): not yet decided, oldest first. `decided`: newest first. */
  @IsOptional()
  @IsIn(['waiting', 'decided', 'all'])
  scope?: 'waiting' | 'decided' | 'all';

  @IsOptional()
  @IsIn(['OPEN', 'IN_REVIEW', 'UPHELD', 'OVERTURNED', 'REJECTED'])
  status?: AppealStatus;

  @IsOptional()
  @IsIn(['MODERATION', 'EARNINGS', 'ACCOUNT'])
  kind?: AppealKind;

  /** `me`, `unassigned`, or a staff member's id. */
  @IsOptional()
  @IsString()
  @MaxLength(36)
  assignee?: string;

  @QueryFlag()
  overdue?: boolean;
}

class DecideAppealDto {
  @IsIn(['UPHELD', 'OVERTURNED', 'REJECTED'])
  decision!: 'UPHELD' | 'OVERTURNED' | 'REJECTED';

  /** Written for the person who appealed: it is shown to them. */
  @IsString()
  @Length(10, 1000)
  note!: string;
}

@ApiTags('admin-appeals')
@ApiBearerAuth('admin')
@AdminRoute()
@Controller('admin/appeals')
export class AppealsAdminController {
  constructor(private readonly appeals: AppealsService) {}

  @RequirePermissions('appeals.read')
  @Get()
  @ApiOperation({ summary: 'Appeals', description: 'Waiting ones are worked oldest first.' })
  list(@CurrentAdmin() a: AdminAuthContext, @Query() q: AppealsQueryDto) {
    return this.appeals.list(a, q);
  }

  @RequirePermissions('appeals.read')
  @Get(':id')
  @ApiOperation({
    summary: 'One appeal',
    description:
      'With the decision under appeal (including the staff notes the person never sees), the item, and whether you may review it (`you`). You cannot review a decision you made.',
  })
  get(@CurrentAdmin() a: AdminAuthContext, @Param('id', uuid()) id: string) {
    return this.appeals.get(a, id);
  }

  @RequirePermissions('appeals.decide')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post(':id/claim')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Take an appeal for review',
    description: 'Refused if you made the decision under appeal, or if someone else has it.',
  })
  claim(@CurrentAdmin() a: AdminAuthContext, @Param('id', uuid()) id: string, @Req() req: Request) {
    return this.appeals.claim(a, id, meta(req));
  }

  @RequirePermissions('appeals.decide')
  @Post(':id/release')
  @HttpCode(200)
  @ApiOperation({ summary: 'Put an appeal back' })
  release(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Req() req: Request,
  ) {
    return this.appeals.release(a, id, meta(req));
  }

  @RequirePermissions('appeals.decide')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post(':id/decision')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Decide an appeal',
    description:
      'Upheld: the decision stands. Overturned: the decision is reversed (this also needs `content.restore` or `users.restore`). Rejected: the appeal cannot be taken forward. The note is shown to the person.',
  })
  decide(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: DecideAppealDto,
    @Req() req: Request,
  ) {
    return this.appeals.decide(a, id, dto, meta(req));
  }
}
