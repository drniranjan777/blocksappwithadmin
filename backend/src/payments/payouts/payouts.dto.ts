import { IsIn, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { PageQueryDto } from '../../common/pagination/page-query.dto.js';

export class RequestPayoutDto {
  /** Rupees to withdraw, e.g. "1500.00". */
  @IsString()
  @Matches(/^\d{1,16}(\.\d{1,2})?$/)
  amount!: string;

  /** Defaults to your primary verified account. */
  @IsOptional()
  @IsUUID()
  accountId?: string;
}

export class PayoutQueueQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn([
    'REQUESTED',
    'PENDING_REVIEW',
    'APPROVED',
    'PROCESSING',
    'COMPLETED',
    'FAILED',
    'REVERSED',
    'ON_HOLD',
    'REJECTED',
    'CANCELLED',
  ])
  status?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class PayoutNoteDto {
  @IsString()
  @Length(10, 500)
  note!: string;
}
