import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
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
import { PageQueryDto } from '../common/pagination/page-query.dto.js';

/** One report from the app: what was on screen, and for how long. The server decides what it means. */
export class ReachEventDto {
  @IsIn(['reel', 'post'])
  kind!: 'reel' | 'post';

  @IsUUID()
  id!: string;

  /** Only what a phone can honestly observe. Qualified views and completions are worked out by the server. */
  @IsIn(['IMPRESSION', 'WATCH'])
  type!: 'IMPRESSION' | 'WATCH';

  /** How long it was on screen, in milliseconds. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3_600_000)
  watchMs?: number;

  /** The phone's own id for this viewing, so a retried request is not counted twice. */
  @Matches(/^[A-Za-z0-9_-]{8,64}$/)
  eventId!: string;
}

export class IngestEventsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ReachEventDto)
  events!: ReachEventDto[];
}

export class ConfigDraftDto {
  /** A complete configuration. Leave out to start from a copy of the active one. */
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReasonDto {
  @IsString()
  @Length(5, 500)
  reason!: string;
}

export class HistoryQueryDto extends PageQueryDto {}
