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
import {
  ModerationActionType,
  type ReportCategory,
  type ReportStatus,
  type ReportTargetType,
  type Severity,
} from '../../generated/prisma/client.js';
import {
  CATEGORIES,
  POLICY_RULES,
  POLICY_VERSION,
  STAFF_ACTIONS,
  type StaffAction,
} from '../policy.js';
import { QueryFlag, meta } from '../query.js';
import { REPORTABLE } from '../reports/reports.controller.js';
import { ModerationService } from './moderation.service.js';

const uuid = () => new ParseUUIDPipe();
const STATUSES = ['OPEN', 'IN_REVIEW', 'ESCALATED', 'RESOLVED', 'DISMISSED'] as const;

class QueueQueryDto extends PageQueryDto {
  /** `active` (default): waiting for a decision. `closed`: decided. `all`: both. */
  @IsOptional()
  @IsIn(['active', 'closed', 'all'])
  scope?: 'active' | 'closed' | 'all';

  @IsOptional()
  @IsIn(STATUSES)
  status?: ReportStatus;

  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  severity?: Severity;

  @IsOptional()
  @IsIn(CATEGORIES)
  category?: ReportCategory;

  @IsOptional()
  @IsIn([...REPORTABLE, 'MESSAGE'])
  targetType?: ReportTargetType;

  @IsOptional()
  @IsUUID()
  targetUserId?: string;

  @IsOptional()
  @IsIn(['USER', 'AUTOMATED', 'ADMIN'])
  source?: 'USER' | 'AUTOMATED' | 'ADMIN';

  /** `me`, `unassigned`, or a staff member's id. */
  @IsOptional()
  @IsString()
  @MaxLength(36)
  assignee?: string;

  /** Only reports past their response time. */
  @QueryFlag()
  overdue?: boolean;

  /** `queue` (default for active): most urgent first. `recent`: newest first. */
  @IsOptional()
  @IsIn(['queue', 'recent'])
  sort?: 'queue' | 'recent';
}

class ActionsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  adminId?: string;

  @IsOptional()
  @IsIn(Object.values(ModerationActionType))
  action?: ModerationActionType;

  @IsOptional()
  @IsUUID()
  targetUserId?: string;

  @IsOptional()
  @IsIn(['ADMIN', 'AUTOMATED', 'USER'])
  source?: 'ADMIN' | 'AUTOMATED' | 'USER';
}

class StaffReportDto {
  @IsIn(REPORTABLE)
  targetType!: ReportTargetType;

  @IsUUID()
  targetId!: string;

  @IsIn(CATEGORIES)
  category!: ReportCategory;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

class AssignDto {
  @IsUUID()
  adminId!: string;
}

class ReasonDto {
  @IsString()
  @Length(10, 500)
  reason!: string;
}

class DecisionDto {
  @IsIn(STAFF_ACTIONS)
  action!: StaffAction;

  /** A code from `GET /admin/moderation/rules`. */
  @IsString()
  @MaxLength(60)
  policyReason!: string;

  /** Internal. Never shown to the person it is about. */
  @IsOptional()
  @IsString()
  @Length(3, 1000)
  notes?: string;
}

@ApiTags('admin-moderation')
@ApiBearerAuth('admin')
@AdminRoute()
@Controller('admin/moderation')
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @RequirePermissions('reports.read')
  @Get('summary')
  @ApiOperation({
    summary: 'Moderation at a glance',
    description:
      'Waiting reports by status and severity, how many are overdue, unassigned or yours; appeals, incidents and live sessions are included only if you may see them.',
  })
  summary(@CurrentAdmin() a: AdminAuthContext) {
    return this.moderation.summary(a);
  }

  @RequirePermissions('reports.read')
  @Get('rules')
  @ApiOperation({
    summary: 'The published rules a decision can cite',
    description: 'Draft wording pending legal review. Every decision names one of these codes.',
  })
  rules() {
    return {
      policyVersion: POLICY_VERSION,
      rules: POLICY_RULES.map((r) => ({ ...r, categories: [...r.categories] })),
    };
  }

  @RequirePermissions('reports.read')
  @Get('reports')
  @ApiOperation({
    summary: 'The moderation queue',
    description:
      'Most urgent first (severity, then how many different people reported it, then oldest). Filter by status, severity, category, kind, assignee or overdue. Closed reports are read newest first with `scope=closed`.',
  })
  queue(@CurrentAdmin() a: AdminAuthContext, @Query() q: QueueQueryDto) {
    return this.moderation.queue(a, q);
  }

  @RequirePermissions('reports.resolve')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('reports')
  @ApiOperation({
    summary: 'Flag something yourself',
    description: 'Joins the same queue as user reports, marked as raised by staff.',
  })
  create(@CurrentAdmin() a: AdminAuthContext, @Body() dto: StaffReportDto, @Req() req: Request) {
    return this.moderation.createFromStaff(a, dto, meta(req));
  }

  @RequirePermissions('reports.read')
  @Get('reports/:id')
  @ApiOperation({
    summary: 'One report with everything needed to decide it',
    description:
      'The reported item, the account’s standing, other reports about the same item, the history of decisions, and what you may do next (`allowed`).',
  })
  get(@CurrentAdmin() a: AdminAuthContext, @Param('id', uuid()) id: string) {
    return this.moderation.detail(a, id);
  }

  @RequirePermissions('reports.assign')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post('reports/:id/claim')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Take a report',
    description:
      'Atomic: if someone else got there first, you get a conflict. Taking your own report again is harmless.',
  })
  claim(@CurrentAdmin() a: AdminAuthContext, @Param('id', uuid()) id: string, @Req() req: Request) {
    return this.moderation.claim(a, id, meta(req));
  }

  @RequirePermissions('reports.assign')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('reports/:id/assign')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Give a report to someone',
    description:
      'The person must be active staff able to decide this report. Taking a report off a colleague needs `reports.escalate`.',
  })
  assign(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: AssignDto,
    @Req() req: Request,
  ) {
    return this.moderation.assign(a, id, dto.adminId, meta(req));
  }

  @RequirePermissions('reports.assign')
  @Post('reports/:id/release')
  @HttpCode(200)
  @ApiOperation({ summary: 'Put a report back in the queue' })
  release(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Req() req: Request,
  ) {
    return this.moderation.release(a, id, meta(req));
  }

  @RequirePermissions('reports.resolve')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('reports/:id/escalate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Escalate to senior review',
    description: 'Escalated reports can only be decided by someone with `reports.escalate`.',
  })
  escalate(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: ReasonDto,
    @Req() req: Request,
  ) {
    return this.moderation.escalate(a, id, dto.reason, meta(req));
  }

  @RequirePermissions('reports.resolve')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post('reports/:id/decision')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Decide a report',
    description:
      'Names one published rule. Hiding or removing content also needs `content.moderate`; restricting or suspending the account needs `users.restrict` / `users.suspend`. The decision, the audit entry and the change happen together. Other open reports the same decision answers are closed with it, and people who reported are told it was looked at.',
  })
  decide(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: DecisionDto,
    @Req() req: Request,
  ) {
    return this.moderation.act(a, id, dto, meta(req));
  }

  @RequirePermissions('reports.read')
  @Get('actions')
  @ApiOperation({ summary: 'Every moderation decision, newest first' })
  actions(@Query() q: ActionsQueryDto) {
    return this.moderation.actions(q);
  }

  @RequirePermissions('reports.resolve')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('actions/:id/reverse')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Take a decision back',
    description:
      'Needs `content.restore` (content) or `users.restore` (account). Only the latest decision on an item can be taken back. An appeal still waiting on it is closed as overturned.',
  })
  reverse(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: ReasonDto,
    @Req() req: Request,
  ) {
    return this.moderation.reverse(a, id, dto.reason, meta(req));
  }
}
