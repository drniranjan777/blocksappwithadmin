import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryFlag } from '../../common/http/query-flag.js';
import { IsISO8601, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import {
  AdminRoute,
  CurrentAdmin,
  RequirePermissions,
} from '../../common/decorators/route-metadata.js';
import type { AdminAuthContext } from '../../common/http/request.js';
import { PageQueryDto } from '../../common/pagination/page-query.dto.js';
import { AuditQueryService } from './audit-query.service.js';

class AuditQueryDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z][a-z0-9_.]{2,79}$/)
  action?: string;

  /** The part before the first dot, e.g. `admin`, `role`, `user`. */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,39}$/)
  module?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,39}$/)
  targetType?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  targetId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @QueryFlag()
  sensitiveOnly?: boolean;
}

@ApiTags('admin-audit')
@ApiBearerAuth('admin')
@AdminRoute()
@Controller('admin/audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditQueryService) {}

  @RequirePermissions('audit.read')
  @Get()
  @ApiOperation({
    summary: 'The audit trail, newest first',
    description:
      'Cursor-paginated. Entries about access to protected data are visible only with `audit.sensitive.read`.',
  })
  list(@CurrentAdmin() admin: AdminAuthContext, @Query() q: AuditQueryDto) {
    return this.audit.list(q, admin.permissions.has('audit.sensitive.read'));
  }

  @RequirePermissions('audit.read')
  @Get(':id')
  @ApiOperation({ summary: 'One audit entry' })
  get(@CurrentAdmin() admin: AdminAuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.audit.get(id, admin.permissions.has('audit.sensitive.read'));
  }
}
