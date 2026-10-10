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
} from '../common/decorators/route-metadata.js';
import type { AdminAuthContext } from '../common/http/request.js';
import { PageQueryDto } from '../common/pagination/page-query.dto.js';
import type { AdStatus, BillingStatus } from '../generated/prisma/client.js';
import { meta } from '../trust/query.js';
import { AdsAdminService } from './ads-admin.service.js';

const uuid = () => new ParseUUIDPipe();

class CampaignsQuery extends PageQueryDto {
  /** `review` (default): waiting for a decision, oldest first. `all`: everything, newest first. */
  @IsOptional()
  @IsIn(['review', 'all'])
  scope?: 'review' | 'all';

  @IsOptional()
  @IsIn([
    'DRAFT',
    'IN_REVIEW',
    'APPROVED',
    'ACTIVE',
    'PAUSED',
    'COMPLETED',
    'REJECTED',
    'FLAGGED',
    'CANCELLED',
  ])
  status?: AdStatus;

  /** Needs `ads.billing.read`; ignored otherwise. */
  @IsOptional()
  @IsIn(['NOT_CONFIGURED', 'PENDING', 'PAID', 'FAILED', 'REFUNDED'])
  billing?: BillingStatus;

  @IsOptional()
  @IsUUID()
  advertiserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

class AdvertisersQuery extends PageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;
}

class NoteDto {
  /** Shown to the advertiser. */
  @IsString()
  @Length(10, 500)
  note!: string;
}

class OptionalNoteDto {
  @IsOptional()
  @IsString()
  @Length(3, 500)
  note?: string;
}

@ApiTags('admin-ads')
@ApiBearerAuth('admin')
@AdminRoute()
@Controller('admin/ads')
export class AdsAdminController {
  constructor(private readonly ads: AdsAdminService) {}

  @RequirePermissions('ads.read')
  @Get('campaigns')
  @ApiOperation({
    summary: 'Campaigns',
    description:
      'By default the ones waiting for review, oldest first. Billing status is shown only with `ads.billing.read`.',
  })
  list(@CurrentAdmin() a: AdminAuthContext, @Query() q: CampaignsQuery) {
    return this.ads.list(a, q);
  }

  @RequirePermissions('ads.read')
  @Get('campaigns/:id')
  @ApiOperation({
    summary: 'One campaign with what a reviewer needs',
    description:
      'The creative, the targeting and its exact audience, the advertiser’s standing, what is being boosted, and the history. Payment details only with `ads.billing.read`.',
  })
  get(@CurrentAdmin() a: AdminAuthContext, @Param('id', uuid()) id: string) {
    return this.ads.get(a, id);
  }

  @RequirePermissions('ads.manage')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post('campaigns/:id/approve')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Approve a campaign',
    description:
      'Checks again that its page, account and promoted post are fine. It runs only once it is paid for and its time comes.',
  })
  approve(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: OptionalNoteDto,
    @Req() req: Request,
  ) {
    return this.ads.approve(a, id, dto.note, meta(req));
  }

  @RequirePermissions('ads.manage')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post('campaigns/:id/reject')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Turn a campaign down',
    description: 'The note is shown to the advertiser, who can fix it and send it again.',
  })
  reject(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: NoteDto,
    @Req() req: Request,
  ) {
    return this.ads.reject(a, id, dto.note, meta(req));
  }

  @RequirePermissions('ads.manage')
  @Post('campaigns/:id/flag')
  @HttpCode(200)
  @ApiOperation({ summary: 'Stop a campaign that may break the rules' })
  flag(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: NoteDto,
    @Req() req: Request,
  ) {
    return this.ads.flag(a, id, dto.note, meta(req));
  }

  @RequirePermissions('ads.manage')
  @Post('campaigns/:id/clear-flag')
  @HttpCode(200)
  @ApiOperation({ summary: 'Clear a flag after looking again' })
  clear(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: NoteDto,
    @Req() req: Request,
  ) {
    return this.ads.clearFlag(a, id, dto.note, meta(req));
  }

  @RequirePermissions('ads.manage')
  @Post('campaigns/:id/pause')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Pause a running campaign',
    description: 'The advertiser cannot resume one that staff paused.',
  })
  pause(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: NoteDto,
    @Req() req: Request,
  ) {
    return this.ads.pause(a, id, dto.note, meta(req));
  }

  @RequirePermissions('ads.manage')
  @Post('campaigns/:id/resume')
  @HttpCode(200)
  @ApiOperation({ summary: 'Resume a campaign' })
  resume(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: NoteDto,
    @Req() req: Request,
  ) {
    return this.ads.resume(a, id, dto.note, meta(req));
  }

  @RequirePermissions('ads.read')
  @Get('advertisers')
  @ApiOperation({
    summary: 'Advertisers',
    description:
      'People who have run campaigns, with counts and totals. Nothing about who was in their audiences.',
  })
  advertisers(@Query() q: AdvertisersQuery) {
    return this.ads.advertisers(q);
  }
}
