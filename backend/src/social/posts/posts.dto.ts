import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * Labels a person may give their own post. `VERIFIED_PUBLISHER` and `CORRECTED`
 * are decided by staff and cannot be self-assigned.
 */
export const SELF_LABELS = [
  'ORIGINAL',
  'COMMUNITY_REPORT',
  'UNVERIFIED',
  'SOURCE_LINKED',
  'AI_GENERATED',
] as const;

export const VISIBILITIES = ['PUBLIC', 'FOLLOWERS', 'CLOSE_FRIENDS', 'PRIVATE'] as const;

/**
 * Creating a post. The server decides everything that is not a choice: reach
 * level, counters, moderation state, location, timestamps. Sending any of them
 * is an error, not a hint.
 */
export class CreatePostDto {
  @IsEnum(['TEXT', 'PHOTO'])
  type!: 'TEXT' | 'PHOTO';

  /** Up to 2200 characters. Required for a text post. */
  @IsString()
  @MaxLength(2200)
  caption!: string;

  @IsOptional()
  @IsEnum(VISIBILITIES)
  visibility?: (typeof VISIBILITIES)[number];

  /** Processed `POST_IMAGE` assets of your own, 1 to 10, for a photo post. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  mediaIds?: string[];

  @IsOptional()
  @IsEnum(SELF_LABELS)
  label?: (typeof SELF_LABELS)[number];

  @IsOptional()
  @IsBoolean()
  allowComments?: boolean;

  @IsOptional()
  @IsBoolean()
  allowSharing?: boolean;

  /** Post on behalf of one of your published business pages. */
  @IsOptional()
  @IsUUID()
  businessPageId?: string;
}

/** What can change after publishing. Photos and the post type cannot. */
export class UpdatePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(2200)
  caption?: string;

  @IsOptional()
  @IsEnum(VISIBILITIES)
  visibility?: (typeof VISIBILITIES)[number];

  @IsOptional()
  @IsEnum(SELF_LABELS)
  label?: (typeof SELF_LABELS)[number];

  @IsOptional()
  @IsBoolean()
  allowComments?: boolean;

  @IsOptional()
  @IsBoolean()
  allowSharing?: boolean;
}
