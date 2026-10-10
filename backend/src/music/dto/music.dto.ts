import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PageQueryDto } from '../../common/pagination/page-query.dto.js';

export const CATEGORIES = [
  'TRENDING',
  'POPULAR',
  'NEW_RELEASES',
  'HINDI',
  'TELUGU',
  'TAMIL',
  'BENGALI',
  'MARATHI',
  'PUNJABI',
  'KANNADA',
  'MALAYALAM',
  'INSTRUMENTAL',
  'DEVOTIONAL',
  'TRAVEL',
  'FITNESS',
  'ROMANTIC',
  'COMEDY',
] as const;
export const USES = ['REEL', 'STORY', 'POST', 'ADVERTISING'] as const;
export const RIGHTS = [
  'PLATFORM_OWNED',
  'LICENSED',
  'CREATOR_OWNED',
  'ROYALTY_FREE',
  'RESTRICTED',
] as const;

export type Category = (typeof CATEGORIES)[number];
export type Use = (typeof USES)[number];
export type Rights = (typeof RIGHTS)[number];

/** Territories are two-letter country codes; `WW` (licences only) means anywhere. */
const COUNTRY = /^[A-Za-z]{2}$/;

// ---------------------------------------------------------------- listeners --

export class MusicListQueryDto extends PageQueryDto {
  /** What the music is for. Defaults to a reel. */
  @IsOptional()
  @IsEnum(USES)
  use?: Use;

  @IsOptional()
  @IsEnum(CATEGORIES)
  category?: Category;

  /** Part of a title or artist name. */
  @IsOptional()
  @IsString()
  @Length(1, 60)
  q?: string;
}

// -------------------------------------------------------------------- staff --

export class StaffMusicListQueryDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(['DRAFT', 'ACTIVE', 'SUSPENDED', 'EXPIRED'])
  status?: 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';

  @IsOptional()
  @IsString()
  @Length(1, 60)
  q?: string;
}

/** Sensitive changes carry a reason, which goes into the audit log. */
export class MusicReasonDto {
  @IsString()
  @Length(5, 500)
  reason!: string;
}

export class CreateTrackDto {
  @IsString()
  @Length(1, 160)
  title!: string;

  @IsString()
  @Length(1, 120)
  artist!: string;

  @IsString()
  @Length(2, 40)
  language!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  genre?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsEnum(CATEGORIES, { each: true })
  categories?: Category[];
}

export class UpdateTrackDto {
  @IsOptional()
  @IsString()
  @Length(1, 160)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  artist?: string;

  @IsOptional()
  @IsString()
  @Length(2, 40)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  genre?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsEnum(CATEGORIES, { each: true })
  categories?: Category[];

  /** Where the track may be played. Changing this needs a `reason`. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @Matches(COUNTRY, { each: true })
  allowedCountries?: string[];

  /** What it may be used for. Changing this needs a `reason`. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsEnum(USES, { each: true })
  allowedUses?: Use[];

  @IsOptional()
  @IsString()
  @Length(5, 500)
  reason?: string;
}

export class SetRightsDto extends MusicReasonDto {
  @IsEnum(RIGHTS)
  rightsType!: Rights;
}

export class FileUploadDto {
  @IsString()
  @Length(3, 100)
  contentType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sizeBytes!: number;
}

export class CompleteAudioDto {
  /** Where, in seconds, the 30-second preview starts. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(600)
  previewStartSeconds?: number;
}

export class CreateLicenceDto {
  @IsString()
  @Length(2, 160)
  licensor!: string;

  /** The contract reference, for finding it in your own records. No terms or amounts here. */
  @IsString()
  @Length(2, 120)
  reference!: string;

  @IsEnum(RIGHTS)
  rightsType!: Rights;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @ArrayUnique()
  @Matches(COUNTRY, { each: true })
  territories!: string[];

  @IsISO8601({ strict: true })
  startsAt!: string;

  /** Leave out for a licence that does not end. */
  @IsOptional()
  @IsISO8601({ strict: true })
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  restrictionsNote?: string;
}
