import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Identifies the phone or browser signing in, so it can be listed and revoked. */
export class DeviceDto {
  /** A stable random id the app generates once per install (8-100 characters). */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9._:-]{8,100}$/)
  deviceId?: string;

  /** What to call it in the device list, e.g. "Pixel 8". */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;

  @IsOptional()
  @IsEnum(['ANDROID', 'IOS', 'WEB', 'UNKNOWN'])
  platform?: 'ANDROID' | 'IOS' | 'WEB' | 'UNKNOWN';

  @IsOptional()
  @IsString()
  @MaxLength(32)
  appVersion?: string;
}

export class RegisterDto {
  /** 3-30 characters: letters, digits, dot, underscore. Stored in lower case. */
  @IsString()
  @MaxLength(31)
  username!: string;

  @IsString()
  @Length(1, 80)
  displayName!: string;

  @IsString()
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(254)
  email?: string;

  /** Indian mobile numbers may be typed any usual way; stored as E.164. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  /** `YYYY-MM-DD`. Used for the minimum-age rule; never shown to others. */
  @IsISO8601({ strict: true, strictSeparator: true }, { message: 'dateOfBirth must be YYYY-MM-DD' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateOfBirth!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  district?: string;

  @IsOptional()
  @IsIn(['en', 'hi', 'te'])
  language?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceDto)
  device?: DeviceDto;
}

export class VerifyContactDto {
  @IsUUID()
  challengeId!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceDto)
  device?: DeviceDto;
}

export class ChallengeRefDto {
  @IsUUID()
  challengeId!: string;
}

export class LoginDto {
  /** Username, e-mail address or phone number. */
  @IsString()
  @Length(1, 254)
  identifier!: string;

  @IsString()
  @Length(1, 128)
  password!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceDto)
  device?: DeviceDto;
}

export class LoginVerifyDto {
  @IsUUID()
  challengeId!: string;

  /** A 6-digit code, or a backup code like `ABCD-EFGH-JK`. */
  @IsString()
  @Length(6, 20)
  code!: string;

  @IsEnum(['otp', 'totp', 'backup_code'])
  method!: 'otp' | 'totp' | 'backup_code';

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceDto)
  device?: DeviceDto;
}

export class RefreshDto {
  @IsString()
  @Length(40, 120)
  refreshToken!: string;
}

export class ForgotPasswordDto {
  @IsString()
  @Length(1, 254)
  identifier!: string;
}

export class VerifyResetDto {
  @IsUUID()
  challengeId!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

export class ResetPasswordDto {
  @IsString()
  @Length(40, 120)
  resetToken!: string;

  @IsString()
  @MaxLength(128)
  newPassword!: string;
}

export class ChangePasswordDto {
  @IsString()
  @Length(1, 128)
  currentPassword!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  newPassword!: string;

  /** Sign every other device out (default true). */
  @IsOptional()
  @IsBoolean()
  signOutOtherDevices?: boolean;
}
