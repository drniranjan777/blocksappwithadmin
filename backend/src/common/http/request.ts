import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

/** The request object as the API sees it once middleware has run. */
export interface ApiRequest extends Request {
  /** The request id (also returned as `X-Request-Id`). */
  requestId?: string;
  /** Set by the auth guard. */
  auth?: AuthContext;
  adminAuth?: AdminAuthContext;
}

export interface AuthContext {
  userId: string;
  sessionId: string;
  /** What the sign-in proved: password, otp, totp... */
  methods: string[];
}

export interface AdminAuthContext {
  adminId: string;
  sessionId: string;
  email: string;
  name: string;
  roles: string[];
  permissions: ReadonlySet<string>;
  /** `enrol` until the account has changed its password and passed two-step verification. */
  scope: 'full' | 'enrol';
  /** What is left before full access, in order; `null` when nothing is. */
  nextStep: 'password_change' | 'two_factor_setup' | 'two_factor' | null;
  ip?: string | undefined;
  userAgent?: string | undefined;
}

const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Gives every request an id, taking a well-formed one from the caller
 * (`X-Request-Id`, set by the gateway) or making one. It is returned in the
 * response header and in every error body, and is what support asks for.
 */
export function requestIdMiddleware(req: ApiRequest, res: Response, next: NextFunction): void {
  const supplied = req.headers['x-request-id'];
  const id = typeof supplied === 'string' && REQUEST_ID.test(supplied) ? supplied : randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

/**
 * The caller's IP address. With `TRUST_PROXY_HOPS` set, Express resolves it from
 * `X-Forwarded-For` taking only the trusted hops, so a client cannot choose its
 * own address by sending that header.
 */
export function clientIp(req: Request): string | undefined {
  return req.ip ?? req.socket.remoteAddress ?? undefined;
}

export function userAgentOf(req: Request): string | undefined {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua.slice(0, 400) : undefined;
}

/** What the auth layer wants to know about the caller, in one object. */
export function requestInfoOf(
  req: Request,
  geo: { locate(req: Request): string | undefined },
): { ip: string | undefined; userAgent: string | undefined; locationLabel: string | undefined } {
  return { ip: clientIp(req), userAgent: userAgentOf(req), locationLabel: geo.locate(req) };
}
