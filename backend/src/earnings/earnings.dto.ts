import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { PageQueryDto } from '../common/pagination/page-query.dto.js';

const AMOUNT = /^\d{1,16}(\.\d{1,2})?$/;
const SIGNED_AMOUNT = /^-?\d{1,16}(\.\d{1,2})?$/;

export class CreateCycleDto {
  /** A name staff will recognise, e.g. "2026-11". */
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9 _-]{1,38}[A-Za-z0-9]$/)
  label!: string;

  @Type(() => Date)
  @IsDate()
  startsAt!: Date;

  @Type(() => Date)
  @IsDate()
  endsAt!: Date;

  /** Rupees to share among creators, e.g. "250000.00". */
  @IsString()
  @Matches(AMOUNT)
  poolAmount!: string;
}

export class UpdateCycleDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startsAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endsAt?: Date;

  @IsOptional()
  @IsString()
  @Matches(AMOUNT)
  poolAmount?: string;
}

export class AdjustmentDto {
  @IsUUID()
  userId!: string;

  /** Rupees, positive to add and negative to take away, e.g. "-150.00". */
  @IsString()
  @Matches(SIGNED_AMOUNT)
  amount!: string;

  @IsString()
  @Length(10, 300)
  reason!: string;

  /** Makes a retry safe: the same key never adjusts twice. */
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,100}$/)
  idempotencyKey!: string;
}

export class MonetizationDto {
  @IsString()
  @Length(10, 300)
  reason!: string;
}

export class ContentQueryDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(['reel', 'post'])
  kind?: 'reel' | 'post';
}
