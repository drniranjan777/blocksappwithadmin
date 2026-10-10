import { Body, Controller, Get, HttpCode, Param, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Allow, IsString, Length } from 'class-validator';
import type { Request } from 'express';
import {
  AdminRoute,
  CurrentAdmin,
  RequirePermissions,
} from '../../common/decorators/route-metadata.js';
import { type AdminAuthContext, clientIp, userAgentOf } from '../../common/http/request.js';
import { SettingsAdminService } from './settings-admin.service.js';

class SettingValueDto {
  /** The new value, in the shape the setting expects. */
  @Allow()
  value!: unknown;

  @IsString()
  @Length(10, 500)
  reason!: string;
}

@ApiTags('admin-settings')
@ApiBearerAuth('admin')
@AdminRoute()
@Controller('admin/settings')
export class SettingsAdminController {
  constructor(private readonly settings: SettingsAdminService) {}

  @RequirePermissions('settings.read')
  @Get()
  @ApiOperation({
    summary: 'The settings staff can change without a deploy',
    description:
      'A closed list, each with its current value, its default, who last changed it and when.',
  })
  list() {
    return this.settings.list();
  }

  @RequirePermissions('settings.update')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Put(':key')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Change one setting',
    description:
      'The value must fit the setting, and money limits must stay consistent with each other. A reason is required; the old and new values are audited.',
  })
  set(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('key') key: string,
    @Body() dto: SettingValueDto,
    @Req() req: Request,
  ) {
    return this.settings.set(a, key, dto.value, dto.reason, {
      ip: clientIp(req),
      userAgent: userAgentOf(req),
    });
  }
}
