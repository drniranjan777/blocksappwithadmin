import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  AdminRoute,
  AllowEnrolScope,
  CurrentAdmin,
  Public,
} from '../../common/decorators/route-metadata.js';
import { type AdminAuthContext, clientIp, userAgentOf } from '../../common/http/request.js';
import {
  AdminChangePasswordDto,
  AdminConfirmTwoFactorDto,
  AdminLoginDto,
  AdminRefreshDto,
  AdminVerifyDto,
} from './dto/admin-auth.dto.js';
import { AdminAuthService } from './admin-auth.service.js';

const meta = (req: Request) => ({ ip: clientIp(req), userAgent: userAgentOf(req) });

/**
 * Staff sign-in, in the order the console walks through it:
 * `login` -> (`password/change`) -> (`two-factor/setup` + `confirm`) or `login/verify`.
 * Every answer carries `nextStep`; `null` means fully signed in.
 */
@ApiTags('admin-auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Staff sign-in, step one: e-mail and password',
    description:
      'Returns tokens limited to the remaining set-up steps and `nextStep` (`password_change`, `two_factor_setup` or `two_factor`). Wrong details always give 401 INVALID_CREDENTIALS; after too many, 423 ACCOUNT_LOCKED.',
  })
  login(@Body() dto: AdminLoginDto, @Req() req: Request) {
    return this.auth.login(dto, meta(req));
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Exchange a refresh token for new tokens (single-use, rotates)' })
  refresh(@Body() dto: AdminRefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, meta(req));
  }

  @AdminRoute()
  @AllowEnrolScope()
  @ApiBearerAuth('admin')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Staff sign-in, last step: authenticator or backup code' })
  verify(
    @CurrentAdmin() admin: AdminAuthContext,
    @Body() dto: AdminVerifyDto,
    @Req() req: Request,
  ) {
    return this.auth.verifySecondFactor(admin, dto, meta(req));
  }

  @AdminRoute()
  @AllowEnrolScope()
  @ApiBearerAuth('admin')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('password/change')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Change the password (required after an invitation)',
    description: 'Staff passwords need 14+ characters. Other devices are signed out.',
  })
  changePassword(
    @CurrentAdmin() admin: AdminAuthContext,
    @Body() dto: AdminChangePasswordDto,
    @Req() req: Request,
  ) {
    return this.auth.changePassword(admin, dto, meta(req));
  }

  @AdminRoute()
  @AllowEnrolScope()
  @ApiBearerAuth('admin')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('two-factor/setup')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Begin two-step verification: returns the secret and an otpauth:// link',
  })
  setupTwoFactor(@CurrentAdmin() admin: AdminAuthContext) {
    return this.auth.beginTwoFactorSetup(admin);
  }

  @AdminRoute()
  @AllowEnrolScope()
  @ApiBearerAuth('admin')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('two-factor/confirm')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Finish set-up with a first code. Returns the backup codes once, and full access.',
  })
  confirmTwoFactor(
    @CurrentAdmin() admin: AdminAuthContext,
    @Body() dto: AdminConfirmTwoFactorDto,
    @Req() req: Request,
  ) {
    return this.auth.confirmTwoFactorSetup(admin, dto.code, meta(req));
  }

  @AdminRoute()
  @AllowEnrolScope()
  @ApiBearerAuth('admin')
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Sign out' })
  async logout(@CurrentAdmin() admin: AdminAuthContext, @Req() req: Request): Promise<void> {
    await this.auth.logout(admin, meta(req));
  }

  @AdminRoute()
  @AllowEnrolScope()
  @ApiBearerAuth('admin')
  @Get('me')
  @ApiOperation({
    summary: 'Who is signed in, their roles and permissions, and what is left to set up',
  })
  me(@CurrentAdmin() admin: AdminAuthContext) {
    return this.auth.me(admin);
  }
}
