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
import { BankQueueQueryDto, BankReviewDto } from '../bank/bank.dto.js';
import { BankAccountsService } from '../bank/bank.service.js';
import { PayoutNoteDto, PayoutQueueQueryDto } from './payouts.dto.js';
import { PayoutsService } from './payouts.service.js';

const meta = (req: Request) => ({ ip: clientIp(req), userAgent: userAgentOf(req) });
const uuid = () => new ParseUUIDPipe();

@ApiTags('admin-payouts')
@ApiBearerAuth('admin')
@AdminRoute()
@Controller('admin')
export class PayoutsAdminController {
  constructor(
    private readonly payouts: PayoutsService,
    private readonly bank: BankAccountsService,
  ) {}

  // --------------------------------------------------------------- bank accounts --

  @RequirePermissions('bank.read')
  @Get('bank-accounts')
  @ApiOperation({
    summary: 'Bank accounts, with numbers shown as their last four digits',
    description: 'Filter by status. `PENDING_VERIFICATION` is the queue for a person to look at.',
  })
  accounts(@Query() q: BankQueueQueryDto) {
    return this.bank.queue(q);
  }

  @RequirePermissions('bank.review')
  @Post('bank-accounts/:id/review')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Approve or reject an account whose name only partly matched',
    description:
      'Approval is possible only for an account the bank verified under a similar (not identical) name; a mismatch or an account the bank could not find cannot be approved by anyone. A note is required and the decision is audited.',
  })
  review(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: BankReviewDto,
    @Req() req: Request,
  ) {
    return this.bank.review(a, id, dto, meta(req));
  }

  // --------------------------------------------------------------------- payouts --

  @RequirePermissions('payout.read')
  @Get('payouts')
  @ApiOperation({
    summary: 'Payout requests, newest first',
    description: 'Filter by status or person. `PENDING_REVIEW` is the queue to work through.',
  })
  list(@Query() q: PayoutQueueQueryDto) {
    return this.payouts.queue(q);
  }

  @RequirePermissions('payout.read')
  @Get('payouts/:id')
  @ApiOperation({ summary: 'One payout, with the decisions already made on it' })
  one(@Param('id', uuid()) id: string) {
    return this.payouts.detail(id);
  }

  @RequirePermissions('payout.approve')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('payouts/:id/approve')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Approve a payout',
    description:
      'Gives one approval. At or above the dual-approval amount a second, different person must also approve before it can be sent. Nobody can approve twice.',
  })
  approve(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: PayoutNoteDto,
    @Req() req: Request,
  ) {
    return this.payouts.approve(a, id, dto.note, meta(req));
  }

  @RequirePermissions('payout.reject')
  @Post('payouts/:id/reject')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reject a payout',
    description: 'The held amount returns to the creator’s balance.',
  })
  reject(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: PayoutNoteDto,
    @Req() req: Request,
  ) {
    return this.payouts.reject(a, id, dto.note, meta(req));
  }

  @RequirePermissions('payout.hold')
  @Post('payouts/:id/hold')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Put a payout on hold',
    description: 'Stops it being sent. The amount stays held.',
  })
  hold(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: PayoutNoteDto,
    @Req() req: Request,
  ) {
    return this.payouts.hold(a, id, dto.note, meta(req));
  }

  @RequirePermissions('payout.retry')
  @Post('payouts/:id/resume')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Take a payout off hold',
    description: 'It goes back to review and earlier approvals no longer stand.',
  })
  resume(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: PayoutNoteDto,
    @Req() req: Request,
  ) {
    return this.payouts.resume(a, id, dto.note, meta(req));
  }

  @RequirePermissions('payout.retry')
  @Post('payouts/:id/retry')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Try to send an approved payout now',
    description: 'Safe to repeat: the provider treats the same payout id as the same payout.',
  })
  retry(@CurrentAdmin() a: AdminAuthContext, @Param('id', uuid()) id: string, @Req() req: Request) {
    return this.payouts.retry(a, id, meta(req));
  }
}
