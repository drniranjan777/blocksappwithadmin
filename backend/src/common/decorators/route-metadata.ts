import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AdminAuthContext, ApiRequest, AuthContext } from '../http/request.js';
import type { PermissionKey } from '../../admin/rbac/permission-catalog.js';

export const IS_PUBLIC = 'isPublic';
/** Skips authentication. Use only for routes that must work signed out. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

export const IS_ADMIN_ROUTE = 'isAdminRoute';
/**
 * Marks a staff route. The app-user guard steps aside and the admin guard takes
 * over, with its own tokens, sessions and permission checks. A route is
 * protected by one realm or the other (or is `@Public`): never neither.
 */
export const AdminRoute = (): MethodDecorator & ClassDecorator => SetMetadata(IS_ADMIN_ROUTE, true);

export const PUBLISHES = 'publishes';
/**
 * Marks a route that puts something in front of other people (a post, reel, story or comment).
 * A restricted account may sign in and read but is refused here.
 */
export const Publishes = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLISHES, true);

export const IS_RAW = 'isRawResponse';
/** Returns the body as-is, without the `{ data }` envelope (health probes, files). */
export const RawResponse = (): MethodDecorator & ClassDecorator => SetMetadata(IS_RAW, true);

export const PERMISSIONS_KEY = 'requiredPermissions';
/**
 * Staff routes: the caller needs *all* of these permissions. Checked on the
 * server on every request; the admin UI hiding a button is a convenience, never
 * the control.
 */
export const RequirePermissions = (
  ...permissions: PermissionKey[]
): MethodDecorator & ClassDecorator => SetMetadata(PERMISSIONS_KEY, permissions);

export const ANY_ADMIN = 'anyAdmin';
/**
 * A staff route that needs no particular permission, only a fully signed-in
 * staff member (their own profile, their own sessions). It must be written out:
 * a staff route that declares nothing is refused, so forgetting a permission can
 * never open a route up.
 */
export const AnyAdmin = (): MethodDecorator & ClassDecorator => SetMetadata(ANY_ADMIN, true);

export const ALLOW_ENROL_SCOPE = 'allowEnrolScope';
/** A staff route a not-yet-fully-enrolled account may call (set password, set up 2FA). */
export const AllowEnrolScope = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_ENROL_SCOPE, true);

/** The signed-in app user (set by the auth guard). */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext => {
    const req = ctx.switchToHttp().getRequest<ApiRequest>();
    if (!req.auth) throw new Error('CurrentUser used on a route the auth guard did not protect');
    return req.auth;
  },
);

/** The signed-in staff member (set by the admin guard). */
export const CurrentAdmin = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AdminAuthContext => {
    const req = ctx.switchToHttp().getRequest<ApiRequest>();
    if (!req.adminAuth)
      throw new Error('CurrentAdmin used on a route the admin guard did not protect');
    return req.adminAuth;
  },
);
