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
} from '../../common/decorators/route-metadata.js';
import { type AdminAuthContext, clientIp, userAgentOf } from '../../common/http/request.js';
import { AdminUsersService } from './admin-users.service.js';
import {
  AdminListQueryDto,
  InviteAdminDto,
  ReasonDto,
  SetRolesDto,
} from './dto/admin-users.dto.js';

const meta = (req: Request) => ({ ip: clientIp(req), userAgent: userAgentOf(req) });

@ApiTags('admin-staff')
@ApiBearerAuth('admin')
@AdminRoute()
@Controller('admin/staff')
export class AdminUsersController {
  constructor(private readonly staff: AdminUsersService) {}

  @RequirePermissions('admin.users.read')
  @Get()
  @ApiOperation({
    summary: 'Staff accounts',
    description: 'Cursor-paginated. Filter by status, role or name/e-mail.',
  })
  list(@Query() q: AdminListQueryDto) {
    return this.staff.list(q);
  }

  @RequirePermissions('admin.users.read')
  @Get(':id')
  @ApiOperation({ summary: 'One staff account' })
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.staff.get(id);
  }

  @RequirePermissions('admin.users.read')
  @Get(':id/sessions')
  @ApiOperation({ summary: 'Active sign-ins of a staff account' })
  sessions(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.staff.sessionsOf(id);
  }

  @RequirePermissions('admin.users.manage')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  @ApiOperation({
    summary: 'Invite a staff member',
    description:
      'Creates the account and e-mails a temporary password that expires. The password is never returned. The person must choose their own and set up an authenticator before getting access.',
  })
  invite(
    @CurrentAdmin() admin: AdminAuthContext,
    @Body() dto: InviteAdminDto,
    @Req() req: Request,
  ) {
    return this.staff.invite(admin, dto, meta(req));
  }

  @RequirePermissions('admin.users.manage')
  @Post(':id/reinvite')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a new temporary password to someone who has not finished set-up' })
  reinvite(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    return this.staff.reinvite(admin, id, meta(req));
  }

  @RequirePermissions('admin.users.manage')
  @Put(':id/roles')
  @ApiOperation({
    summary: 'Replace a staff member’s roles',
    description:
      'Needs a reason. You cannot change your own roles, grant what you do not hold, or create a combination the separation-of-duties rules forbid.',
  })
  setRoles(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetRolesDto,
    @Req() req: Request,
  ) {
    return this.staff.setRoles(admin, id, dto, meta(req));
  }

  @RequirePermissions('admin.users.manage')
  @Post(':id/disable')
  @HttpCode(200)
  @ApiOperation({ summary: 'Disable a staff account and sign it out everywhere' })
  disable(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReasonDto,
    @Req() req: Request,
  ) {
    return this.staff.disable(admin, id, dto.reason, meta(req));
  }

  @RequirePermissions('admin.users.manage')
  @Post(':id/enable')
  @HttpCode(200)
  @ApiOperation({ summary: 'Re-enable a disabled staff account' })
  enable(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReasonDto,
    @Req() req: Request,
  ) {
    return this.staff.enable(admin, id, dto.reason, meta(req));
  }

  @RequirePermissions('admin.users.manage')
  @Post(':id/reset-two-factor')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reset two-step verification for someone who lost their device',
    description:
      'Another administrator must do it, with a reason. The person is signed out and sets it up again.',
  })
  resetTwoFactor(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReasonDto,
    @Req() req: Request,
  ) {
    return this.staff.resetTwoFactor(admin, id, dto.reason, meta(req));
  }

  @RequirePermissions('admin.sessions.revoke')
  @Post(':id/revoke-sessions')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign a staff member out of every device' })
  revokeSessions(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReasonDto,
    @Req() req: Request,
  ) {
    return this.staff.revokeSessions(admin, id, dto.reason, meta(req));
  }
}
