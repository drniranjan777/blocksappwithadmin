import {
  Body,
  Controller,
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
import { LedgerService } from '../ledger/ledger.service.js';
import { formatRupees } from '../ledger/money.js';
import { CreatorProfileService } from './creator-profile.service.js';
import { AdjustmentDto, CreateCycleDto, MonetizationDto, UpdateCycleDto } from './earnings.dto.js';
import { EarningsService } from './earnings.service.js';

const meta = (req: Request) => ({ ip: clientIp(req), userAgent: userAgentOf(req) });
const uuid = () => new ParseUUIDPipe();

@ApiTags('admin-earnings')
@ApiBearerAuth('admin')
@AdminRoute()
@Controller('admin')
export class EarningsAdminController {
  constructor(
    private readonly earnings: EarningsService,
    private readonly creators: CreatorProfileService,
    private readonly ledger: LedgerService,
  ) {}

  // ------------------------------------------------------------------- cycles --

  @RequirePermissions('earnings.read')
  @Get('earnings/cycles')
  @ApiOperation({ summary: 'Reward cycles, newest first' })
  cycles(@Query() q: PageQueryDto) {
    return this.earnings.listCycles(q);
  }

  @RequirePermissions('earnings.read')
  @Get('earnings/cycles/:id')
  @ApiOperation({ summary: 'One cycle, with its summary and the biggest earners' })
  cycle(@Param('id', uuid()) id: string) {
    return this.earnings.getCycle(id);
  }

  @RequirePermissions('earnings.cycles.manage')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('earnings/cycles')
  @ApiOperation({
    summary: 'Open a reward cycle',
    description:
      'A period and a pool of rupees to share among eligible creators by qualified performance (not a rate per view). The Reach configuration in force is fixed for the cycle. Cycles cannot overlap.',
  })
  create(@CurrentAdmin() a: AdminAuthContext, @Body() dto: CreateCycleDto, @Req() req: Request) {
    return this.earnings.createCycle(a, dto, meta(req));
  }

  @RequirePermissions('earnings.cycles.manage')
  @Put('earnings/cycles/:id')
  @ApiOperation({ summary: 'Change an open cycle’s dates or pool' })
  update(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: UpdateCycleDto,
    @Req() req: Request,
  ) {
    return this.earnings.updateCycle(a, id, dto, meta(req));
  }

  @RequirePermissions('earnings.cycles.manage')
  @Post('earnings/cycles/:id/close')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Close a finished cycle and fix everyone’s share',
    description: 'Only after its end date. Nothing is credited yet: a second person releases it.',
  })
  close(@CurrentAdmin() a: AdminAuthContext, @Param('id', uuid()) id: string, @Req() req: Request) {
    return this.earnings.closeCycle(a, id, meta(req));
  }

  @RequirePermissions('earnings.cycles.finalize')
  @Post('earnings/cycles/:id/finalize')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Release a closed cycle into the ledger',
    description:
      'Cannot be done by the person who closed it. Each creator is credited once, in one journal; running it again after an interruption continues where it stopped and never pays anyone twice.',
  })
  finalize(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Req() req: Request,
  ) {
    return this.earnings.finalizeCycle(a, id, meta(req));
  }

  // -------------------------------------------------------------- adjustments --

  @RequirePermissions('earnings.adjust')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('earnings/adjustments')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Correct one creator’s balance',
    description:
      'Positive adds, negative takes away (refused if it would take the balance below zero). Needs a reason and an `idempotencyKey`; sending the same key again changes nothing. Large amounts are refused (limit set in system settings).',
  })
  adjust(@CurrentAdmin() a: AdminAuthContext, @Body() dto: AdjustmentDto, @Req() req: Request) {
    return this.earnings.adjust(a, dto, meta(req));
  }

  // ----------------------------------------------------------------- creators --

  @RequirePermissions('creators.read')
  @Get('creators/:userId')
  @ApiOperation({ summary: 'A creator’s eligibility and earnings figures' })
  async creator(@Param('userId', uuid()) userId: string) {
    const [eligibility, earnings] = await Promise.all([
      this.creators.eligibility(userId),
      this.earnings.summary(userId),
    ]);
    return { eligibility, earnings };
  }

  @RequirePermissions('creators.monetization.update')
  @Post('creators/:userId/monetization/suspend')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Suspend a creator’s monetisation',
    description:
      'Stops rewards accruing and releasing. Needs a reason. Stays until staff restore it, however the creator performs.',
  })
  suspend(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('userId', uuid()) userId: string,
    @Body() dto: MonetizationDto,
    @Req() req: Request,
  ) {
    return this.creators.suspend(a, userId, dto.reason, meta(req));
  }

  @RequirePermissions('creators.monetization.update')
  @Post('creators/:userId/monetization/restore')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Lift a monetisation suspension',
    description:
      'Restoring does not make anyone eligible: the creator’s record decides that again.',
  })
  restore(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('userId', uuid()) userId: string,
    @Body() dto: MonetizationDto,
    @Req() req: Request,
  ) {
    return this.creators.restore(a, userId, dto.reason, meta(req));
  }

  // ------------------------------------------------------------------- ledger --

  @RequirePermissions('ledger.read')
  @Get('ledger/creators/:userId')
  @ApiOperation({ summary: 'A creator’s ledger balance and recent entries' })
  async ledgerOf(@Param('userId', uuid()) userId: string, @Query() q: PageQueryDto) {
    const [balance, page] = await Promise.all([
      this.ledger.balanceOf(userId),
      this.earnings.ledgerOf(userId, q),
    ]);
    return {
      balance: formatRupees(balance),
      entries: page.items,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }
}
