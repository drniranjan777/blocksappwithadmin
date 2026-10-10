import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapSuperAdmin } from '../../src/admin/bootstrap/bootstrap-admin.js';
import { createStandaloneClient } from '../../src/database/standalone.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { ADMIN_NEW_PASSWORD, adminCall } from '../support/admin.js';
import { AUTH_TEST_ENV, totpNow } from '../support/auth.js';

describe('creating the first super admin from the command line', () => {
  let t: TestApp;
  let prisma: ReturnType<typeof createStandaloneClient>;

  beforeAll(async () => {
    t = await createTestApp({ ...AUTH_TEST_ENV });
    prisma = createStandaloneClient(t.db.url);
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await t.close();
  });

  it('gives a one-time password that works for a first sign-in and nothing else', async () => {
    const made = await bootstrapSuperAdmin(prisma, {
      email: 'Founder@Blocks.Test',
      name: 'First Founder',
    });
    expect(made.email).toBe('founder@blocks.test');
    expect(made.temporaryPassword.length).toBeGreaterThanOrEqual(16);
    expect(made.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // Stored hashed, never in clear; the audit record names no password.
    const row = await t.db.query<{
      password_hash: string;
      status: string;
      must_change_password: boolean;
    }>('SELECT password_hash, status, must_change_password FROM admin_users WHERE id = $1', [
      made.id,
    ]);
    expect(row.rows[0]?.password_hash).toMatch(/^\$argon2id\$/);
    expect(row.rows[0]).toMatchObject({ status: 'INVITED', must_change_password: true });
    const audit = await t.db.query<{ actor_type: string; after: object }>(
      "SELECT actor_type, after FROM audit_logs WHERE action = 'admin.bootstrap' AND target_id = $1",
      [made.id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]?.actor_type).toBe('SYSTEM');
    expect(JSON.stringify(audit.rows)).not.toContain(made.temporaryPassword);

    // It cannot be used for anything but the set-up steps.
    const login = await adminCall(t, 'post', '/auth/login', {
      body: { email: made.email, password: made.temporaryPassword },
    }).expect(200);
    expect(login.body.data.nextStep).toBe('password_change');
    await adminCall(t, 'get', '/staff', { token: login.body.data.tokens.accessToken }).expect(403);

    const changed = await adminCall(t, 'post', '/auth/password/change', {
      token: login.body.data.tokens.accessToken,
      body: { currentPassword: made.temporaryPassword, newPassword: ADMIN_NEW_PASSWORD },
    }).expect(200);
    const setup = await adminCall(t, 'post', '/auth/two-factor/setup', {
      token: changed.body.data.tokens.accessToken,
    }).expect(200);
    const done = await adminCall(t, 'post', '/auth/two-factor/confirm', {
      token: changed.body.data.tokens.accessToken,
      body: { code: totpNow(setup.body.data.secret) },
    }).expect(200);
    expect(done.body.data.admin.roles.map((r: { key: string }) => r.key)).toEqual(['super_admin']);
    await adminCall(t, 'get', '/staff', { token: done.body.data.tokens.accessToken }).expect(200);
  });

  it('is repeatable only for new people, and rejects bad input', async () => {
    await bootstrapSuperAdmin(prisma, { email: 'second@blocks.test', name: 'Second Person' });
    await expect(
      bootstrapSuperAdmin(prisma, { email: 'SECOND@blocks.test', name: 'Again Person' }),
    ).rejects.toThrow(/already exists/);
    await expect(
      bootstrapSuperAdmin(prisma, { email: 'not-an-address', name: 'Some Person' }),
    ).rejects.toThrow(/not a valid e-mail/);
    await expect(
      bootstrapSuperAdmin(prisma, { email: 'third@blocks.test', name: 'X' }),
    ).rejects.toThrow(/name/);
  });

  it('lets the invitation lapse like any other', async () => {
    const made = await bootstrapSuperAdmin(prisma, {
      email: 'lapse@blocks.test',
      name: 'Lapsing Person',
      inviteTtlHours: 1,
    });
    await t.db.query(
      "UPDATE admin_users SET invite_expires_at = now() - interval '1 minute' WHERE id = $1",
      [made.id],
    );
    await adminCall(t, 'post', '/auth/login', {
      body: { email: made.email, password: made.temporaryPassword },
    }).expect(401);
  });
});
