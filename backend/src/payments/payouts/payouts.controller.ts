import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/route-metadata.js';
import { type AuthContext, clientIp, userAgentOf } from '../../common/http/request.js';
import { PageQueryDto } from '../../common/pagination/page-query.dto.js';
import { AddBankAccountDto } from '../bank/bank.dto.js';
import { BankAccountsService } from '../bank/bank.service.js';
import { RequestPayoutDto } from './payouts.dto.js';
import { PayoutsService } from './payouts.service.js';
import { TaxService } from './tax.service.js';
import { UpdateTaxDto } from './tax.dto.js';

const meta = (req: Request) => ({ ip: clientIp(req), userAgent: userAgentOf(req) });
const STEP_UP = {
  name: 'X-Step-Up-Token',
  required: false,
  description: 'From POST /auth/step-up/verify, for this action. Works once, for five minutes.',
} as const;

@ApiTags('payouts')
@ApiBearerAuth('user')
@Controller('payouts')
export class PayoutsController {
  constructor(
    private readonly payouts: PayoutsService,
    private readonly bank: BankAccountsService,
    private readonly tax: TaxService,
  ) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Whether you can be paid, what is missing, your balance and the limits',
    description:
      'The checklist is computed by the server and is the only authority: identity, a verified bank account in your name, monetisation in good standing, no hold, a balance above the minimum. The limits are settings, not constants in the app.',
  })
  overview(@CurrentUser() u: AuthContext) {
    return this.payouts.overview(u.userId);
  }

  // ------------------------------------------------------------------ accounts --

  @Get('accounts')
  @ApiOperation({ summary: 'Your bank accounts, with the number shown as its last four digits' })
  accounts(@CurrentUser() u: AuthContext) {
    return this.bank.list(u.userId);
  }

  @Get('ifsc/:code')
  @ApiOperation({ summary: 'Check an IFSC code’s shape and see which bank it names' })
  ifsc(@Param('code') code: string) {
    return this.bank.ifsc(code);
  }

  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Post('accounts')
  @ApiHeader(STEP_UP)
  @ApiOperation({
    summary: 'Add a bank account',
    description:
      'Needs verified identity and a step-up (`purpose: ADD_BANK_ACCOUNT`). The bank is asked whether the account exists and whose it is, and the name it holds is compared with your verified name on the server: a clear match is verified, a partial one waits for a person, a mismatch is refused. Payouts pause for a while after any change.',
  })
  addAccount(
    @CurrentUser() u: AuthContext,
    @Body() dto: AddBankAccountDto,
    @Headers('x-step-up-token') token: string | undefined,
    @Req() req: Request,
  ) {
    return this.bank.add(u.userId, dto, token, meta(req));
  }

  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Post('accounts/:id/primary')
  @HttpCode(200)
  @ApiHeader(STEP_UP)
  @ApiOperation({
    summary: 'Make a verified account your primary one',
    description: 'Step-up purpose: `CHANGE_BANK_ACCOUNT`.',
  })
  primary(
    @CurrentUser() u: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('x-step-up-token') token: string | undefined,
    @Req() req: Request,
  ) {
    return this.bank.makePrimary(u.userId, id, token, meta(req));
  }

  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Delete('accounts/:id')
  @HttpCode(204)
  @ApiHeader(STEP_UP)
  @ApiOperation({
    summary: 'Remove a bank account',
    description: 'Step-up purpose: `REMOVE_BANK_ACCOUNT`. Not while it has a payout in progress.',
  })
  async removeAccount(
    @CurrentUser() u: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('x-step-up-token') token: string | undefined,
    @Req() req: Request,
  ): Promise<void> {
    await this.bank.remove(u.userId, id, token, meta(req));
  }

  // ------------------------------------------------------------------ requests --

  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  @Post('requests')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      '8-100 of A-Z a-z 0-9 _ -. A retry with the same key and body returns the first payout instead of making a second.',
  })
  @ApiHeader(STEP_UP)
  @ApiOperation({
    summary: 'Request a payout',
    description:
      'The amount leaves your available balance at once (it is held, and goes back if the payout is refused, cancelled or fails). From the step-up amount upwards a fresh step-up is required (`purpose: REQUEST_PAYOUT`). Large payouts, and any from a recently added account, wait for a person to approve. You cannot approve your own payout or mark it paid.',
  })
  request(
    @CurrentUser() u: AuthContext,
    @Body() dto: RequestPayoutDto,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-step-up-token') token: string | undefined,
    @Req() req: Request,
  ) {
    return this.payouts.request(u.userId, dto, key, token, meta(req));
  }

  @Get('requests')
  @ApiOperation({ summary: 'Your payouts, newest first (cursor-paginated)' })
  list(@CurrentUser() u: AuthContext, @Query() q: PageQueryDto) {
    return this.payouts.list(u.userId, q);
  }

  @Get('requests/:id')
  @ApiOperation({ summary: 'One of your payouts' })
  one(@CurrentUser() u: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.payouts.get(u.userId, id);
  }

  @Post('requests/:id/cancel')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cancel a payout that has not been sent',
    description: 'The held amount returns to your balance.',
  })
  cancel(
    @CurrentUser() u: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    return this.payouts.cancel(u.userId, id, meta(req));
  }

  // ----------------------------------------------------------------------- tax --

  @Get('tax')
  @ApiOperation({
    summary: 'The tax details payouts are reported under',
    description: 'The PAN is shown masked. BLOCKS collects it; it does not calculate tax.',
  })
  taxProfile(@CurrentUser() u: AuthContext) {
    return this.tax.get(u.userId);
  }

  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Post('tax')
  @HttpCode(200)
  @ApiHeader(STEP_UP)
  @ApiOperation({
    summary: 'Confirm the PAN payouts are reported under',
    description:
      'Step-up purpose: `UPDATE_TAX_INFO`. It must be the PAN on your verified identity.',
  })
  setTax(
    @CurrentUser() u: AuthContext,
    @Body() dto: UpdateTaxDto,
    @Headers('x-step-up-token') token: string | undefined,
  ) {
    return this.tax.set(u.userId, dto.pan, token);
  }
}
