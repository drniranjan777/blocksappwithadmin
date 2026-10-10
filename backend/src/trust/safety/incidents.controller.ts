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
import { IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import type { Request } from 'express';
import {
  AdminRoute,
  CurrentAdmin,
  RequirePermissions,
} from '../../common/decorators/route-metadata.js';
import type { AdminAuthContext } from '../../common/http/request.js';
import { PageQueryDto } from '../../common/pagination/page-query.dto.js';
import type { IncidentStatus, IncidentType, Severity } from '../../generated/prisma/client.js';
import { meta } from '../query.js';
import { IncidentsService } from './incidents.service.js';

const uuid = () => new ParseUUIDPipe();
const TYPES = ['SELF_HARM', 'VIOLENCE', 'SCAM', 'CHILD_SAFETY', 'HARASSMENT', 'OTHER'] as const;
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

class IncidentsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(['OPEN', 'ESCALATED', 'RESOLVED'])
  status?: IncidentStatus;

  @IsOptional()
  @IsIn(TYPES)
  type?: IncidentType;

  @IsOptional()
  @IsIn(SEVERITIES)
  severity?: Severity;

  /** `me`, or `unassigned`. */
  @IsOptional()
  @IsIn(['me', 'unassigned'])
  owner?: 'me' | 'unassigned';
}

class CreateIncidentDto {
  @IsIn(TYPES)
  type!: IncidentType;

  @IsOptional()
  @IsIn(SEVERITIES)
  severity?: Severity;

  /** What happened, without personal detail beyond what the response needs. */
  @IsString()
  @Length(10, 1000)
  summary!: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  liveSessionId?: string;

  @IsOptional()
  @IsUUID()
  reportId?: string;
}

class NoteDto {
  @IsString()
  @Length(3, 1000)
  note!: string;
}

class AssignDto {
  /** Leave out to take it yourself. */
  @IsOptional()
  @IsUUID()
  adminId?: string;
}

class EscalateDto {
  /** Who outside the platform was told (a helpline, an authority). Written by the person who told them. */
  @IsString()
  @Length(3, 160)
  escalatedTo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(800)
  note?: string;
}

class ResolveDto {
  @IsString()
  @Length(10, 500)
  actionTaken!: string;
}

class ReasonDto {
  @IsString()
  @Length(10, 500)
  reason!: string;
}

@ApiTags('admin-safety')
@ApiBearerAuth('admin')
@AdminRoute()
@Controller('admin/safety/incidents')
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @RequirePermissions('safety.incidents.read')
  @Get()
  @ApiOperation({ summary: 'Safety incidents, newest first' })
  list(@CurrentAdmin() a: AdminAuthContext, @Query() q: IncidentsQueryDto) {
    return this.incidents.list(a, q);
  }

  @RequirePermissions('safety.incidents.write')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post()
  @ApiOperation({
    summary: 'Open an incident',
    description:
      'Reports about self-harm and child safety open one automatically; this is for everything else.',
  })
  create(@CurrentAdmin() a: AdminAuthContext, @Body() dto: CreateIncidentDto, @Req() req: Request) {
    return this.incidents.create(a, dto, meta(req));
  }

  @RequirePermissions('safety.incidents.read')
  @Get(':id')
  @ApiOperation({
    summary: 'One incident with its log',
    description: 'Every note, hand-over, escalation and resolution, in order, with who did it.',
  })
  get(@Param('id', uuid()) id: string) {
    return this.incidents.get(id);
  }

  @RequirePermissions('safety.incidents.write')
  @Post(':id/notes')
  @ApiOperation({ summary: 'Add to the log' })
  note(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: NoteDto,
    @Req() req: Request,
  ) {
    return this.incidents.addNote(a, id, dto.note, meta(req));
  }

  @RequirePermissions('safety.incidents.write')
  @Post(':id/assign')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Take an incident, or hand it to someone',
    description: 'Giving it to someone else needs `reports.escalate`.',
  })
  assign(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: AssignDto,
    @Req() req: Request,
  ) {
    return this.incidents.assign(a, id, dto.adminId ?? a.adminId, meta(req));
  }

  @RequirePermissions('safety.incidents.write', 'reports.escalate')
  @Post(':id/escalate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Record an escalation',
    description:
      'Marks the incident escalated and records who outside the platform was told. BLOCKS does not contact anyone itself.',
  })
  escalate(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: EscalateDto,
    @Req() req: Request,
  ) {
    return this.incidents.escalate(a, id, dto, meta(req));
  }

  @RequirePermissions('safety.incidents.write')
  @Post(':id/resolve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Close an incident, saying what was done' })
  resolve(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: ResolveDto,
    @Req() req: Request,
  ) {
    return this.incidents.resolve(a, id, dto.actionTaken, meta(req));
  }

  @RequirePermissions('safety.incidents.write', 'reports.escalate')
  @Post(':id/reopen')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reopen a resolved incident' })
  reopen(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: ReasonDto,
    @Req() req: Request,
  ) {
    return this.incidents.reopen(a, id, dto.reason, meta(req));
  }
}
