import { describe, expect, it } from 'vitest';
import { OTP_EMAIL_SUBJECT, renderOtpEmail } from './otp-email.js';

describe('the code e-mail', () => {
  it('says exactly what the product owner specified', () => {
    const mail = renderOtpEmail('482913', 15);
    expect(mail.subject).toBe('Your BLOCKS App Verification Code');
    expect(OTP_EMAIL_SUBJECT).toBe(mail.subject);
    expect(mail.text).toBe(
      [
        'Here is your BLOCKS app verification code:',
        '482913',
        'Please make sure you never share this code with anyone.',
        'Note: Code will expire in 15 Minutes.',
      ].join('\n'),
    );
  });

  it('carries the same words in the HTML version', () => {
    const { html } = renderOtpEmail('482913', 15);
    expect(html).toContain('Here is your BLOCKS app verification code:');
    expect(html).toContain('>482913<');
    expect(html).toContain('Please make sure you never share this code with anyone.');
    expect(html).toContain('Note: Code will expire in 15 Minutes.');
  });

  it('is a responsive page that loads nothing from outside', () => {
    const { html } = renderOtpEmail('482913', 15);
    expect(html).toMatch(/<meta name="viewport"/);
    expect(html).toMatch(/max-width:480px/);
    expect(html).not.toMatch(/<img|<script|<link|<a |https?:\/\//i);
  });

  it('states the real lifetime of the code, in the same words', () => {
    expect(renderOtpEmail('111111', 10).text).toContain('Note: Code will expire in 10 Minutes.');
    expect(renderOtpEmail('111111', 1).text).toContain('Note: Code will expire in 1 Minute.');
  });

  it('cannot be made to carry markup through the code', () => {
    const { html } = renderOtpEmail('<b>"1"</b>', 15);
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;&quot;1&quot;&lt;/b&gt;');
  });
});
