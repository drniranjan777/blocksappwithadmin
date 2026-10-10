import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../support/app.js';
import {
  AUTH_TEST_ENV,
  PASSWORD,
  call,
  codeSentTo,
  deviceBody,
  freshName,
} from '../support/auth.js';

/** A deployment that sends no SMS (`SMS_PROVIDER=none`) runs on e-mail alone. */
describe('a deployment without SMS', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ ...AUTH_TEST_ENV, SMS_PROVIDER: 'none' });
  });
  afterAll(async () => {
    await t.close();
  });

  const body = (over: Record<string, unknown>) => {
    const username = freshName();
    return {
      username,
      displayName: 'Asha Rao',
      password: PASSWORD,
      dateOfBirth: '1999-06-01',
      device: deviceBody(`dev-${username}`),
      ...over,
    };
  };

  it('refuses a sign-up that can only be proven by text message, and says why', async () => {
    const res = await call(t, 'post', '/auth/register', {
      body: body({ phone: '+919876543210' }),
    }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details).toContainEqual({
      field: 'email',
      reasons: ['email_required'],
    });
  });

  it('signs people up with an e-mail address as usual', async () => {
    const email = `${freshName()}@example.test`;
    const b = body({ email });
    const reg = await call(t, 'post', '/auth/register', { body: b }).expect(202);
    expect(reg.body.data.verification.channel).toBe('EMAIL');
    const ok = await call(t, 'post', '/auth/verify-contact', {
      body: {
        challengeId: reg.body.data.verification.challengeId,
        code: codeSentTo(t, email),
        device: b.device,
      },
    }).expect(200);
    expect(ok.body.data.status).toBe('authenticated');
  });
});
