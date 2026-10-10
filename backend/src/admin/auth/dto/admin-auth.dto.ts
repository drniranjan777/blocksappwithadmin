import { IsEnum, IsString, Length, Matches } from 'class-validator';

export class AdminLoginDto {
  @IsString()
  @Length(3, 254)
  email!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}

export class AdminVerifyDto {
  @IsEnum(['totp', 'backup_code'])
  method!: 'totp' | 'backup_code';

  /** A 6-digit authenticator code, or a backup code like `ABCD-EFGH-JK`. */
  @IsString()
  @Length(6, 20)
  code!: string;
}

export class AdminRefreshDto {
  @IsString()
  @Length(40, 120)
  refreshToken!: string;
}

export class AdminChangePasswordDto {
  @IsString()
  @Length(1, 128)
  currentPassword!: string;

  @IsString()
  @Length(1, 128)
  newPassword!: string;
}

export class AdminConfirmTwoFactorDto {
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}
