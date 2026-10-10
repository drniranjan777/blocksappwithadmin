/**
 * The e-mail that carries a one-time code.
 *
 * Every code e-mail (sign-up, sign-in, password reset, contact change ...) uses this one message,
 * word for word as the product owner specified it:
 *
 *     Subject: Your BLOCKS App Verification Code
 *
 *     Here is your BLOCKS app verification code:
 *     {{OTP}}
 *     Please make sure you never share this code with anyone.
 *     Note: Code will expire in 15 Minutes.
 *
 * The number of minutes is the real lifetime of the code (`OTP_TTL_MINUTES`, 15 by default), so
 * the sentence can never promise more time than the server gives. Do not reword the lines above
 * without the owner's say-so; `otp-email.spec.ts` pins them.
 *
 * It is plain HTML with inline styles (mail clients ignore everything else), no images and no
 * links, so there is nothing to track, block or imitate.
 */

export const OTP_EMAIL_SUBJECT = 'Your BLOCKS App Verification Code';

export interface OtpEmail {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderOtpEmail(code: string, minutes: number): OtpEmail {
  const intro = 'Here is your BLOCKS app verification code:';
  const warning = 'Please make sure you never share this code with anyone.';
  const note = `Note: Code will expire in ${minutes} ${minutes === 1 ? 'Minute' : 'Minutes'}.`;

  const text = [intro, code, warning, note].join('\n');

  const safeCode = escapeHtml(code);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<title>${escapeHtml(OTP_EMAIL_SUBJECT)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F4F5FB;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F5FB;">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background-color:#FFFFFF;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background-color:#0B0D1E;padding:20px 24px;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;letter-spacing:3px;color:#FFFFFF;">BLOCKS</td>
        </tr>
        <tr>
          <td style="padding:28px 24px 8px 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#11142B;">${escapeHtml(intro)}</td>
        </tr>
        <tr>
          <td align="center" style="padding:8px 24px 20px 24px;">
            <div style="display:inline-block;padding:14px 22px;background-color:#E6E7FF;border-radius:10px;font-family:'Courier New',Courier,monospace;font-size:34px;line-height:40px;font-weight:700;letter-spacing:8px;color:#3A3DD8;">${safeCode}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 8px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#11142B;">${escapeHtml(warning)}</td>
        </tr>
        <tr>
          <td style="padding:0 24px 28px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#5A5F7D;">${escapeHtml(note)}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
`;

  return { subject: OTP_EMAIL_SUBJECT, text, html };
}
