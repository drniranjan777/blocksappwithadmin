import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/route-metadata.js';
import { GeoLocator } from '../common/http/geo-locator.js';
import { requestInfoOf, type AuthContext } from '../common/http/request.js';
import {
  ChallengeCodeDto,
  ContactChangeDto,
  ContactVerifyDto,
  PasswordConfirmDto,
} from '../security/dto/security.dto.js';
import { AccountService } from './account.service.js';

const STRICT = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('account')
@ApiBearerAuth('user')
@Controller('account')
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly geo: GeoLocator,
  ) {}

  @Get('contacts')
  @ApiOperation({
    summary: 'E-mail and phone on the account, masked, with whether each is verified',
  })
  contacts(@CurrentUser() user: AuthContext) {
    return this.account.contacts(user.userId);
  }

  @Throttle(STRICT)
  @Post('contacts/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a code to your own unverified e-mail or phone' })
  verify(@CurrentUser() user: AuthContext, @Body() dto: ContactVerifyDto, @Req() req: Request) {
    return this.account
      .startVerify(user.userId, dto.kind, requestInfoOf(req, this.geo))
      .then((verification) => ({ verification }));
  }

  @Throttle(STRICT)
  @Post('contacts/verify/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirm that code' })
  confirmVerify(@CurrentUser() user: AuthContext, @Body() dto: ChallengeCodeDto) {
    return this.account.confirmVerify(user.userId, dto.challengeId, dto.code);
  }

  @Throttle(STRICT)
  @Post('contacts/change')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Start changing the e-mail or phone',
    description:
      'Needs the password and sends a code to the new address. The answer is the same if that address is already taken.',
  })
  change(@CurrentUser() user: AuthContext, @Body() dto: ContactChangeDto, @Req() req: Request) {
    return this.account
      .startChange(user.userId, dto, requestInfoOf(req, this.geo))
      .then((verification) => ({ verification }));
  }

  @Throttle(STRICT)
  @Post('contacts/change/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirm the code and apply the change. The old address is told.' })
  confirmChange(
    @CurrentUser() user: AuthContext,
    @Body() dto: ChallengeCodeDto,
    @Req() req: Request,
  ) {
    return this.account.confirmChange(
      user.userId,
      dto.challengeId,
      dto.code,
      requestInfoOf(req, this.geo),
    );
  }

  @Get('deletion')
  @ApiOperation({ summary: 'Is deletion scheduled, and when' })
  deletion(@CurrentUser() user: AuthContext) {
    return this.account.deletionStatus(user.userId);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('deletion/request')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Schedule account deletion after the grace period (needs the password)',
  })
  request(@CurrentUser() user: AuthContext, @Body() dto: PasswordConfirmDto, @Req() req: Request) {
    return this.account.requestDeletion(
      user.userId,
      user.sessionId,
      dto.password,
      requestInfoOf(req, this.geo),
    );
  }

  @Post('deletion/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel a scheduled deletion' })
  cancel(@CurrentUser() user: AuthContext, @Req() req: Request) {
    return this.account.cancelDeletion(user.userId, requestInfoOf(req, this.geo));
  }
}
