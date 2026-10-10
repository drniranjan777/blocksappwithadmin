import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  AdminRoute,
  CurrentAdmin,
  RequirePermissions,
} from '../../common/decorators/route-metadata.js';
import { type AdminAuthContext, clientIp, userAgentOf } from '../../common/http/request.js';
import { RoleDto, UpdateRoleDto } from '../users/dto/admin-users.dto.js';
import { RolesService } from './roles.service.js';

const meta = (req: Request) => ({ ip: clientIp(req), userAgent: userAgentOf(req) });

@ApiTags('admin-roles')
@ApiBearerAuth('admin')
@AdminRoute()
@Controller('admin')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @RequirePermissions('admin.roles.read')
  @Get('permissions')
  @ApiOperation({ summary: 'The permission catalogue, grouped by module' })
  permissions() {
    return this.roles.catalogue();
  }

  @RequirePermissions('admin.roles.read')
  @Get('roles')
  @ApiOperation({ summary: 'Roles, the permissions each grants, and how many staff hold them' })
  list() {
    return this.roles.list();
  }

  @RequirePermissions('admin.roles.read')
  @Get('roles/:id')
  @ApiOperation({ summary: 'One role' })
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.roles.get(id);
  }

  @RequirePermissions('admin.roles.manage')
  @Post('roles')
  @ApiOperation({
    summary: 'Create a custom role',
    description:
      'You can only include permissions you hold yourself, and the role may not combine permissions the separation-of-duties rules keep apart.',
  })
  create(@CurrentAdmin() admin: AdminAuthContext, @Body() dto: RoleDto, @Req() req: Request) {
    return this.roles.create(admin, dto, meta(req));
  }

  @RequirePermissions('admin.roles.manage')
  @Put('roles/:id')
  @ApiOperation({ summary: 'Change a custom role (built-in roles are defined in code)' })
  update(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateRoleDto,
    @Req() req: Request,
  ) {
    return this.roles.update(admin, id, dto, meta(req));
  }

  @RequirePermissions('admin.roles.manage')
  @Delete('roles/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a custom role nobody holds' })
  async remove(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.roles.remove(admin, id, meta(req));
  }
}
