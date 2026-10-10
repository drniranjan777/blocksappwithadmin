import { IsString, Length } from 'class-validator';

export class UpdateTaxDto {
  /** Your PAN. It must be the one on your verified identity. */
  @IsString()
  @Length(10, 14)
  pan!: string;
}
