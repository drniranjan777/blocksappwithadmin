import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  AdminRoute,
  CurrentAdmin,
  RequirePermissions,
} from '../common/decorators/route-metadata.js';
import { type AdminAuthContext, clientIp, userAgentOf } from '../common/http/request.js';
import { PageQueryDto } from '../common/pagination/page-query.dto.js';
import { ReachConfigService } from './reach-config.service.js';
import { ReachInsightService } from './reach-insight.service.js';
import { ConfigDraftDto, ReasonDto } from './reach.dto.js';

const meta = (req: Request) => ({ ip: clientIp(req), userAgent: userAgentOf(req) });
const uuid = () => new ParseUUIDPipe();

@ApiTags('admin-reach')
@ApiBearerAuth('admin')
@AdminRoute()
@Controller('admin/reach')
export class ReachAdminController {
  constructor(
    private readonly configs: ReachConfigService,
    private readonly insight: ReachInsightService,
  ) {}

  @RequirePermissions('reach.config.read')
  @Get('config/versions')
  @ApiOperation({ summary: 'Every Reach configuration version, newest first' })
  list(@Query() q: PageQueryDto) {
    return this.configs.list(q);
  }

  @RequirePermissions('reach.config.read')
  @Get('config/versions/:id')
  @ApiOperation({
    summary: 'One version in full',
    description:
      'A draft shows what it would change from the active version (`changesFromActive`).',
  })
  get(@Param('id', uuid()) id: string) {
    return this.configs.get(id);
  }

  @RequirePermissions('reach.config.update')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('config/versions')
  @ApiOperation({
    summary: 'Draft a new version',
    description:
      'Send a complete configuration, or nothing to start from a copy of the active one. It is validated now and again when activated: weights must add up to 1, the ladder must climb, and so on. Every problem is reported at once.',
  })
  draft(@CurrentAdmin() a: AdminAuthContext, @Body() dto: ConfigDraftDto, @Req() req: Request) {
    return this.configs.createDraft(a, dto, meta(req));
  }

  @RequirePermissions('reach.config.update')
  @Put('config/versions/:id')
  @ApiOperation({
    summary: 'Change a draft',
    description: 'Only a draft. A version that has been live is never edited.',
  })
  update(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: ConfigDraftDto,
    @Req() req: Request,
  ) {
    return this.configs.updateDraft(a, id, dto, meta(req));
  }

  @RequirePermissions('reach.config.update')
  @Delete('config/versions/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Discard a draft' })
  async remove(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Req() req: Request,
  ) {
    await this.configs.deleteDraft(a, id, meta(req));
  }

  @RequirePermissions('reach.config.activate')
  @Post('config/versions/:id/activate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Make a draft the live configuration',
    description:
      'Needs a reason, and cannot be done by the person who drafted it. The previous version is archived, not changed. Content is re-scored under the new version in the background.',
  })
  activate(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: ReasonDto,
    @Req() req: Request,
  ) {
    return this.configs.activate(a, id, dto.reason, meta(req));
  }

  @RequirePermissions('reach.read')
  @Get('content/:kind/:id')
  @ApiOperation({
    summary: 'The scores a post or reel has had',
    description:
      'Each with the counts it was computed from and the configuration version, so it can be reproduced.',
  })
  history(@Param('kind') kind: string, @Param('id', uuid()) id: string) {
    return this.insight.history(kind, id);
  }
}
