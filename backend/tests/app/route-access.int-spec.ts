import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { permissionsForRoles, ROLES } from '../../src/admin/rbac/permission-catalog.js';
import { listRoutes, type RouteInfo } from '../../src/common/http/route-inventory.js';
import { staffSession, type StaffSession } from '../support/admin.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { AUTH_TEST_ENV, freshIp, signUp, type Account } from '../support/auth.js';

/**
 * Access control by calling every route, not by reading its metadata (`route-protection` does
 * that). Each protected route is actually requested over HTTP with no credentials, with a forged
 * token, with the wrong kind of valid token, and (for staff routes) as the least-privileged staff
 * role. A route added later is covered without anyone remembering to list it.
 *
 * The body sent is `{}` and the ids are made up: the request must be refused *before* either
 * matters, which is the point.
 */
const SOME_ID = '01990000-0000-7000-8000-000000000001';

describe('access control, route by route', () => {
  let t: TestApp;
  let routes: RouteInfo[];
  let user: Account;
  let leastStaff: StaffSession;
  let leastRole: { key: string };

  beforeAll(async () => {
    t = await createTestApp({ ...AUTH_TEST_ENV });
    routes = listRoutes(t.app);
    user = await signUp(t);
    leastRole = [...ROLES].sort(
      (a, b) => permissionsForRoles([a.key]).size - permissionsForRoles([b.key]).size,
    )[0] as { key: string };
    leastStaff = await staffSession(t, [leastRole.key]);
  }, 240_000);
  afterAll(async () => {
    await t.close();
  });

  const key = (r: RouteInfo) => `${r.method} ${r.path}`;
  const protectedRoutes = () => routes.filter((r) => !r.public);

  async function hit(r: RouteInfo, token?: string): Promise<number> {
    const path = r.path.replace(/:[A-Za-z]+/g, SOME_ID).replace(/\*\w+/g, 'x');
    const method = r.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
    let req = t.http[method](path).set('X-Forwarded-For', freshIp());
    if (token) req = req.set('Authorization', `Bearer ${token}`);
    if (method !== 'get' && method !== 'delete') req = req.send({});
    return (await req).status;
  }

  /** Requests every route in `list`; returns the ones whose status is not in `allowed`. */
  async function unexpected(list: RouteInfo[], token: string | undefined, allowed: number[]) {
    const bad: string[] = [];
    for (const r of list) {
      const status = await hit(r, token);
      if (!allowed.includes(status)) bad.push(`${key(r)} -> ${status}`);
    }
    return bad;
  }

  it('covers a meaningful number of protected routes', () => {
    expect(protectedRoutes().length).toBeGreaterThan(200);
    expect(routes.some((r) => r.admin)).toBe(true);
    expect(routes.some((r) => !r.admin && !r.public)).toBe(true);
  });

  it('answers 401 to every protected route when no credentials are sent', async () => {
    expect(await unexpected(protectedRoutes(), undefined, [401])).toEqual([]);
  }, 240_000);

  it('answers 401 to every protected route when the token is forged or garbage', async () => {
    expect(await unexpected(protectedRoutes(), 'not.a.token', [401])).toEqual([]);
    const forged = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(
      '{"sub":"00000000-0000-0000-0000-000000000000","role":"super_admin"}',
    ).toString('base64url')}.`;
    expect(await unexpected(protectedRoutes(), forged, [401])).toEqual([]);
  }, 240_000);

  it('never lets an ordinary app user into a staff route', async () => {
    const staff = routes.filter((r) => r.admin);
    expect(staff.length).toBeGreaterThan(80);
    expect(await unexpected(staff, user.accessToken, [401, 403])).toEqual([]);
  }, 240_000);

  it('never lets a staff token into an app-user route', async () => {
    const appRoutes = routes.filter((r) => !r.admin && !r.public);
    expect(await unexpected(appRoutes, leastStaff.accessToken, [401, 403])).toEqual([]);
  }, 240_000);

  it('answers 403 when a signed-in staff member lacks a permission the route needs', async () => {
    const held = permissionsForRoles([leastRole.key]);
    const gated = routes.filter(
      (r) =>
        r.admin && r.permissions.length > 0 && !r.permissions.every((p) => held.has(p as never)),
    );
    expect(gated.length).toBeGreaterThan(60);
    expect(await unexpected(gated, leastStaff.accessToken, [403])).toEqual([]);
  }, 240_000);
});
