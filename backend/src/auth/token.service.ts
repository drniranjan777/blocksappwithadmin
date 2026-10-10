import { Inject, Injectable } from '@nestjs/common';
import { SignJWT, errors, jwtVerify } from 'jose';
import { hmacHex } from '../common/crypto/tokens.js';
import { Errors } from '../common/errors/app-error.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

export type Realm = 'user' | 'admin';

const AUDIENCE: Record<Realm, string> = { user: 'blocks-app', admin: 'blocks-admin' };

export interface AccessClaims {
  /** The user or admin id. */
  subject: string;
  sessionId: string;
  /** How the holder proved themselves: `pwd`, `otp`, `totp`... */
  methods: string[];
  /** Admin tokens only. */
  scope: 'full' | 'enrol';
}

export interface SignedAccessToken {
  token: string;
  expiresAt: Date;
  expiresInSeconds: number;
}

/**
 * Short-lived signed access tokens (JWT, HS256).
 *
 * Three safeguards beyond "it has a valid signature":
 *   - each realm (app users, staff) has its **own derived key**, so a token
 *     from one can never verify as the other even if an audience check were
 *     ever dropped;
 *   - the audience, issuer and algorithm are all pinned on verification;
 *   - the previous secret still verifies (never signs) while keys rotate.
 *
 * A valid token is necessary, not sufficient: the guards also check that the
 * session it names is still active, which is what makes sign-out immediate.
 */
@Injectable()
export class TokenService {
  private readonly keys: Record<Realm, { current: Uint8Array; previous?: Uint8Array }>;

  constructor(@Inject(ENV) private readonly env: Env) {
    const derive = (secret: string, realm: Realm): Uint8Array =>
      Buffer.from(hmacHex(secret, `blocks:jwt:${realm}`), 'hex');
    const build = (realm: Realm): { current: Uint8Array; previous?: Uint8Array } => ({
      current: derive(env.JWT_SECRET, realm),
      ...(env.JWT_SECRET_PREVIOUS ? { previous: derive(env.JWT_SECRET_PREVIOUS, realm) } : {}),
    });
    this.keys = { user: build('user'), admin: build('admin') };
  }

  async signAccess(realm: Realm, claims: AccessClaims): Promise<SignedAccessToken> {
    const ttl =
      realm === 'admin'
        ? this.env.ADMIN_ACCESS_TOKEN_TTL_SECONDS
        : this.env.ACCESS_TOKEN_TTL_SECONDS;
    const token = await new SignJWT({
      sid: claims.sessionId,
      amr: claims.methods,
      scp: claims.scope,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' })
      .setIssuer(this.env.JWT_ISSUER)
      .setAudience(AUDIENCE[realm])
      .setSubject(claims.subject)
      .setIssuedAt()
      .setExpirationTime(`${ttl}s`)
      .sign(this.keys[realm].current);
    return { token, expiresAt: new Date(Date.now() + ttl * 1000), expiresInSeconds: ttl };
  }

  async verifyAccess(realm: Realm, token: string): Promise<AccessClaims> {
    const { current, previous } = this.keys[realm];
    for (const key of previous ? [current, previous] : [current]) {
      try {
        const { payload } = await jwtVerify(token, key, {
          issuer: this.env.JWT_ISSUER,
          audience: AUDIENCE[realm],
          algorithms: ['HS256'],
        });
        const sid = payload['sid'];
        const amr = payload['amr'];
        if (typeof payload.sub !== 'string' || typeof sid !== 'string')
          throw Errors.unauthenticated();
        return {
          subject: payload.sub,
          sessionId: sid,
          methods: Array.isArray(amr) ? amr.filter((m): m is string => typeof m === 'string') : [],
          scope: payload['scp'] === 'enrol' ? 'enrol' : 'full',
        };
      } catch (error) {
        if (error instanceof errors.JWTExpired) throw Errors.tokenExpired();
        if (error instanceof errors.JWSSignatureVerificationFailed) continue; // try the previous key
        if (error instanceof Error && error.name === 'AppError') throw error;
        throw Errors.unauthenticated();
      }
    }
    throw Errors.unauthenticated();
  }
}
