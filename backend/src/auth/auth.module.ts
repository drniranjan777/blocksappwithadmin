import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccountController } from '../account/account.controller.js';
import { AccountService } from '../account/account.service.js';
import { GeoLocator, HeaderGeoLocator } from '../common/http/geo-locator.js';
import { SecurityController } from '../security/security.controller.js';
import { SecurityEventService } from '../security/security-events.service.js';
import { SecurityService } from '../security/security.service.js';
import { SessionsController } from '../sessions/sessions.controller.js';
import { MeController } from '../users/me.controller.js';
import { SettingsController } from '../users/settings.controller.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { UserAuthGuard } from './guards/user-auth.guard.js';
import { LoginAttemptStore } from './login-attempts.js';
import { OtpService } from './otp.service.js';
import { PasswordService } from './password.service.js';
import { ReauthService } from './reauth.service.js';
import { StepUpController } from './step-up.controller.js';
import { StepUpService } from './step-up.service.js';
import { TokenService } from './token.service.js';
import { TwoFactorService } from './two-factor.service.js';
import { UserSessionService } from './user-session.service.js';

/**
 * Identity and account security for app users: registration, sign-in, sessions,
 * one-time codes, two-factor, security events, contact details, deletion.
 * (Staff have their own, separate, module: see `AdminAuthModule`.)
 */
@Module({
  controllers: [
    AuthController,
    MeController,
    SettingsController,
    SessionsController,
    SecurityController,
    AccountController,
    StepUpController,
  ],
  providers: [
    AuthService,
    PasswordService,
    ReauthService,
    StepUpService,
    TokenService,
    UserSessionService,
    OtpService,
    TwoFactorService,
    LoginAttemptStore,
    SecurityEventService,
    SecurityService,
    AccountService,
    { provide: GeoLocator, useClass: HeaderGeoLocator },
    // Every route needs a signed-in user unless it says @Public().
    { provide: APP_GUARD, useClass: UserAuthGuard },
  ],
  exports: [
    StepUpService,
    ReauthService,
    TokenService,
    UserSessionService,
    OtpService,
    TwoFactorService,
    SecurityEventService,
    AccountService,
    LoginAttemptStore,
    ReauthService,
  ],
})
export class AuthModule {}
