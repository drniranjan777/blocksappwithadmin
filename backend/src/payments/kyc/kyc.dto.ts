import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '../../common/pagination/page-query.dto.js';

/**
 * Which documents count for which purpose. Not every document is accepted for every
 * workflow: an individual proves who they are with a personal document; a business proves what
 * it is with a registration document, and names an authorised person with a personal one.
 * Aadhaar is deliberately absent: BLOCKS does not collect, store or authenticate it.
 */
export const INDIVIDUAL_DOCS = ['PAN', 'PASSPORT', 'VOTER_ID', 'DRIVING_LICENCE'] as const;
export const BUSINESS_DOCS = ['GST_CERTIFICATE', 'UDYAM', 'BUSINESS_PAN', 'INCORPORATION'] as const;
export const ALL_DOCS = [...INDIVIDUAL_DOCS, ...BUSINESS_DOCS] as const;
export const BUSINESS_TYPES = [
  'SOLE_PROPRIETORSHIP',
  'PARTNERSHIP',
  'LLP',
  'PRIVATE_LIMITED',
  'PUBLIC_LIMITED',
  'TRUST',
  'OTHER',
] as const;
export const REJECTION_REASONS = [
  'ILLEGIBLE',
  'DETAILS_MISMATCH',
  'DOCUMENT_EXPIRED',
  'NOT_ACCEPTED',
  'SUSPECTED_FRAUD',
] as const;

export class KycDocumentDto {
  @IsIn(ALL_DOCS)
  type!: (typeof ALL_DOCS)[number];

  /** `PRIMARY` proves the person or business; `SIGNATORY` is the authorised person of a business. */
  @IsOptional()
  @IsIn(['PRIMARY', 'SIGNATORY'])
  role?: 'PRIMARY' | 'SIGNATORY';

  /** The document's number, if it has one. Encrypted, never shown in full again. */
  @IsOptional()
  @IsString()
  @Length(4, 40)
  number?: string;

  /** A scan uploaded with `POST /kyc/documents/upload` and completed. */
  @IsUUID()
  fileId!: string;
}

export class SubmitKycDto {
  @IsIn(['INDIVIDUAL', 'BUSINESS'])
  subject!: 'INDIVIDUAL' | 'BUSINESS';

  /** The name as it appears on the PAN card (a person's, or the business entity's). */
  @IsString()
  @Length(2, 120)
  legalName!: string;

  /** Individuals only, `YYYY-MM-DD`. You must be 18 or over. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateOfBirth?: string;

  @IsString()
  @Length(10, 14)
  pan!: string;

  /** Businesses only. */
  @IsOptional()
  @IsString()
  @Length(2, 160)
  businessName?: string;

  @IsOptional()
  @IsIn(BUSINESS_TYPES)
  businessType?: (typeof BUSINESS_TYPES)[number];

  @IsOptional()
  @IsString()
  @Length(15, 20)
  gstin?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => KycDocumentDto)
  documents!: KycDocumentDto[];
}

export class UploadDocumentDto {
  @IsString()
  @Length(3, 100)
  contentType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sizeBytes!: number;
}

export class KycQueueQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'UNDER_REVIEW', 'ACTION_REQUIRED', 'VERIFIED', 'REJECTED', 'EXPIRED'])
  status?: 'PENDING' | 'UNDER_REVIEW' | 'ACTION_REQUIRED' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
}

export class KycDecisionDto {
  @IsIn(['APPROVE', 'REJECT', 'REQUEST_INFO'])
  decision!: 'APPROVE' | 'REJECT' | 'REQUEST_INFO';

  /** Required to reject; the person sees only this code, mapped to words. */
  @IsOptional()
  @IsIn(REJECTION_REASONS)
  reasonCode?: (typeof REJECTION_REASONS)[number];

  @IsString()
  @Length(10, 1000)
  note!: string;
}
