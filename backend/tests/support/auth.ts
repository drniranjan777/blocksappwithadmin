import { generateSync } from 'otplib';
import type request from 'supertest';
import { DevOutbox } from '../../src/providers/outbox.service.js';
import type { TestApp } from './app.js';

/** Meets the default password policy; never a real password. */
export const PASSWORD = 'Sunrise!Pass-2026';

/** Appended to every test app so each account can come from its own network address. */
export const AUTH_TEST_ENV = { TRUST_PROXY_HOPS: '1' } as const;

let ipCounter = 0;
/** An address in the benchmarking range (RFC 2544), each from a different /24 network. */
export function freshIp(): string {
  ipCounter += 1;
  return `198.${18 + Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}.10`;
}

let nameCounter = 0;
export function freshName(prefix = 'user'): string {
  nameCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${nameCounter}`;
}

export interface Account {
  id: string;
  username: string;
  email: string;
  password: string;
  deviceId: string;
  ip: string;
  accessToken: string;
  refreshToken: string;
}

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface CallOptions {
  token?: string;
  body?: object;
  ip?: string;
  query?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
}

/** One API call, with the bearer token and client address set the way a phone would. */
export function call(t: TestApp, method: Method, path: string, o: CallOptions = {}): request.Test {
  let req = t.http[method](`/api/v1${path}`);
  if (o.token) req = req.set('Authorization', `Bearer ${o.token}`);
  req = req.set('X-Forwarded-For', o.ip ?? freshIp());
  for (const [k, v] of Object.entries(o.headers ?? {})) req = req.set(k, v);
  if (o.query) req = req.query(o.query);
  if (o.body) req = req.send(o.body);
  return req;
}

export function outbox(t: TestApp): DevOutbox {
  return t.app.get(DevOutbox, { strict: false });
}

/** The newest 6-digit code "sent" to an address (e-mail or phone). */
export function codeSentTo(t: TestApp, address: string): string {
  const code = outbox(t).lastCode(address);
  if (!code) throw new Error(`no code was sent to ${address}`);
  return code;
}

export function deviceBody(deviceId: string, name = 'Test phone') {
  return { deviceId, deviceName: name, platform: 'ANDROID', appVersion: '1.0.0' };
}

export interface SignUpOptions {
  username?: string;
  email?: string;
  password?: string;
  ip?: string;
  deviceId?: string;
  dateOfBirth?: string;
}

/** Registers and verifies an account through the real endpoints, signed in on one device. */
export async function signUp(t: TestApp, o: SignUpOptions = {}): Promise<Account> {
  const username = o.username ?? freshName();
  const email = o.email ?? `${username}@example.test`;
  const password = o.password ?? PASSWORD;
  const ip = o.ip ?? freshIp();
  const deviceId = o.deviceId ?? `dev-${username}`;

  const reg = await call(t, 'post', '/auth/register', {
    ip,
    body: {
      username,
      displayName: 'Test Person',
      email,
      password,
      dateOfBirth: o.dateOfBirth ?? '1998-04-12',
      device: deviceBody(deviceId),
    },
  });
  if (reg.status !== 202)
    throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.body)}`);

  const verified = await call(t, 'post', '/auth/verify-contact', {
    ip,
    body: {
      challengeId: reg.body.data.verification.challengeId,
      code: codeSentTo(t, email),
      device: deviceBody(deviceId),
    },
  });
  if (verified.status !== 200)
    throw new Error(`verify failed: ${verified.status} ${JSON.stringify(verified.body)}`);

  return {
    id: verified.body.data.user.id,
    username,
    email,
    password,
    deviceId,
    ip,
    accessToken: verified.body.data.tokens.accessToken,
    refreshToken: verified.body.data.tokens.refreshToken,
  };
}

/** Signs in again with the password (same device and address unless told otherwise). */
export function logIn(
  t: TestApp,
  a: Pick<Account, 'username' | 'password' | 'deviceId' | 'ip'>,
  o: Partial<{ ip: string; deviceId: string; identifier: string; password: string }> = {},
) {
  return call(t, 'post', '/auth/login', {
    ip: o.ip ?? a.ip,
    body: {
      identifier: o.identifier ?? a.username,
      password: o.password ?? a.password,
      device: deviceBody(o.deviceId ?? a.deviceId),
    },
  });
}

/** The code an authenticator app shows right now for `secret`. */
export function totpNow(secret: string, offsetSeconds = 0): string {
  return generateSync({
    strategy: 'totp',
    secret,
    epoch: Math.floor(Date.now() / 1000) + offsetSeconds,
  });
}
