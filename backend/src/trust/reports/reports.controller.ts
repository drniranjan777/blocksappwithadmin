import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CurrentUser } from '../../common/decorators/route-metadata.js';
import type { AuthContext } from '../../common/http/request.js';
import { PageQueryDto } from '../../common/pagination/page-query.dto.js';
import type { ReportCategory, ReportTargetType } from '../../generated/prisma/client.js';
import { CATEGORIES } from '../policy.js';
import { type EvidenceRef, ReportsService } from './reports.service.js';

/** What can be reported. Messages are not here: there is no messaging to report yet. */
export const REPORTABLE: ReportTargetType[] = ['POST', 'REEL', 'STORY', 'COMMENT', 'USER', 'LIVE'];
const EVIDENCE_KINDS = ['POST', 'REEL', 'STORY', 'COMMENT', 'USER'] as const;

class EvidenceDto implements EvidenceRef {
  @IsIn(EVIDENCE_KINDS)
  kind!: EvidenceRef['kind'];

  @IsUUID()
  id!: string;
}

class CreateReportDto {
  @IsIn(REPORTABLE)
  targetType!: ReportTargetType;

  @IsUUID()
  targetId!: string;

  @IsIn(CATEGORIES)
  category!: ReportCategory;

  /** Anything that helps the reviewer. Never shown to the person reported. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  /** Other items that show the problem (for example, a run of harassing comments). Ids only. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => EvidenceDto)
  evidence?: EvidenceDto[];
}

@ApiTags('reports')
@ApiBearerAuth('user')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Report a post, reel, story, comment, account or live session',
    description:
      'You must be able to see what you report, and cannot report yourself. Reporting the same thing for the same reason while that report is still open returns the first report (`duplicate: true`). There is a daily limit. The person reported is never told who reported them.',
  })
  create(@CurrentUser() u: AuthContext, @Body() dto: CreateReportDto) {
    return this.reports.create(u.userId, dto);
  }

  @Get('mine')
  @ApiOperation({
    summary: 'The reports you have made',
    description: 'You can see whether each was received or reviewed, not what was decided.',
  })
  mine(@CurrentUser() u: AuthContext, @Query() q: PageQueryDto) {
    return this.reports.mine(u.userId, q);
  }
}
