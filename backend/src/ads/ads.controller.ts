import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { CurrentUser, Publishes } from '../common/decorators/route-metadata.js';
import type { AuthContext } from '../common/http/request.js';
import { PageQueryDto } from '../common/pagination/page-query.dto.js';
import type { AdObjective, AdStatus } from '../generated/prisma/client.js';
import { OBJECTIVES } from './ads-rules.js';
import { AdsService } from './ads.service.js';

const uuid = () => new ParseUUIDPipe();
const AMOUNT = /^\d{1,10}(\.\d{1,2})?$/;
const STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'REJECTED',
  'FLAGGED',
  'CANCELLED',
] as const;

class CreateCampaignDto {
  @IsString()
  @Length(3, 120)
  name!: string;

  @IsIn(OBJECTIVES)
  objective!: AdObjective;

  /** Advertise on behalf of one of your published pages. */
  @IsOptional()
  @IsUUID()
  businessPageId?: string;

  /** Rupees, like "1500.00". The most this campaign can ever spend. */
  @Matches(AMOUNT)
  budgetTotal!: string;

  /** Rupees. The most it can spend in one day. */
  @IsOptional()
  @Matches(AMOUNT)
  dailyBudget?: string;

  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;

  /** Places and broad age bands. Nothing else can be targeted on. */
  @IsOptional()
  @IsObject()
  targeting?: Record<string, unknown>;

  @IsString()
  @Length(3, 120)
  headline!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  destinationUrl?: string;

  @IsOptional()
  @IsUUID()
  boostPostId?: string;

  @IsOptional()
  @IsUUID()
  boostReelId?: string;
}

class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  @Length(3, 120)
  name?: string;

  @IsOptional()
  @IsIn(OBJECTIVES)
  objective?: AdObjective;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsUUID()
  businessPageId?: string | null;

  @IsOptional()
  @Matches(AMOUNT)
  budgetTotal?: string;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @Matches(AMOUNT)
  dailyBudget?: string | null;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  @IsOptional()
  @IsObject()
  targeting?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @Length(3, 120)
  headline?: string;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsString()
  @MaxLength(400)
  body?: string | null;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  destinationUrl?: string | null;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsUUID()
  boostPostId?: string | null;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsUUID()
  boostReelId?: string | null;
}

class ListQuery extends PageQueryDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: AdStatus;
}

@ApiTags('ads')
@ApiBearerAuth('user')
@Controller('ads')
export class AdsController {
  constructor(private readonly ads: AdsService) {}

  @Get('rules')
  @ApiOperation({
    summary: 'What a campaign can ask for',
    description:
      'Budget limits, the longest a campaign can run, what each objective needs, and what can be targeted.',
  })
  rules() {
    return this.ads.rules();
  }

  @Get('campaigns')
  @ApiOperation({ summary: 'Your campaigns, newest first' })
  list(@CurrentUser() u: AuthContext, @Query() q: ListQuery) {
    return this.ads.list(u.userId, q);
  }

  @Publishes()
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  @Post('campaigns')
  @ApiOperation({
    summary: 'Create a campaign (a draft)',
    description:
      'Nothing is sent for review, and nothing is charged. Targeting is places and broad age bands only. The advertiser is always you.',
  })
  create(@CurrentUser() u: AuthContext, @Body() dto: CreateCampaignDto) {
    return this.ads.create(u.userId, dto);
  }

  @Get('campaigns/:id')
  @ApiOperation({
    summary: 'One campaign',
    description: 'With an audience size rounded down. Advertisers never see who is in an audience.',
  })
  get(@CurrentUser() u: AuthContext, @Param('id', uuid()) id: string) {
    return this.ads.get(u.userId, id);
  }

  @Publishes()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Patch('campaigns/:id')
  @ApiOperation({ summary: 'Change a draft, or a campaign that was turned down' })
  update(
    @CurrentUser() u: AuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.ads.update(u.userId, id, dto);
  }

  @Delete('campaigns/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a draft' })
  async remove(@CurrentUser() u: AuthContext, @Param('id', uuid()) id: string): Promise<void> {
    await this.ads.remove(u.userId, id);
  }

  @Publishes()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('campaigns/:id/submit')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Send for review',
    description:
      'Checks the campaign is complete, that its words pass the screening, and that its audience is not so small it could point at one person. A person at BLOCKS then reviews it; nothing runs without that.',
  })
  submit(@CurrentUser() u: AuthContext, @Param('id', uuid()) id: string) {
    return this.ads.submit(u.userId, id);
  }

  @Post('campaigns/:id/pause')
  @HttpCode(200)
  @ApiOperation({ summary: 'Pause a running campaign' })
  pause(@CurrentUser() u: AuthContext, @Param('id', uuid()) id: string) {
    return this.ads.pause(u.userId, id);
  }

  @Post('campaigns/:id/resume')
  @HttpCode(200)
  @ApiOperation({ summary: 'Resume a campaign you paused' })
  resume(@CurrentUser() u: AuthContext, @Param('id', uuid()) id: string) {
    return this.ads.resume(u.userId, id);
  }

  @Post('campaigns/:id/cancel')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Stop a campaign for good',
    description: 'Anything paid and not yet spent is refunded.',
  })
  cancel(@CurrentUser() u: AuthContext, @Param('id', uuid()) id: string) {
    return this.ads.cancel(u.userId, id);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('campaigns/:id/fund')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Pay for an approved campaign',
    description:
      'Answers 503 while no payment provider is configured, which is the case until the business connects one. An approved campaign does not run until it is paid for.',
  })
  fund(@CurrentUser() u: AuthContext, @Param('id', uuid()) id: string) {
    return this.ads.fund(u.userId, id);
  }

  @Get('campaigns/:id/report')
  @ApiOperation({
    summary: 'How a campaign is doing',
    description: 'Totals and per-day figures; never who saw it.',
  })
  report(@CurrentUser() u: AuthContext, @Param('id', uuid()) id: string) {
    return this.ads.report(u.userId, id);
  }
}
