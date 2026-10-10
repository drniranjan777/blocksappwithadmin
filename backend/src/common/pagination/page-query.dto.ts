import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MAX_PAGE_SIZE } from './cursor.js';

/** `?cursor=...&limit=20` for every paginated endpoint. */
export class PageQueryDto {
  /** Opaque cursor from the previous page's `meta.nextCursor`. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  /** Rows to return (1 to 50). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;
}
