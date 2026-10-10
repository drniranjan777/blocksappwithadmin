import type request from 'supertest';
import { PasswordHasher } from '../../src/common/crypto/password.js';
import type { TestApp } from './app.js';
import { type CallOptions, call, freshIp, freshName, totpNow } from './auth.js';

export const ADMIN_PASSWORD = 'Granite#Harbour-7731';
export const ADMIN_NEW_PASSWORD = 'Cobalt!Meadow-2914x';

export interface StaffAccount {
  id: string;
  email: string;
  name: string;
  password: string;
  roleKeys: string[];
  /** The authenticator secret, once enrolled. */
  secret: string;
  /** Unused backup codes; sign-ins use these so tests do not depend on the clock. */
  backupCodes: string[];
  ip: string;
}

export function adminCall(
  t: TestApp,
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  path: string,
  o: CallOptions = {},
): request.Test {
  return call(t, method, `/admin${path}`, o);
}

/** Creates a staff row directly (as the seed script does), without going through an invitation. */
export async function insertAdmin(
  t: TestApp,
  o: {
    roleKeys?: string[];
    email?: string;
    name?: string;
    password?: string;
    status?: 'INVITED' | 'ACTIVE' | 'DISABLED';
    mustChangePassword?: boolean;
    inviteExpiresAt?: Date | null;
  } = {},
): Promise<{ id: string; email: string; name: string; password: string; roleKeys: string[] }> {
  const roleKeys = o.roleKeys ?? ['moderator'];
  const email = o.email ?? `${freshName('staff')}@blocks.test`;
  const name = o.name ?? 'Test Staff';
  const password = o.password ?? ADMIN_PASSWORD;
  const hasher = t.app.get(PasswordHasher, { strict: false });
  const roles = await t.db.prisma.role.findMany({ where: { key: { in: roleKeys } } });
  if (roles.length !== roleKeys.length) throw new Error(`unknown role in ${roleKeys.join(',')}`);
  const admin = await t.db.prisma.adminUser.create({
    data: {
      email,
      name,
      passwordHash: await hasher.hash(password),
      status: o.status ?? 'ACTIVE',
      mustChangePassword: o.mustChangePassword ?? false,
      ...(o.inviteExpiresAt === undefined ? {} : { inviteExpiresAt: o.inviteExpiresAt }),
      roles: { create: roles.map((r) => ({ roleId: r.id })) },
    },
  });
  return { id: admin.id, email, name, password, roleKeys };
}

/**
 * A staff member with two-step verification set up the way a real one does it:
 * through the sign-in and enrolment endpoints.
 */
export async function provisionAdmin(
  t: TestApp,
  o: { roleKeys?: string[]; email?: string; name?: string } = {},
): Promise<StaffAccount> {
  const base = await insertAdmin(t, o);
  const ip = freshIp();
  const login = await adminCall(t, 'post', '/auth/login', {
    ip,
    body: { email: base.email, password: base.password },
  });
  if (login.status !== 200 || login.body.data.nextStep !== 'two_factor_setup') {
    throw new Error(`unexpected login: ${login.status} ${JSON.stringify(login.body)}`);
  }
  const token = login.body.data.tokens.accessToken as string;
  const setup = await adminCall(t, 'post', '/auth/two-factor/setup', { token, ip }).expect(200);
  const secret = setup.body.data.secret as string;
  const done = await adminCall(t, 'post', '/auth/two-factor/confirm', {
    token,
    ip,
    body: { code: totpNow(secret) },
  });
  if (done.status !== 200)
    throw new Error(`enrolment failed: ${done.status} ${JSON.stringify(done.body)}`);
  return { ...base, secret, backupCodes: done.body.data.backupCodes as string[], ip };
}

export interface StaffSession {
  accessToken: string;
  refreshToken: string;
  admin: StaffAccount;
}

/** A fully signed-in staff session (password, then a backup code). Uses up one backup code. */
export async function signInAdmin(
  t: TestApp,
  admin: StaffAccount,
  o: { ip?: string } = {},
): Promise<StaffSession> {
  const ip = o.ip ?? admin.ip;
  const login = await adminCall(t, 'post', '/auth/login', {
    ip,
    body: { email: admin.email, password: admin.password },
  }).expect(200);
  if (login.body.data.nextStep !== 'two_factor') {
    throw new Error(`expected two_factor, got ${login.body.data.nextStep}`);
  }
  const code = admin.backupCodes.shift();
  if (!code) throw new Error('no backup codes left for this test account');
  const done = await adminCall(t, 'post', '/auth/login/verify', {
    token: login.body.data.tokens.accessToken,
    ip,
    body: { method: 'backup_code', code },
  });
  if (done.status !== 200 || done.body.data.nextStep !== null) {
    throw new Error(`verify failed: ${done.status} ${JSON.stringify(done.body)}`);
  }
  return {
    accessToken: done.body.data.tokens.accessToken,
    refreshToken: done.body.data.tokens.refreshToken,
    admin,
  };
}

/** Shorthand: provision and sign in. */
export async function staffSession(
  t: TestApp,
  roleKeys: string[],
  name?: string,
): Promise<StaffSession> {
  return signInAdmin(t, await provisionAdmin(t, { roleKeys, ...(name ? { name } : {}) }));
}
