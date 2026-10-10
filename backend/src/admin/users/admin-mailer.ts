import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { EmailProvider } from '../../providers/providers.js';

/**
 * The few e-mails the staff console sends. They go straight to the e-mail
 * provider (staff have no row in the app-user tables that the notification
 * service works from). A temporary password appears in the message and nowhere
 * else: not in the API response, not in the logs, not in the audit trail.
 */
@Injectable()
export class AdminMailer {
  private readonly logger = new Logger('AdminMailer');

  constructor(
    private readonly email: EmailProvider,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Returns whether the provider accepted the message. Never throws. */
  async sendInvite(input: {
    to: string;
    name: string;
    temporaryPassword: string;
    expiresAt: Date;
    invitedBy: string;
  }): Promise<boolean> {
    try {
      await this.email.send({
        to: input.to,
        subject: 'You have been invited to the BLOCKS admin console',
        template: 'admin_invite',
        text: [
          `Hello ${input.name},`,
          '',
          `${input.invitedBy} has set up a BLOCKS admin account for you.`,
          '',
          `Sign in at ${this.env.ADMIN_CONSOLE_URL}`,
          `E-mail: ${input.to}`,
          `Temporary password: ${input.temporaryPassword}`,
          '',
          `The temporary password works until ${input.expiresAt.toUTCString()}. You will be asked to choose a new password and set up an authenticator app before you can continue.`,
          '',
          'If you were not expecting this, do not sign in; tell your administrator.',
        ].join('\n'),
      });
      return true;
    } catch (error) {
      this.logger.warn(`Could not send an invitation: ${(error as Error).message}`);
      return false;
    }
  }

  async sendSecurityNotice(input: {
    to: string;
    name: string;
    subject: string;
    text: string;
  }): Promise<void> {
    try {
      await this.email.send({
        to: input.to,
        subject: input.subject,
        template: 'admin_security_notice',
        text: `Hello ${input.name},\n\n${input.text}\n\nIf this was not you, tell your administrator at once.`,
      });
    } catch (error) {
      this.logger.warn(`Could not send a security notice: ${(error as Error).message}`);
    }
  }
}
