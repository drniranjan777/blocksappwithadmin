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
} from '../common/decorators/route-metadata.js';
import type { AdminAuthContext } from '../common/http/request.js';
import { PageQueryDto } from '../common/pagination/page-query.dto.js';
import type {
  BusinessStatus,
  VerificationStatus,
  VerificationType,
} from '../generated/prisma/client.js';
import { meta } from '../trust/query.js';
import { PagesAdminService } from './pages-admin.service.js';
import { VerificationService } from './verification.service.js';

const uuid = () => new ParseUUIDPipe();

class PagesQuery extends PageQueryDto {
  /** Part of a page name, or the start of its address. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED'])
  status?: BusinessStatus;

  @IsOptional()
  @IsIn(['NONE', 'PENDING', 'APPROVED', 'REJECTED'])
  verification?: VerificationStatus;
}

class VerificationQuery extends PageQueryDto {
  /** Defaults to the ones waiting. */
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED'])
  status?: VerificationStatus;

  @IsOptional()
  @IsIn(['IDENTITY', 'BUSINESS', 'PUBLISHER'])
  type?: VerificationType;
}

class ReasonDto {
  @IsString()
  @Length(10, 500)
  reason!: string;
}

class DecisionDto {
  @IsIn(['APPROVE', 'REJECT'])
  decision!: 'APPROVE' | 'REJECT';

  /** Shown to the person who asked. */
  @IsString()
  @Length(10, 500)
  note!: string;
}

@ApiTags('admin-business')
@ApiBearerAuth('admin')
@AdminRoute()
@Controller('admin/business')
export class BusinessAdminController {
  constructor(
    private readonly pages: PagesAdminService,
    private readonly verification: VerificationService,
  ) {}

  // ------------------------------------------------------------------- pages --

  @RequirePermissions('business.read')
  @Get('pages')
  @ApiOperation({ summary: 'Business pages' })
  listPages(@Query() q: PagesQuery) {
    return this.pages.list(q);
  }

  @RequirePermissions('business.read')
  @Get('pages/:id')
  @ApiOperation({ summary: 'One page, with its posts, offers, campaigns and verification history' })
  getPage(@Param('id', uuid()) id: string) {
    return this.pages.get(id);
  }

  @RequirePermissions('business.manage')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('pages/:id/suspend')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Suspend a published page',
    description:
      'Hides the page and everything posted as it, and pauses its campaigns. The owner is told why. Needs a reason.',
  })
  suspend(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: ReasonDto,
    @Req() req: Request,
  ) {
    return this.pages.suspend(a, id, dto.reason, meta(req));
  }

  @RequirePermissions('business.manage')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('pages/:id/restore')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Restore a suspended page',
    description: 'Its campaigns stay paused until the owner resumes them.',
  })
  restore(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: ReasonDto,
    @Req() req: Request,
  ) {
    return this.pages.restore(a, id, dto.reason, meta(req));
  }

  // ------------------------------------------------------------ verification --

  @RequirePermissions('business.read')
  @Get('verification')
  @ApiOperation({
    summary: 'Verification requests',
    description: 'The ones waiting, oldest first, unless you ask for decided ones.',
  })
  listRequests(@Query() q: VerificationQuery) {
    return this.verification.list(q);
  }

  @RequirePermissions('business.read')
  @Get('verification/:id')
  @ApiOperation({
    summary: 'One request with the evidence to decide it',
    description:
      'A registration number is shown as its last four characters and is marked as not checked against the register.',
  })
  getRequest(@Param('id', uuid()) id: string) {
    return this.verification.get(id);
  }

  @RequirePermissions('business.verify')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('verification/:id/decision')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Approve or refuse a request',
    description:
      'Approving re-checks the condition on the server (an identity badge needs a verified identity; a business badge needs a published page). The note is shown to the person.',
  })
  decide(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: DecisionDto,
    @Req() req: Request,
  ) {
    return this.verification.decide(a, id, dto, meta(req));
  }

  @RequirePermissions('business.verify')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('verification/:id/revoke')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Take a granted badge back',
    description: 'Its own step, with its own reason, audited.',
  })
  revoke(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: ReasonDto,
    @Req() req: Request,
  ) {
    return this.verification.revoke(a, id, dto.reason, meta(req));
  }
}
