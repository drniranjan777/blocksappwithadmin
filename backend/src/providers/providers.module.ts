import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DevOutbox } from './outbox.service.js';
import { SmtpEmailProvider } from './smtp-email.provider.js';
import {
  DevEmailProvider,
  DevPushProvider,
  DevSmsProvider,
  EmailProvider,
  NoSmsProvider,
  PushProvider,
  SmsProvider,
} from './providers.js';

/**
 * A provider named in configuration that has no adapter in this build is a
 * start-up error. It must never fall back to the development outbox, which would
 * make real users' codes and alerts disappear without a trace.
 */
function noAdapter(setting: string, value: string): never {
  throw new Error(
    `${setting}=${value} has no adapter in this build. Add one under src/providers, or use "dev" outside production.`,
  );
}

/**
 * Binds each provider interface to an implementation. E-mail has a development outbox and
 * SMTP; SMS and push have only the development outbox today. A real vendor is one more class
 * and one more case here, with no change to the code that sends.
 */
@Global()
@Module({
  providers: [
    DevOutbox,
    {
      provide: EmailProvider,
      inject: [ENV, DevOutbox],
      useFactory: (env: Env, outbox: DevOutbox): EmailProvider => {
        if (env.EMAIL_PROVIDER === 'dev') return new DevEmailProvider(outbox);
        if (env.EMAIL_PROVIDER === 'smtp') {
          // `loadEnv` has already refused a configuration that lacks these.
          return new SmtpEmailProvider(
            {
              host: env.SMTP_HOST ?? '',
              port: env.SMTP_PORT,
              secure: env.smtpSecure,
              user: env.SMTP_USER ?? '',
              pass: env.SMTP_PASS ?? '',
              fromEmail: env.SMTP_FROM_EMAIL ?? '',
              fromName: env.SMTP_FROM_NAME,
            },
            { verifyOnStart: !env.isTest },
          );
        }
        return noAdapter('EMAIL_PROVIDER', env.EMAIL_PROVIDER);
      },
    },
    {
      provide: SmsProvider,
      inject: [ENV, DevOutbox],
      useFactory: (env: Env, outbox: DevOutbox): SmsProvider => {
        if (env.SMS_PROVIDER === 'dev') return new DevSmsProvider(outbox);
        if (env.SMS_PROVIDER === 'none') return new NoSmsProvider();
        return noAdapter('SMS_PROVIDER', env.SMS_PROVIDER);
      },
    },
    {
      provide: PushProvider,
      inject: [ENV, DevOutbox],
      useFactory: (env: Env, outbox: DevOutbox): PushProvider =>
        env.PUSH_PROVIDER === 'dev'
          ? new DevPushProvider(outbox)
          : noAdapter('PUSH_PROVIDER', env.PUSH_PROVIDER),
    },
  ],
  exports: [DevOutbox, EmailProvider, SmsProvider, PushProvider],
})
export class ProvidersModule {}
