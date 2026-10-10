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
import type { Request } from 'express';
import {
  AdminRoute,
  CurrentAdmin,
  RequirePermissions,
} from '../../common/decorators/route-metadata.js';
import { type AdminAuthContext, clientIp, userAgentOf } from '../../common/http/request.js';
import { KycDecisionDto, KycQueueQueryDto } from './kyc.dto.js';
import { KycService } from './kyc.service.js';

const meta = (req: Request) => ({ ip: clientIp(req), userAgent: userAgentOf(req) });
const uuid = () => new ParseUUIDPipe();

@ApiTags('admin-kyc')
@ApiBearerAuth('admin')
@AdminRoute()
@Controller('admin/kyc')
export class KycAdminController {
  constructor(private readonly kyc: KycService) {}

  @RequirePermissions('kyc.read')
  @Get('cases')
  @ApiOperation({
    summary: 'Identity cases, newest first',
    description: 'Names and PANs are masked. Filter by status.',
  })
  queue(@Query() q: KycQueueQueryDto) {
    return this.kyc.queue(q);
  }

  @RequirePermissions('kyc.read')
  @Get('cases/:id')
  @ApiOperation({ summary: 'One case (masked), with its documents and the decisions made on it' })
  one(@Param('id', uuid()) id: string) {
    return this.kyc.caseFor(id);
  }

  @RequirePermissions('kyc.documents.view')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('cases/:id/documents/:documentId/file')
  @ApiOperation({
    summary: 'A two-minute link to one scanned document',
    description: 'Every view is written to the sensitive audit trail with who looked.',
  })
  file(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Param('documentId', uuid()) documentId: string,
    @Req() req: Request,
  ) {
    return this.kyc.documentUrl(a, id, documentId, meta(req));
  }

  @RequirePermissions('kyc.review')
  @Post('cases/:id/decision')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Approve, reject or ask for more on a case',
    description:
      'Only a case the identity provider sent for review can be approved. Rejecting needs a reason code. Every decision needs a note and is audited.',
  })
  decide(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: KycDecisionDto,
    @Req() req: Request,
  ) {
    return this.kyc.decide(a, id, dto, meta(req));
  }
}
