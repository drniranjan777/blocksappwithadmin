import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsString, IsUUID, Length, Matches } from 'class-validator';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/route-metadata.js';
import { type AuthContext, clientIp } from '../common/http/request.js';
import type { StepUpPurpose } from '../generated/prisma/client.js';
import { StepUpService } from './step-up.service.js';

const PURPOSES = [
  'ADD_BANK_ACCOUNT',
  'CHANGE_BANK_ACCOUNT',
  'REMOVE_BANK_ACCOUNT',
  'REQUEST_PAYOUT',
  'UPDATE_TAX_INFO',
] as const;

class BeginStepUpDto {
  @IsIn(PURPOSES)
  purpose!: StepUpPurpose;

  /** Your account password. */
  @IsString()
  @Length(1, 200)
  password!: string;
}

class ResendDto {
  @IsUUID()
  challengeId!: string;
}

class VerifyStepUpDto {
  @IsUUID()
  challengeId!: string;

  @IsString()
  @Matches(/^[0-9]{6}$/)
  code!: string;
}

@ApiTags('auth')
@ApiBearerAuth('user')
@Controller('auth/step-up')
export class StepUpController {
  constructor(private readonly stepUp: StepUpService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Start a step-up: confirm your password and get a code',
    description:
      'Before adding, changing or removing a bank account, requesting a payout, or changing tax details. The code goes to your verified e-mail or phone. Wrong passwords count against the same limiter as every other password re-check.',
  })
  begin(@CurrentUser() u: AuthContext, @Body() dto: BeginStepUpDto, @Req() req: Request) {
    return this.stepUp.begin(u.userId, dto.purpose, dto.password, clientIp(req));
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('resend')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send the code again (with a cooldown and a cap)' })
  resend(@CurrentUser() u: AuthContext, @Body() dto: ResendDto, @Req() req: Request) {
    return this.stepUp.resend(u.userId, dto.challengeId, clientIp(req));
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Confirm the code and receive a step-up token',
    description:
      'The token works once, for the purpose you asked for, for five minutes. Send it in the `X-Step-Up-Token` header of the sensitive request.',
  })
  verify(@CurrentUser() u: AuthContext, @Body() dto: VerifyStepUpDto) {
    return this.stepUp.verify(u.userId, dto.challengeId, dto.code);
  }
}
