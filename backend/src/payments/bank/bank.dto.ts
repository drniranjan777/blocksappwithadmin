import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { PageQueryDto } from '../../common/pagination/page-query.dto.js';

export class AddBankAccountDto {
  /** 9 to 18 digits. Encrypted at once; only the last four are ever shown again. */
  @IsString()
  @Length(9, 24)
  accountNumber!: string;

  @IsString()
  @Length(11, 14)
  ifsc!: string;

  /** The account holder's name as the bank has it. The bank's own answer is what is compared with your verified identity. */
  @IsString()
  @Length(2, 120)
  holderName!: string;

  @IsOptional()
  @IsIn(['SAVINGS', 'CURRENT'])
  accountType?: 'SAVINGS' | 'CURRENT';
}

export class BankQueueQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(['PENDING_VERIFICATION', 'VERIFIED', 'FAILED', 'DISABLED'])
  status?: 'PENDING_VERIFICATION' | 'VERIFIED' | 'FAILED' | 'DISABLED';
}

export class BankReviewDto {
  @IsIn(['APPROVE', 'REJECT'])
  decision!: 'APPROVE' | 'REJECT';

  @IsString()
  @Length(10, 500)
  note!: string;
}
