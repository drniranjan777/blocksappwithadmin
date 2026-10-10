import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export const GENDERS = ['male', 'female', 'non_binary', 'prefer_not_to_say'] as const;

/**
 * What a person may change about their own profile. Anything not listed here
 * (badge, counts, status, account type) is refused, not ignored: the global
 * validation pipe rejects unknown fields.
 *
 * `null` clears an optional field; leaving it out leaves it alone.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  displayName?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(300)
  bio?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(200)
  websiteUrl?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(80)
  state?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(80)
  district?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(80)
  city?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(GENDERS)
  gender?: (typeof GENDERS)[number] | null;

  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;

  /** An uploaded, processed AVATAR image of your own; `null` removes the picture. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  avatarMediaId?: string | null;
}
