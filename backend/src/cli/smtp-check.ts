// Checks the SMTP settings the API would use, without starting the API.
//
//     node --env-file=.env dist/cli/smtp-check.js                 connect and log in only
//     node --env-file=.env dist/cli/smtp-check.js --to me@x.com   ...and send one real code e-mail
//
// (or `npm run smtp:check -- --to me@x.com` after `npm run build`). It reads the same
// environment variables as the API (EMAIL_PROVIDER=smtp and the SMTP_* settings) and prints
// what happened. The password is never printed. With --to, the message is the real code e-mail
// with a random code that is stored nowhere, so it opens nothing; the server *accepting* it is
// reported, but whether it reached the inbox is for you to confirm in the mailbox.
import { maskEmail } from '../common/crypto/mask.js';
import { randomDigits } from '../common/crypto/tokens.js';
import { ConfigError, loadEnv } from '../config/env.js';
import { renderOtpEmail } from '../notifications/otp-email.js';
import { EmailDeliveryError, SmtpEmailProvider } from '../providers/smtp-email.provider.js';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  let env;
  try {
    env = loadEnv().env;
  } catch (e) {
    console.error(
      e instanceof ConfigError ? e.message : `Could not read the configuration: ${String(e)}`,
    );
    return 1;
  }
  if (env.EMAIL_PROVIDER !== 'smtp') {
    console.error(
      `EMAIL_PROVIDER is "${env.EMAIL_PROVIDER}". Set EMAIL_PROVIDER=smtp (and the SMTP_* settings) to check SMTP.`,
    );
    return 1;
  }

  const provider = new SmtpEmailProvider({
    host: env.SMTP_HOST ?? '',
    port: env.SMTP_PORT,
    secure: env.smtpSecure,
    user: env.SMTP_USER ?? '',
    pass: env.SMTP_PASS ?? '',
    fromEmail: env.SMTP_FROM_EMAIL ?? '',
    fromName: env.SMTP_FROM_NAME,
  });

  console.log(
    `Checking ${env.SMTP_HOST}:${env.SMTP_PORT} (${env.smtpSecure ? 'TLS from the start' : 'STARTTLS'}) ` +
      `as ${maskEmail(env.SMTP_USER ?? '')}, sending as "${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>`,
  );

  try {
    await provider.verify();
    console.log('OK  connected and logged in.');

    const to = arg('--to');
    if (to) {
      const mail = renderOtpEmail(randomDigits(6), env.OTP_TTL_MINUTES);
      const sent = await provider.send({
        to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        template: 'smtp_check',
      });
      console.log(
        `OK  the mail server accepted the message for ${maskEmail(to)} (id ${sent.providerMessageId}).\n` +
          '    That means it was handed over, not that it arrived: look in the mailbox (and its spam folder).\n' +
          '    The code in it is random and was not saved; it will not work in the app.',
      );
    }
    return 0;
  } catch (e) {
    const failure = e instanceof EmailDeliveryError ? e : undefined;
    console.error(
      `FAILED  ${failure ? `${failure.kind}: ${failure.message}` : 'unexpected error'}` +
        (failure?.responseCode ? ` [SMTP ${failure.responseCode}]` : ''),
    );
    return 1;
  } finally {
    provider.onModuleDestroy();
  }
}

process.exitCode = await main();
