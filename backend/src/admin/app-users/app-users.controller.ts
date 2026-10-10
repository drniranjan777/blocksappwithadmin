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
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import type { Request } from 'express';
import {
  AdminRoute,
  CurrentAdmin,
  RequirePermissions,
} from '../../common/decorators/route-metadata.js';
import { type AdminAuthContext, clientIp, userAgentOf } from '../../common/http/request.js';
import { PageQueryDto } from '../../common/pagination/page-query.dto.js';
import { AppUsersService } from './app-users.service.js';

class UsersQueryDto extends PageQueryDto {
  /** Part of a username or name, or an exact e-mail address or phone number. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED', 'RESTRICTED', 'PENDING_DELETION'])
  status?: 'ACTIVE' | 'SUSPENDED' | 'RESTRICTED' | 'PENDING_DELETION';

  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH'])
  risk?: 'LOW' | 'MEDIUM' | 'HIGH';
}

class UserReasonDto {
  @IsString()
  @Length(10, 500)
  reason!: string;
}

class NoteDto {
  @IsString()
  @Length(3, 2000)
  body!: string;
}

const meta = (req: Request) => ({ ip: clientIp(req), userAgent: userAgentOf(req) });
const uuid = () => new ParseUUIDPipe();

@ApiTags('admin-users')
@ApiBearerAuth('admin')
@AdminRoute()
@Controller('admin/users')
export class AppUsersController {
  constructor(private readonly users: AppUsersService) {}

  @RequirePermissions('users.read')
  @Get()
  @ApiOperation({
    summary: 'Find app users',
    description:
      'Cursor-paginated, newest first. `q` matches the start of a username, part of a display name, or an exact e-mail or phone number. Contact details are masked.',
  })
  list(@Query() q: UsersQueryDto) {
    return this.users.list(q);
  }

  @RequirePermissions('users.read')
  @Get(':id')
  @ApiOperation({
    summary: 'One account',
    description:
      'Contact details are masked unless you also hold `users.read_contact`, in which case showing them is recorded on the sensitive audit trail.',
  })
  get(@CurrentAdmin() a: AdminAuthContext, @Param('id', uuid()) id: string, @Req() req: Request) {
    return this.users.get(a, id, meta(req));
  }

  @RequirePermissions('users.suspend')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post(':id/suspend')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Suspend an account',
    description: 'Signs the person out everywhere. Needs a reason.',
  })
  suspend(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: UserReasonDto,
    @Req() req: Request,
  ) {
    return this.users.changeStatus(a, id, 'suspend', dto.reason, meta(req));
  }

  @RequirePermissions('users.restrict')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post(':id/restrict')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Restrict an account',
    description:
      'The person can sign in but cannot publish, and their content is hidden. Needs a reason.',
  })
  restrict(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: UserReasonDto,
    @Req() req: Request,
  ) {
    return this.users.changeStatus(a, id, 'restrict', dto.reason, meta(req));
  }

  @RequirePermissions('users.restore')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post(':id/restore')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reactivate a suspended or restricted account',
    description: 'Needs a reason.',
  })
  restore(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: UserReasonDto,
    @Req() req: Request,
  ) {
    return this.users.changeStatus(a, id, 'restore', dto.reason, meta(req));
  }

  @RequirePermissions('users.sessions.revoke')
  @Post(':id/sessions/revoke')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign the person out of every device', description: 'Needs a reason.' })
  revoke(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: UserReasonDto,
    @Req() req: Request,
  ) {
    return this.users.revokeSessions(a, id, dto.reason, meta(req));
  }

  @RequirePermissions('users.notes.read')
  @Get(':id/notes')
  @ApiOperation({ summary: 'Internal notes about a person' })
  notes(@Param('id', uuid()) id: string) {
    return this.users.notes(id);
  }

  @RequirePermissions('users.notes.write')
  @Post(':id/notes')
  @ApiOperation({ summary: 'Add an internal note' })
  addNote(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: NoteDto,
    @Req() req: Request,
  ) {
    return this.users.addNote(a, id, dto.body, meta(req));
  }
}
