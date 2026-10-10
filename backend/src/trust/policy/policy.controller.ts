import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import type { Request } from 'express';
import {
  AdminRoute,
  CurrentAdmin,
  RequirePermissions,
} from '../../common/decorators/route-metadata.js';
import { Errors } from '../../common/errors/app-error.js';
import type { AdminAuthContext } from '../../common/http/request.js';
import type { ReportCategory, Severity } from '../../generated/prisma/client.js';
import { CATEGORIES } from '../policy.js';
import { meta } from '../query.js';
import { PolicyService } from './policy.service.js';

class CategoryPolicyDto {
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  severity!: Severity;

  /** Hours within which a person should have looked at a report in this category. */
  @IsInt()
  @Min(1)
  @Max(720)
  slaHours!: number;

  /** Different people who must report the same thing before it is hidden pending review. 0 is off. */
  @IsInt()
  @Min(0)
  @Max(50)
  autoHoldAt!: number;

  @IsString()
  @Length(10, 500)
  reason!: string;

  /** The `version` you loaded. If someone changed the policy since, the change is refused. */
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;
}

@ApiTags('admin-policy')
@ApiBearerAuth('admin')
@AdminRoute()
@Controller('admin/policy')
export class PolicyController {
  constructor(private readonly policy: PolicyService) {}

  @RequirePermissions('policy.read')
  @Get()
  @ApiOperation({
    summary: 'Moderation policy',
    description:
      'The published rules, the severity, response time and automatic-hold threshold of each report category (with the defaults and the floor that protects child-safety and self-harm reports), and the limits on reporting and appeals.',
  })
  view() {
    return this.policy.view();
  }

  @RequirePermissions('policy.update')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Put('categories/:category')
  @ApiOperation({
    summary: 'Change how one report category is handled',
    description:
      'Needs a reason and is audited with the old and new values. Child-safety and self-harm reports cannot be set below high severity or slower than 24 hours.',
  })
  setCategory(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('category') category: string,
    @Body() dto: CategoryPolicyDto,
    @Req() req: Request,
  ) {
    if (!(CATEGORIES as string[]).includes(category)) throw Errors.notFound('Category');
    return this.policy.setCategory(
      a,
      category as ReportCategory,
      { severity: dto.severity, slaHours: dto.slaHours, autoHoldAt: dto.autoHoldAt },
      dto.reason,
      dto.expectedVersion,
      meta(req),
    );
  }
}
