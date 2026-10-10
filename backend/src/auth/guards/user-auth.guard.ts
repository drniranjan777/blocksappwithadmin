import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_ADMIN_ROUTE, IS_PUBLIC, PUBLISHES } from '../../common/decorators/route-metadata.js';
import { Errors } from '../../common/errors/app-error.js';
import type { ApiRequest } from '../../common/http/request.js';
import { TokenService } from '../token.service.js';
import { UserSessionService } from '../user-session.service.js';

/** `Authorization: Bearer <token>` -> `<token>`. */
export function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/.exec(header);
  return match?.[1];
}

/**
 * Secure by default: every route needs a signed-in app user unless it is marked
 * `@Public()` (or belongs to the staff realm, which has its own guard).
 *
 * A valid signature is not enough. The guard also checks, on every request, that
 * the session the token names is still live and that the account may still be
 * used. That is what makes "sign out of other devices" and "suspend this user"
 * take effect immediately instead of when the access token expires.
 */
@Injectable()
export class UserAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly sessions: UserSessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(IS_ADMIN_ROUTE, targets)) return true;

    const req = context.switchToHttp().getRequest<ApiRequest>();
    const token = bearerToken(req.headers.authorization);
    if (!token) throw Errors.unauthenticated();

    const claims = await this.tokens.verifyAccess('user', token);
    const session = await this.sessions.resolve(claims.sessionId);
    if (!session || session.userId !== claims.subject) throw Errors.sessionRevoked();
    if (session.userStatus === 'DELETED') throw Errors.unauthenticated();
    if (session.userStatus === 'SUSPENDED') throw Errors.accountSuspended();
    if (
      session.userStatus === 'RESTRICTED' &&
      this.reflector.getAllAndOverride<boolean>(PUBLISHES, targets)
    ) {
      throw Errors.accountRestricted();
    }

    req.auth = { userId: session.userId, sessionId: session.id, methods: claims.methods };
    return true;
  }
}
