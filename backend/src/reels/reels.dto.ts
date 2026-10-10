import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SELF_LABELS, VISIBILITIES } from '../social/posts/posts.dto.js';
import { FILTER_IDS, TRANSITION_IDS } from './reel-looks.js';

export const MAX_CLIPS = 20;
export const MAX_OVERLAYS = 20;
/** The longest a reel may be. Creators pick a shorter limit in the editor (15 to 180 seconds). */
export const MAX_REEL_MS = 180_000;
export const MIN_REEL_MS = 1_000;
export const MIN_CLIP_MS = 300;
export const PHOTO_MIN_MS = 500;
export const PHOTO_MAX_MS = 15_000;
export const PHOTO_DEFAULT_MS = 3_000;

/** Manual colour adjustments. Each is a plain number in a fixed range; 0 means "unchanged". */
export class AdjustmentsDto {
  @IsOptional() @IsNumber() @Min(-1) @Max(1) brightness?: number;
  @IsOptional() @IsNumber() @Min(-1) @Max(1) contrast?: number;
  @IsOptional() @IsNumber() @Min(-1) @Max(1) saturation?: number;
  @IsOptional() @IsNumber() @Min(-1) @Max(1) temperature?: number;
  @IsOptional() @IsNumber() @Min(-1) @Max(1) highlights?: number;
  @IsOptional() @IsNumber() @Min(-1) @Max(1) shadows?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) sharpness?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) fade?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) vignette?: number;
}

/** One piece of the timeline: a clip or photo you uploaded as `REEL_CLIP`, and how it looks. */
export class ReelClipDto {
  @IsUUID()
  mediaId!: string;

  /** Where the part that plays starts, in the source. A photo ignores it. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3_600_000)
  startMs?: number;

  /** Where it ends. For a photo this is how long it is shown (default 3 s). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3_600_000)
  endMs?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1.5)
  volume?: number;

  /** One of the filter ids in the app's catalogue. */
  @IsOptional()
  @IsIn(FILTER_IDS)
  filterId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  filterIntensity?: number;

  /** What happens as this clip ends and the next begins. */
  @IsOptional()
  @IsIn(TRANSITION_IDS)
  transitionId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AdjustmentsDto)
  adjustments?: AdjustmentsDto;
}

export class OverlayStyleDto {
  @IsOptional() @IsString() @Matches(/^[a-z0-9_-]{1,40}$/) fontId?: string;
  @IsOptional() @IsInt() @Min(0) @Max(0xffffffff) colorValue?: number;
  @IsOptional() @IsInt() @Min(0) @Max(0xffffffff) backgroundValue?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) backgroundOpacity?: number;
  @IsOptional() @IsEnum(['start', 'center', 'end']) align?: 'start' | 'center' | 'end';
  @IsOptional()
  @IsEnum(['none', 'fade', 'pop', 'slideUp', 'typewriter'])
  animation?: 'none' | 'fade' | 'pop' | 'slideUp' | 'typewriter';
  @IsOptional() @IsBoolean() bold?: boolean;
}

/** Text or a sticker placed on the video. The app draws it over the picture. */
export class OverlayDto {
  @IsEnum(['text', 'sticker'])
  type!: 'text' | 'sticker';

  /** The words, or (for a sticker) the sticker's id. */
  @IsString()
  @Length(1, 200)
  content!: string;

  @IsInt() @Min(0) @Max(MAX_REEL_MS) startMs!: number;
  @IsInt() @Min(1) @Max(MAX_REEL_MS) endMs!: number;
  @IsNumber() @Min(0) @Max(1) x!: number;
  @IsNumber() @Min(0) @Max(1) y!: number;
  @IsOptional() @IsNumber() @Min(0.2) @Max(4) scale?: number;
  @IsOptional() @IsNumber() @Min(-360) @Max(360) rotation?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => OverlayStyleDto)
  style?: OverlayStyleDto;
}

/**
 * Creating a reel. You describe the edit; the server renders it. It never accepts the
 * finished video, a reach level, a counter, a moderation state, a location or a time.
 */
export class CreateReelDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CLIPS)
  @ValidateNested({ each: true })
  @Type(() => ReelClipDto)
  clips!: ReelClipDto[];

  /** Up to 2200 characters. Hashtags and mentions are read from it by the server. */
  @IsString()
  @MaxLength(2200)
  caption!: string;

  @IsOptional()
  @IsEnum(VISIBILITIES)
  visibility?: (typeof VISIBILITIES)[number];

  @IsOptional()
  @IsEnum(SELF_LABELS)
  label?: (typeof SELF_LABELS)[number];

  @IsOptional() @IsBoolean() allowComments?: boolean;
  @IsOptional() @IsBoolean() allowRemix?: boolean;
  @IsOptional() @IsBoolean() allowSharing?: boolean;

  /** A track from the music library. Checked against your country and the licence. */
  @IsOptional()
  @IsUUID()
  musicTrackId?: string;

  /** Which part of the track plays: from `musicStartMs` to `musicEndMs`. */
  @IsOptional() @IsInt() @Min(0) @Max(3_600_000) musicStartMs?: number;
  @IsOptional() @IsInt() @Min(1) @Max(3_600_000) musicEndMs?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  musicVolume?: number;

  /** Another creator's original sound, if they let others reuse it. Not together with a track. */
  @IsOptional()
  @IsUUID()
  reusedAudioId?: string;

  /** A `REEL_COVER` image of your own. Without one, a still from the video is used. */
  @IsOptional()
  @IsUUID()
  coverMediaId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_OVERLAYS)
  @ValidateNested({ each: true })
  @Type(() => OverlayDto)
  overlays?: OverlayDto[];
}

/** What can change after publishing. The video, its clips and its sound cannot. */
export class UpdateReelDto {
  @IsOptional() @IsString() @MaxLength(2200) caption?: string;
  @IsOptional() @IsEnum(VISIBILITIES) visibility?: (typeof VISIBILITIES)[number];
  @IsOptional() @IsEnum(SELF_LABELS) label?: (typeof SELF_LABELS)[number];
  @IsOptional() @IsBoolean() allowComments?: boolean;
  @IsOptional() @IsBoolean() allowRemix?: boolean;
  @IsOptional() @IsBoolean() allowSharing?: boolean;
}
