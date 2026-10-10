import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { PageQueryDto } from '../../../common/pagination/page-query.dto.js';

const ROLE_KEY = /^[a-z][a-z0-9_]{2,59}$/;

export class InviteAdminDto {
  @IsString()
  @Length(3, 254)
  email!: string;

  @IsString()
  @Length(2, 120)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ArrayUnique()
  @Matches(ROLE_KEY, { each: true })
  roleKeys!: string[];
}

/** Sensitive changes carry a reason, which goes into the audit log. */
export class ReasonDto {
  @IsString()
  @Length(5, 500)
  reason!: string;
}

export class SetRolesDto extends ReasonDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ArrayUnique()
  @Matches(ROLE_KEY, { each: true })
  roleKeys!: string[];
}

export class AdminListQueryDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(['INVITED', 'ACTIVE', 'DISABLED'])
  status?: 'INVITED' | 'ACTIVE' | 'DISABLED';

  @IsOptional()
  @IsString()
  @Matches(ROLE_KEY)
  role?: string;

  /** Matches part of the name or e-mail. */
  @IsOptional()
  @IsString()
  @Length(1, 80)
  q?: string;
}

export class RoleDto {
  @IsString()
  @Matches(ROLE_KEY, { message: 'key must be lower-case letters, digits and underscores' })
  key!: string;

  @IsString()
  @Length(3, 80)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  @Type(() => String)
  permissionKeys!: string[];
}

export class UpdateRoleDto {
  @IsString()
  @Length(3, 80)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  @Type(() => String)
  permissionKeys!: string[];
}
