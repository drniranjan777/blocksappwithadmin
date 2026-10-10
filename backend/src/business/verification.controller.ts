import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/route-metadata.js';
import type { AuthContext } from '../common/http/request.js';
import { PageQueryDto } from '../common/pagination/page-query.dto.js';
import type { VerificationType } from '../generated/prisma/client.js';
import { VerificationService } from './verification.service.js';

class AskDto {
  @IsIn(['IDENTITY', 'BUSINESS', 'PUBLISHER'])
  type!: VerificationType;

  /** For a business badge: the page. */
  @IsOptional()
  @IsUUID()
  businessPageId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /** For a business badge: the GSTIN, if the business has one. Stored encrypted; only the last four characters are shown back. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  gstin?: string;
}

@ApiTags('verification')
@ApiBearerAuth('user')
@Controller('verification')
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Post('requests')
  @ApiOperation({
    summary: 'Ask for a verification badge',
    description:
      'Identity needs your identity verification to be complete. A business badge needs a published page. A person reviews every request; nothing is granted automatically.',
  })
  ask(@CurrentUser() u: AuthContext, @Body() dto: AskDto) {
    return this.verification.create(u.userId, dto);
  }

  @Get('requests')
  @ApiOperation({ summary: 'Your requests and what came of them' })
  mine(@CurrentUser() u: AuthContext, @Query() q: PageQueryDto) {
    return this.verification.mine(u.userId, q);
  }
}
