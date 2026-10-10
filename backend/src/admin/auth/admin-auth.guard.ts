import { type CanActivate, type ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { bearerToken } from '../../auth/guards/user-auth.guard.js';
import { TokenService } from '../../auth/token.service.js';
import {
  ALLOW_ENROL_SCOPE,
  ANY_ADMIN,
  IS_ADMIN_ROUTE,
  IS_PUBLIC,
  PERMISSIONS_KEY,
} from '../../common/decorators/route-metadata.js';
import { Errors } from '../../common/errors/app-error.js';
import { type ApiRequest, clientIp, userAgentOf } from '../../common/http/request.js';
import { AuditService } from '../audit/audit.service.js';
import { AdminPermissionsService } from '../rbac/admin-permissions.service.js';
import type { PermissionKey } from '../rbac/permission-catalog.js';
import { nextStepFor } from './admin-auth.service.js';
import { AdminSessionService } from './admin-session.service.js';

/**
 * Protects every `@AdminRoute()`. It is the single place where "may this person
 * do this?" is decided, on every request, from the database:
 *
 *   1. a valid staff token (its own signing key and audience, so an app-user
 *      token is meaningless here);
 *   2. a live session that has not timed out or been revoked;
 *   3. an account that is not disabled;
 *   4. the set-up steps done (new password, two-step verification), unless the
 *      route is one of those steps;
 *   5. every permission the route declares.
 *
 * A route that declares no permission and is not explicitly `@AnyAdmin()` or an
 * enrolment step is **refused**, so a forgotten decorator closes a route
 * instead of opening it.
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  private readonly logger = new Logger('AdminAuth');

  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly sessions: AdminSessionService,
    private readonly access: AdminPermissionsService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (!this.reflector.getAllAndOverride<boolean>(IS_ADMIN_ROUTE, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<ApiRequest>();
    const token = bearerToken(req.headers.authorization);
    if (!token) throw Errors.unauthenticated();

    const claims = await this.tokens.verifyAccess('admin', token);
    const session = await this.sessions.resolve(claims.sessionId);
    if (!session || session.adminId !== claims.subject) {
      throw (await this.sessions.whyUnusable(claims.sessionId)) === 'expired'
        ? Errors.sessionExpired()
        : Errors.sessionRevoked();
    }
    const { admin } = session;
    if (admin.status === 'DISABLED') throw Errors.sessionRevoked();

    const nextStep = nextStepFor(admin, session.mfaVerified);
    const allowEnrol = !!this.reflector.getAllAndOverride<boolean>(ALLOW_ENROL_SCOPE, targets);
    if (nextStep && !allowEnrol) throw Errors.enrolmentRequired(nextStep);

    const required = this.reflector.getAllAndOverride<PermissionKey[] | undefined>(
      PERMISSIONS_KEY,
      targets,
    );
    const anyAdmin = !!this.reflector.getAllAndOverride<boolean>(ANY_ADMIN, targets);
    if (!required?.length && !anyAdmin && !allowEnrol) {
      this.logger.error(
        `Staff route ${req.method} ${req.path} declares no permission; refusing it. Add @RequirePermissions(...) or @AnyAdmin().`,
      );
      throw Errors.forbidden();
    }

    const access = await this.access.accessFor(session.adminId);
    if (required?.length) {
      const missing = required.filter((p) => !access.permissions.has(p));
      if (missing.length) {
        await this.audit
          .record({
            actorType: 'ADMIN',
            actorId: session.adminId,
            actorLabel: admin.name,
            action: 'admin.access_denied',
            ip: clientIp(req),
            userAgent: userAgentOf(req),
            requestId: req.requestId,
            after: { method: req.method, path: req.path, required },
          })
          .catch(() => undefined);
        // Generic on purpose: which permission was missing is not the caller's business.
        throw Errors.forbidden();
      }
    }

    req.adminAuth = {
      adminId: session.adminId,
      sessionId: session.id,
      email: admin.email,
      name: admin.name,
      roles: access.roles.map((r) => r.key),
      permissions: access.permissions,
      scope: nextStep ? 'enrol' : 'full',
      nextStep,
      ip: clientIp(req),
      userAgent: userAgentOf(req),
    };
    return true;
  }
}
