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
import { CurrentUser } from '../common/decorators/route-metadata.js';
import { GeoLocator } from '../common/http/geo-locator.js';
import { requestInfoOf, type AuthContext } from '../common/http/request.js';
import {
  AlertPreferencesDto,
  PasswordConfirmDto,
  SecureAccountDto,
  SecurityEventsQueryDto,
  TwoFactorConfirmDto,
  TwoFactorSetupDto,
} from './dto/security.dto.js';
import { SecurityService } from './security.service.js';

@ApiTags('security')
@ApiBearerAuth('user')
@Controller('security')
export class SecurityController {
  constructor(
    private readonly security: SecurityService,
    private readonly geo: GeoLocator,
  ) {}

  @Get('events')
  @ApiOperation({
    summary: 'Login activity and security events, newest first',
    description: 'Cursor-paginated.',
  })
  events(@CurrentUser() user: AuthContext, @Query() q: SecurityEventsQueryDto) {
    return this.security.listEvents(user.userId, q);
  }

  @Get('events/:id')
  @ApiOperation({ summary: 'One security event' })
  event(@CurrentUser() user: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.security.getEvent(user.userId, id);
  }

  @Post('events/:id/acknowledge')
  @HttpCode(200)
  @ApiOperation({ summary: '"This was me": mark an event as seen' })
  acknowledge(@CurrentUser() user: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.security.acknowledge(user.userId, id);
  }

  @Get('alert-preferences')
  @ApiOperation({ summary: 'Which security alerts to receive' })
  preferences(@CurrentUser() user: AuthContext) {
    return this.security.getPreferences(user.userId);
  }

  @Put('alert-preferences')
  @ApiOperation({
    summary: 'Change alert preferences',
    description:
      'Serious alerts (suspicious sign-in, password change, lock-out) are always sent, whatever is chosen here.',
  })
  setPreferences(@CurrentUser() user: AuthContext, @Body() dto: AlertPreferencesDto) {
    return this.security.setPreferences(user.userId, dto);
  }

  @Get('sent-alerts')
  @ApiOperation({ summary: 'Security e-mails and alerts sent to this account' })
  sentAlerts(@CurrentUser() user: AuthContext) {
    return this.security.sentAlerts(user.userId);
  }

  @Post('secure-account')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign other devices out and prompt a password change' })
  secure(@CurrentUser() user: AuthContext, @Body() dto: SecureAccountDto, @Req() req: Request) {
    return this.security.secureAccount(
      user.userId,
      user.sessionId,
      dto.includeThisDevice ?? false,
      requestInfoOf(req, this.geo),
    );
  }

  @Get('two-factor')
  @ApiOperation({ summary: 'Two-step verification status' })
  twoFactor(@CurrentUser() user: AuthContext) {
    return this.security.twoFactorStatus(user.userId);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('two-factor/setup')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Begin turning on two-step verification (needs the password)',
    description:
      'totp: returns a secret and an otpauth:// URI for the authenticator app. sms / email: sends a code to the verified number or address.',
  })
  setup(@CurrentUser() user: AuthContext, @Body() dto: TwoFactorSetupDto, @Req() req: Request) {
    return this.security.twoFactorSetup(
      user.userId,
      dto.method,
      dto.password,
      requestInfoOf(req, this.geo),
    );
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('two-factor/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Finish setup with a code. Returns the backup codes, once.' })
  confirm(@CurrentUser() user: AuthContext, @Body() dto: TwoFactorConfirmDto, @Req() req: Request) {
    return this.security.twoFactorConfirm(user.userId, dto, requestInfoOf(req, this.geo));
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('two-factor/disable')
  @HttpCode(200)
  @ApiOperation({ summary: 'Turn two-step verification off (needs the password)' })
  disable(@CurrentUser() user: AuthContext, @Body() dto: PasswordConfirmDto, @Req() req: Request) {
    return this.security.twoFactorDisable(user.userId, dto.password, requestInfoOf(req, this.geo));
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('two-factor/backup-codes')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Replace the backup codes (needs the password). Returns the new ones, once.',
  })
  backupCodes(@CurrentUser() user: AuthContext, @Body() dto: PasswordConfirmDto) {
    return this.security.regenerateBackupCodes(user.userId, dto.password);
  }
}
