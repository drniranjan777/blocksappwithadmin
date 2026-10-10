import { QueryFlag } from '../../common/http/query-flag.js';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { PageQueryDto } from '../../common/pagination/page-query.dto.js';

export class SecurityEventsQueryDto extends PageQueryDto {
  /** Login Activity tabs. */
  @IsOptional()
  @IsIn(['all', 'successful', 'failed', 'suspicious'])
  kind?: 'all' | 'successful' | 'failed' | 'suspicious';

  /** Only events at or above this level. */
  @IsOptional()
  @IsEnum(['INFO', 'WARNING', 'CRITICAL'])
  minSeverity?: 'INFO' | 'WARNING' | 'CRITICAL';

  /** Only events not yet acknowledged. */
  @QueryFlag()
  unacknowledged?: boolean;
}

export class AlertPreferencesDto {
  @IsOptional()
  @IsBoolean()
  securityAlertEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  securityAlertPush?: boolean;

  @IsOptional()
  @IsBoolean()
  loginAlerts?: boolean;
}

export class SecureAccountDto {
  /** Also sign this device out. Default: keep it, so the person can finish the job. */
  @IsOptional()
  @IsBoolean()
  includeThisDevice?: boolean;
}

export class TwoFactorSetupDto {
  @IsEnum(['totp', 'sms', 'email'])
  method!: 'totp' | 'sms' | 'email';

  /**
   * The current password. Without it, anyone holding a stolen access token could
   * enrol their own authenticator and lock the real owner out.
   */
  @IsString()
  @Length(1, 128)
  password!: string;
}

export class TwoFactorConfirmDto {
  /** Required for SMS / e-mail setup (the challenge sent by `setup`). */
  @IsOptional()
  @IsUUID()
  challengeId?: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

export class PasswordConfirmDto {
  @IsString()
  @Length(1, 128)
  password!: string;
}

export class ContactVerifyDto {
  @IsEnum(['email', 'phone'])
  kind!: 'email' | 'phone';
}

export class ContactChangeDto {
  @IsEnum(['email', 'phone'])
  kind!: 'email' | 'phone';

  @IsString()
  @MaxLength(254)
  newValue!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}

export class ChallengeCodeDto {
  @IsUUID()
  challengeId!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}
