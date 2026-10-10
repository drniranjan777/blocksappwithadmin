import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser, Public } from '../common/decorators/route-metadata.js';
import { GeoLocator } from '../common/http/geo-locator.js';
import { requestInfoOf } from '../common/http/request.js';
import type { AuthContext } from '../common/http/request.js';
import { AuthService } from './auth.service.js';
import {
  ChallengeRefDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  LoginVerifyDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyContactDto,
  VerifyResetDto,
} from './dto/auth.dto.js';
import { PasswordService } from './password.service.js';

// Limits per IP are generous because many mobile users share one carrier address;
// the real brake is per-identifier lock-out and per-code attempt budgets.
const SIGN_IN = { default: { limit: 30, ttl: 60_000 } };
const ONE_TIME_CODE = { default: { limit: 30, ttl: 60_000 } };
const RECOVERY = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwords: PasswordService,
    private readonly geo: GeoLocator,
  ) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('register')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Create an account',
    description:
      'Creates the account and sends a code to the e-mail or phone given. The response is the same whether or not that address already has an account.',
  })
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto, requestInfoOf(req, this.geo));
  }

  @Public()
  @Throttle(ONE_TIME_CODE)
  @Post('verify-contact')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirm the code sent at registration and sign in' })
  verifyContact(@Body() dto: VerifyContactDto, @Req() req: Request) {
    return this.auth.verifyContact(dto, requestInfoOf(req, this.geo));
  }

  @Public()
  @Throttle(RECOVERY)
  @Post('resend')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a new code for a pending verification' })
  resend(@Body() dto: ChallengeRefDto, @Req() req: Request) {
    return this.auth.resendVerification(dto, requestInfoOf(req, this.geo));
  }

  @Public()
  @Throttle(SIGN_IN)
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Sign in with username, e-mail or phone, and a password',
    description:
      'Returns `authenticated` with tokens, or `two_factor_required` / `verification_required` with a challenge to complete at `/auth/login/verify`. Wrong details always give 401 INVALID_CREDENTIALS with `attemptsRemaining`; after too many, 423 ACCOUNT_LOCKED.',
  })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, requestInfoOf(req, this.geo));
  }

  @Public()
  @Throttle(ONE_TIME_CODE)
  @Post('login/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Finish a sign-in that needs a second step' })
  loginVerify(@Body() dto: LoginVerifyDto, @Req() req: Request) {
    return this.auth.completeLogin(dto, requestInfoOf(req, this.geo));
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Exchange a refresh token for new tokens',
    description:
      'The refresh token is single-use: the response carries its replacement. Send one refresh at a time; presenting an already-replaced token ends the session.',
  })
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth
      .refresh(dto.refreshToken, requestInfoOf(req, this.geo))
      .then((tokens) => ({ tokens }));
  }

  @ApiBearerAuth('user')
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Sign this device out' })
  async logout(@CurrentUser() user: AuthContext): Promise<void> {
    await this.auth.logout(user.userId, user.sessionId);
  }

  @Public()
  @Get('password-policy')
  @ApiOperation({ summary: 'The password rules, so the app can show them' })
  policy() {
    return this.passwords.policy();
  }

  @Public()
  @Get('policy')
  @ApiOperation({
    summary: 'Password rules, sign-in lock-out and one-time-code limits, in one answer',
    description:
      'What the person is told anyway, published so an app shows the real numbers rather than its own guesses.',
  })
  securityPolicy() {
    return this.passwords.securityPolicy();
  }

  @Public()
  @Throttle(RECOVERY)
  @Post('password/forgot')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Start a password reset',
    description: 'Always answers the same way, whether or not an account matches.',
  })
  forgot(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    return this.passwords
      .forgot(dto.identifier, requestInfoOf(req, this.geo))
      .then((verification) => ({ verification }));
  }

  @Public()
  @Throttle(RECOVERY)
  @Post('password/resend')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Send a new reset code',
    description: 'Waits out a cool-down and stops after a few. Never says where the code was sent.',
  })
  resendReset(@Body() dto: ChallengeRefDto, @Req() req: Request) {
    return this.passwords.resend(dto.challengeId, requestInfoOf(req, this.geo));
  }

  @Public()
  @Throttle(ONE_TIME_CODE)
  @Post('password/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Check the reset code; returns a short-lived reset token' })
  verifyReset(@Body() dto: VerifyResetDto) {
    return this.passwords.verifyCode(dto.challengeId, dto.code);
  }

  @Public()
  @Throttle(RECOVERY)
  @Post('password/reset')
  @HttpCode(204)
  @ApiOperation({ summary: 'Set a new password with the reset token. Signs out every device.' })
  async reset(@Body() dto: ResetPasswordDto, @Req() req: Request): Promise<void> {
    await this.passwords.reset(dto.resetToken, dto.newPassword, requestInfoOf(req, this.geo));
  }

  @ApiBearerAuth('user')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('password/change')
  @HttpCode(200)
  @ApiOperation({ summary: 'Change the password (needs the current one)' })
  change(@CurrentUser() user: AuthContext, @Body() dto: ChangePasswordDto, @Req() req: Request) {
    return this.passwords.change(
      user.userId,
      user.sessionId,
      {
        currentPassword: dto.currentPassword,
        newPassword: dto.newPassword,
        signOutOtherDevices: dto.signOutOtherDevices ?? true,
      },
      requestInfoOf(req, this.geo),
    );
  }
}
