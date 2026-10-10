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
import { Type } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { Request } from 'express';
import {
  AdminRoute,
  CurrentAdmin,
  RequirePermissions,
} from '../../common/decorators/route-metadata.js';
import type { AdminAuthContext } from '../../common/http/request.js';
import { PageQueryDto } from '../../common/pagination/page-query.dto.js';
import type { IncidentType, LiveStatus } from '../../generated/prisma/client.js';
import { meta } from '../query.js';
import { LiveAdminService } from './live-admin.service.js';

const uuid = () => new ParseUUIDPipe();

class LiveQueryDto extends PageQueryDto {
  /** `active` (default): scheduled or live. `past`: ended or terminated. */
  @IsOptional()
  @IsIn(['active', 'past'])
  scope?: 'active' | 'past';

  @IsOptional()
  @IsIn(['SCHEDULED', 'LIVE', 'ENDED', 'TERMINATED'])
  status?: LiveStatus;

  @IsOptional()
  @IsUUID()
  hostId?: string;
}

class IncidentOnTerminateDto {
  @IsIn(['SELF_HARM', 'VIOLENCE', 'SCAM', 'CHILD_SAFETY', 'HARASSMENT', 'OTHER'])
  type!: IncidentType;

  @IsString()
  @Length(10, 1000)
  summary!: string;
}

class TerminateDto {
  /** Why it is being ended now. Recorded with the decision and shown to nobody outside staff. */
  @IsString()
  @Length(10, 300)
  reason!: string;

  /** A code from `GET /admin/moderation/rules`. Defaults to the general guidelines rule. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  policyReason?: string;

  /** Open an incident in the same step. */
  @IsOptional()
  @ValidateNested()
  @Type(() => IncidentOnTerminateDto)
  incident?: IncidentOnTerminateDto;
}

@ApiTags('admin-live')
@ApiBearerAuth('admin')
@AdminRoute()
@Controller('admin/live/sessions')
export class LiveAdminController {
  constructor(private readonly live: LiveAdminService) {}

  @RequirePermissions('live.read')
  @Get()
  @ApiOperation({
    summary: 'Live sessions',
    description:
      'BLOCKS has no live streaming yet, so this is empty until a live service creates sessions. When it does, each shows its host, viewers, risk flags, open reports and open incidents.',
  })
  list(@Query() q: LiveQueryDto) {
    return this.live.list(q);
  }

  @RequirePermissions('live.read')
  @Get(':id')
  @ApiOperation({ summary: 'One session with its reports and incidents' })
  get(@Param('id', uuid()) id: string) {
    return this.live.get(id);
  }

  @RequirePermissions('live.terminate')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':id/terminate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'End a live session now',
    description:
      'One request, one permission. The session is marked terminated first (a live provider must obey that), then the provider is told to stop it; `providerConfirmed` says whether it confirmed. Reports about the session are closed, the host is told, and an incident can be opened in the same step.',
  })
  terminate(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: TerminateDto,
    @Req() req: Request,
  ) {
    return this.live.terminate(a, id, dto, meta(req));
  }
}
