/**
 * Message templates. Plain text, short, and written to be useful if read on a
 * lock screen. Security messages never contain a link that logs the user in or
 * resets anything: they tell the person to open the app, so a phished lookalike
 * of one of these messages has nothing to imitate.
 *
 * English only for now. The user's language is stored (`user_settings.language`)
 * and the template keys are stable, so localised versions slot in here.
 */

export type CodeTemplate =
  | 'otp_verify_contact'
  | 'otp_password_reset'
  | 'otp_login'
  | 'otp_contact_change'
  | 'otp_two_factor_setup'
  | 'otp_account_deletion'
  | 'otp_step_up';

export type NoticeTemplate =
  | 'security_new_device'
  | 'security_suspicious_login'
  | 'security_account_locked'
  | 'security_password_changed'
  | 'security_two_factor_enabled'
  | 'security_two_factor_disabled'
  | 'security_sessions_revoked'
  | 'security_token_reuse'
  | 'security_account_exists'
  | 'security_contact_changed'
  | 'security_payout_account_changed'
  | 'security_deletion_scheduled'
  | 'security_deletion_cancelled'
  | 'security_secure_account'
  | 'social_new_follower'
  | 'social_follow_request'
  | 'social_follow_accepted'
  | 'social_like'
  | 'social_comment'
  | 'social_reply'
  | 'social_mention'
  | 'social_content_removed'
  | 'moderation_content_restricted'
  | 'moderation_content_restored'
  | 'moderation_warning'
  | 'moderation_account_action'
  | 'moderation_report_outcome'
  | 'moderation_appeal_received'
  | 'moderation_appeal_decided'
  | 'verification_decision'
  | 'business_page_suspended'
  | 'business_page_restored'
  | 'ad_campaign_decision'
  | 'social_reel_failed'
  | 'reach_level_up'
  | 'kyc_status'
  | 'payout_status';

export type TemplateKey = CodeTemplate | NoticeTemplate;

export interface Rendered {
  subject: string;
  text: string;
}

type Vars = Record<string, string | number>;

const HELP =
  "If this wasn't you, open BLOCKS, go to Settings > Security and choose Secure my account.";

const CODE_SUBJECTS: Record<CodeTemplate, string> = {
  otp_verify_contact: 'Your BLOCKS verification code',
  otp_password_reset: 'Your BLOCKS password reset code',
  otp_login: 'Your BLOCKS sign-in code',
  otp_contact_change: 'Confirm your new BLOCKS contact details',
  otp_two_factor_setup: 'Your BLOCKS two-step verification code',
  otp_account_deletion: 'Confirm deleting your BLOCKS account',
  otp_step_up: 'Confirm it is you on BLOCKS',
};

const CODE_PURPOSE: Record<CodeTemplate, string> = {
  otp_verify_contact: 'verify your contact details',
  otp_password_reset: 'reset your password',
  otp_login: 'sign in',
  otp_contact_change: 'confirm your new contact details',
  otp_two_factor_setup: 'turn on two-step verification',
  otp_account_deletion: 'confirm deleting your account',
  otp_step_up: 'confirm this change',
};

export function isCodeTemplate(key: TemplateKey): key is CodeTemplate {
  return key in CODE_SUBJECTS;
}

export function renderCode(template: CodeTemplate, code: string, minutes: number): Rendered {
  return {
    subject: CODE_SUBJECTS[template],
    text:
      `Your BLOCKS code is ${code}. Use it to ${CODE_PURPOSE[template]}. ` +
      `It expires in ${minutes} minutes. Never share this code: BLOCKS will never ask for it.`,
  };
}

/** SMS needs to be shorter than a mail body. */
export function renderCodeSms(template: CodeTemplate, code: string, minutes: number): string {
  return `${code} is your BLOCKS code to ${CODE_PURPOSE[template]}. Expires in ${minutes} min. Do not share it.`;
}

export function renderNotice(template: NoticeTemplate, v: Vars = {}): Rendered {
  switch (template) {
    case 'security_new_device':
      return {
        subject: 'New sign-in to your BLOCKS account',
        text: `Your account was signed in on ${v['device'] ?? 'a new device'}${v['location'] ? ` near ${v['location']}` : ''} at ${v['time'] ?? 'just now'}. ${HELP}`,
      };
    case 'security_suspicious_login':
      return {
        subject: 'We blocked a suspicious sign-in',
        text: `We noticed an unusual sign-in to your account (${v['device'] ?? 'unknown device'}${v['location'] ? `, near ${v['location']}` : ''}, ${v['time'] ?? 'just now'}) and asked for extra verification. ${HELP}`,
      };
    case 'security_account_locked':
      return {
        subject: 'Your BLOCKS account is temporarily protected',
        text: `After several wrong password attempts, sign-in is paused for ${v['minutes'] ?? 15} minutes to keep your account safe. You can reset your password at any time. ${HELP}`,
      };
    case 'security_password_changed':
      return {
        subject: 'Your BLOCKS password was changed',
        text: `Your password was changed at ${v['time'] ?? 'just now'}. ${HELP}`,
      };
    case 'security_two_factor_enabled':
      return {
        subject: 'Two-step verification is on',
        text: `Two-step verification was turned on for your account at ${v['time'] ?? 'just now'}. ${HELP}`,
      };
    case 'security_two_factor_disabled':
      return {
        subject: 'Two-step verification was turned off',
        text: `Two-step verification was turned off at ${v['time'] ?? 'just now'}. ${HELP}`,
      };
    case 'security_sessions_revoked':
      return {
        subject: 'You were signed out of your devices',
        text: `Your BLOCKS account was signed out of ${v['count'] ?? 'your'} device(s) at ${v['time'] ?? 'just now'}. ${HELP}`,
      };
    case 'security_token_reuse':
      return {
        subject: 'A sign-in was ended for your safety',
        text: `We saw a sign-in token being used twice, which can mean it was copied. We ended that session. ${HELP}`,
      };
    case 'security_account_exists':
      return {
        subject: 'Someone tried to create a BLOCKS account with your details',
        text: 'Someone tried to register a BLOCKS account using your e-mail or phone number. You already have an account, so nothing changed. If it was you, just sign in.',
      };
    case 'security_contact_changed':
      return {
        subject: `Your BLOCKS ${v['kind'] ?? 'contact'} was changed`,
        text: `The ${v['kind'] ?? 'contact detail'} on your account was changed at ${v['time'] ?? 'just now'}. ${HELP}`,
      };
    case 'security_payout_account_changed':
      return {
        subject: 'A bank account on your BLOCKS account was changed',
        text: `A payout bank account was ${v['action'] ?? 'changed'} on your account. Payouts are paused for a short while as a precaution. ${HELP}`,
      };
    case 'security_deletion_scheduled':
      return {
        subject: 'Your BLOCKS account is scheduled for deletion',
        text: `Your account will be deleted on ${v['date'] ?? 'the scheduled date'}. To keep your account, sign in before then and choose "Keep my account". After that it cannot be recovered.`,
      };
    case 'security_deletion_cancelled':
      return {
        subject: 'Account deletion cancelled',
        text: 'Your BLOCKS account will not be deleted. Everything is as it was.',
      };
    case 'security_secure_account':
      return {
        subject: 'You secured your BLOCKS account',
        text: `All devices were signed out at ${v['time'] ?? 'just now'}. Sign in again and choose a new password if you suspect someone else knew yours.`,
      };
    // Social notices name the person and the kind of thing, never the content.
    case 'social_new_follower':
      return { subject: 'New follower', text: `${v['actor'] ?? 'Someone'} started following you.` };
    case 'social_follow_request':
      return {
        subject: 'Follow request',
        text: `${v['actor'] ?? 'Someone'} asked to follow you.`,
      };
    case 'social_follow_accepted':
      return {
        subject: 'Follow request accepted',
        text: `${v['actor'] ?? 'Someone'} accepted your follow request.`,
      };
    case 'social_like':
      return {
        subject: 'New like',
        text: `${v['actor'] ?? 'Someone'} liked your ${v['target'] ?? 'post'}.`,
      };
    case 'social_comment':
      return {
        subject: 'New comment',
        text: `${v['actor'] ?? 'Someone'} commented on your ${v['target'] ?? 'post'}.`,
      };
    case 'social_reply':
      return {
        subject: 'New reply',
        text: `${v['actor'] ?? 'Someone'} replied to your comment.`,
      };
    case 'social_content_removed':
      return {
        subject: 'Something you shared was removed',
        text: `Your ${v['target'] ?? 'upload'} was removed because it did not meet the community guidelines. You can appeal from the notification.`,
      };
    case 'moderation_content_restricted':
      return {
        subject: 'Something you shared is hidden',
        text: `Your ${v['target'] ?? 'upload'} is hidden while it is reviewed against the community guidelines (${v['rule'] ?? 'guidelines'}). You can appeal from the notification.`,
      };
    case 'moderation_content_restored':
      return {
        subject: 'Your content is back',
        text: `Your ${v['target'] ?? 'upload'} was restored. Sorry for the trouble.`,
      };
    case 'moderation_warning':
      return {
        subject: `A warning about your ${v['target'] ?? 'content'}`,
        text: `We reviewed your ${v['target'] ?? 'upload'} and it breaks our rule on ${v['rule'] ?? 'the community guidelines'}. It stays up this time. Further breaches can lead to restrictions. You can appeal from the notification.`,
      };
    case 'moderation_account_action': {
      const what = String(v['action'] ?? 'changed');
      const text =
        what === 'reactivated'
          ? 'Your account was reactivated. You can post and comment again.'
          : what === 'suspended'
            ? `Your account was suspended because of ${v['rule'] ?? 'a breach of the community guidelines'}. You are signed out on every device. You can appeal by replying to this e-mail or through the help page.`
            : `Your account was restricted because of ${v['rule'] ?? 'a breach of the community guidelines'}. You can still sign in and read, but you cannot post or comment. You can appeal from the notification.`;
      return { subject: `Your BLOCKS account was ${what}`, text };
    }
    case 'moderation_report_outcome':
      return {
        subject: 'We looked at your report',
        text:
          v['outcome'] === 'action_taken'
            ? 'Thank you for reporting. We reviewed it and took action.'
            : 'Thank you for reporting. We reviewed it and found that it does not break our community guidelines. We will not show you more about it.',
      };
    case 'moderation_appeal_received':
      return {
        subject: 'We got your appeal',
        text: 'Your appeal was received. Someone who was not involved in the first decision will look at it, usually within a few days.',
      };
    case 'moderation_appeal_decided': {
      const outcome = String(v['outcome'] ?? '');
      return {
        subject: 'Your appeal was decided',
        text:
          outcome === 'OVERTURNED'
            ? 'We looked again and changed the decision: it has been reversed.'
            : outcome === 'UPHELD'
              ? 'We looked again and the original decision stands.'
              : 'We could not take this appeal forward.',
      };
    }
    case 'verification_decision': {
      const kind = String(v['kind'] ?? 'account');
      const outcome = String(v['outcome'] ?? '');
      if (outcome === 'approved')
        return {
          subject: 'Your verification was approved',
          text: `Your ${kind} verification was approved.`,
        };
      if (outcome === 'taken_back')
        return {
          subject: 'A verification badge was removed',
          text: `Your ${kind} verification badge was removed. Open BLOCKS to see why.`,
        };
      return {
        subject: 'Your verification request was not approved',
        text: `We could not approve your ${kind} verification. Open BLOCKS to see why.`,
      };
    }
    case 'business_page_suspended':
      return {
        subject: 'Your business page was suspended',
        text: `Your page "${v['name'] ?? 'page'}" was suspended and is hidden, along with what was posted as it and any campaigns for it. Open BLOCKS to see why.`,
      };
    case 'business_page_restored':
      return {
        subject: 'Your business page is back',
        text: `Your page "${v['name'] ?? 'page'}" is visible again. Any campaigns that were paused for it stay paused until you resume them.`,
      };
    case 'ad_campaign_decision': {
      const name = String(v['name'] ?? 'campaign');
      switch (String(v['outcome'] ?? '')) {
        case 'approved':
          return {
            subject: 'Your campaign was approved',
            text: `Your campaign "${name}" was approved. It runs once it is paid for and its start time arrives.`,
          };
        case 'rejected':
          return {
            subject: 'Your campaign was not approved',
            text: `Your campaign "${name}" was not approved. Open BLOCKS to see why, fix it, and send it again.`,
          };
        case 'flagged':
          return {
            subject: 'Your campaign was stopped',
            text: `Your campaign "${name}" was stopped because it may break the advertising rules. Open BLOCKS to see why.`,
          };
        default:
          return {
            subject: 'Your campaign was paused',
            text: `Your campaign "${name}" was paused. Open BLOCKS to see why.`,
          };
      }
    }
    case 'social_mention':
      return {
        subject: 'You were mentioned',
        text: `${v['actor'] ?? 'Someone'} mentioned you in a ${v['target'] ?? 'post'}.`,
      };
    case 'kyc_status':
      return {
        subject: 'Your identity verification was updated',
        text: `Your identity verification is now ${String(v['status'] ?? 'updated')
          .toLowerCase()
          .replace(/_/g, ' ')}. Open BLOCKS to see what to do next.`,
      };
    case 'payout_status':
      return {
        subject: 'Your payout was updated',
        text: `Your payout of ${v['amount'] ?? ''} rupees is now ${String(v['status'] ?? 'updated')
          .toLowerCase()
          .replace(/_/g, ' ')}.`,
      };
    case 'reach_level_up':
      return {
        subject: 'Your reach is growing',
        text: `Your ${v['target'] ?? 'post'} reached the ${String(v['level'] ?? 'next').toLowerCase()} level of the Reach Ladder.`,
      };
    case 'social_reel_failed':
      return {
        subject: 'Your reel could not be made',
        text: `Your reel was not published: ${v['reason'] ?? 'something went wrong while putting it together'}. Nothing was shared. You can try again.`,
      };
  }
}
