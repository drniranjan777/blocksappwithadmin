import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isPermissionKey } from '../../src/admin/rbac/permission-catalog.js';
import { listRoutes, type RouteInfo } from '../../src/common/http/route-inventory.js';
import { createTestApp, type TestApp } from '../support/app.js';

/**
 * Who can call what, checked for every route the application serves at once.
 *
 * A new route that is left open by mistake (public by accident, a staff route with no permission,
 * a staff route that an ordinary app user could reach) fails here. Making a route public is a
 * deliberate act, so it has to be added to `PUBLIC` below, with the reason it is safe.
 */
const PUBLIC: Record<string, string> = {
  // Health probes: no data, no secrets.
  'GET /api/v1/health': 'liveness for the platform',
  'GET /api/v1/health/live': 'liveness for the platform',
  'GET /api/v1/health/ready': 'readiness for the platform',
  // Signing in is how you become known. Each is rate-limited per address and per account.
  'POST /api/v1/auth/register':
    'creates an account; answers the same whether or not the contact exists',
  'POST /api/v1/auth/verify-contact': 'proves a code sent to the new contact',
  'POST /api/v1/auth/resend': 'sends another code; answers the same for any contact',
  'POST /api/v1/auth/login':
    'password sign-in; answers the same for a wrong password and an unknown account',
  'POST /api/v1/auth/login/verify': 'second step with a code; holds only a half-signed-in token',
  'POST /api/v1/auth/refresh': 'trades a refresh token (single use) for new tokens',
  'POST /api/v1/auth/password/forgot': 'asks for a reset code; answers the same for any contact',
  'POST /api/v1/auth/password/verify': 'proves the reset code',
  'POST /api/v1/auth/password/reset': 'sets a new password with a proven code',
  'POST /api/v1/auth/password/resend': 'sends another reset code',
  'GET /api/v1/auth/policy': 'the password and code rules, so the sign-up screen can explain them',
  'GET /api/v1/auth/password-policy': 'the password rules (older name of the same information)',
  'POST /api/v1/admin/auth/login':
    'staff password sign-in; always followed by two-step verification',
  'POST /api/v1/admin/auth/refresh': 'trades a staff refresh token (single use)',
  // Files are fetched by address, and the address carries a signature that expires.
  'GET /api/v1/media/f/*path': 'a processed file; the link is signed and expires',
  'GET /api/v1/media/local-download/:token':
    'development storage driver; the link is signed and expires',
  'PUT /api/v1/media/local-upload/:token':
    'development storage driver; the link is signed and expires',
  // Development only: registered by DevModule.forRoot, which production refuses.
  'GET /api/v1/dev/outbox': 'development only: the in-memory mailbox; refused in production',
  'DELETE /api/v1/dev/outbox': 'development only: the in-memory mailbox; refused in production',
};

describe('who can reach what', () => {
  let t: TestApp;
  let routes: RouteInfo[];

  beforeAll(async () => {
    t = await createTestApp({});
    routes = listRoutes(t.app);
  }, 240_000);
  afterAll(async () => {
    await t.close();
  });

  const key = (r: RouteInfo) => `${r.method} ${r.path}`;
  const publicRoutes = () => routes.filter((r) => r.public);
  const staffRoutes = () => routes.filter((r) => r.admin);

  it('finds the whole API', () => {
    expect(routes.length).toBeGreaterThan(250);
    expect(new Set(routes.map(key)).size).toBe(routes.length); // no two handlers for one route
    expect(routes.every((r) => r.path.startsWith('/api/v1/'))).toBe(true);
  });

  it('leaves public only what is deliberately public', () => {
    // (Printed so a reviewer sees the list when it changes.)
    const unlisted = publicRoutes().filter((r) => !(key(r) in PUBLIC));
    expect(unlisted.map(key)).toEqual([]);
    // And nothing on the list has been left behind after its route went away.
    const present = new Set(routes.map(key));
    expect(Object.keys(PUBLIC).filter((k) => !present.has(k))).toEqual([]);
    // Every one of them says why it is safe.
    expect(Object.values(PUBLIC).every((why) => why.length > 10)).toBe(true);
  });

  it('keeps the two realms apart: staff routes live under /admin and only there', () => {
    for (const r of routes) {
      const underAdmin = r.path.startsWith('/api/v1/admin/') || r.path === '/api/v1/admin';
      // (Staff sign-in itself is public by necessity, but still lives under /admin.)
      expect(underAdmin, key(r)).toBe(r.admin || (r.public && underAdmin));
    }
  });

  it('refuses a staff route that names no permission, unless it is an own-account or sign-in step', () => {
    const open = staffRoutes().filter(
      (r) => !r.public && r.permissions.length === 0 && !r.anyAdmin && !r.enrolScope,
    );
    expect(open.map(key)).toEqual([]);
  });

  it('only names permissions that exist', () => {
    const unknown = routes.flatMap((r) =>
      r.permissions.filter((p) => !isPermissionKey(p)).map((p) => `${key(r)} ${p}`),
    );
    expect(unknown).toEqual([]);
  });

  it('does not let a staff route that changes things be guarded by a read-only permission alone', () => {
    const mutating = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
    const weak = staffRoutes()
      .filter((r) => !r.public && mutating.has(r.method) && r.permissions.length > 0)
      .filter((r) => r.permissions.every((p) => p.endsWith('.read')));
    expect(weak.map((r) => `${key(r)} [${r.permissions.join(', ')}]`)).toEqual([]);
  });

  it('marks everything that puts content in front of other people as publishing', () => {
    // A restricted account may read but not publish; these routes are where that is enforced.
    const mustPublish = [
      'POST /api/v1/posts',
      'POST /api/v1/posts/:id/comments',
      'POST /api/v1/reels/:id/comments',
      'POST /api/v1/business/pages',
      'PATCH /api/v1/business/pages/:id',
      'POST /api/v1/business/pages/:id/publish',
      'POST /api/v1/business/pages/:id/offers',
      'POST /api/v1/ads/campaigns',
      'PATCH /api/v1/ads/campaigns/:id',
      'POST /api/v1/ads/campaigns/:id/submit',
    ];
    const publishing = new Set(routes.filter((r) => r.publishes).map(key));
    expect(mustPublish.filter((k) => !publishing.has(k))).toEqual([]);
  });

  it('keeps the moderation, business and advertising staff routes behind their own permissions', () => {
    const need = (path: string, method: string) =>
      routes.find((r) => r.path === path && r.method === method)?.permissions ?? ['MISSING'];
    // Deciding is separate from reading; reversing and escalating are separate from deciding.
    expect(need('/api/v1/admin/moderation/reports', 'GET')).toEqual(['reports.read']);
    expect(need('/api/v1/admin/moderation/reports/:id/decision', 'POST')).toEqual([
      'reports.resolve',
    ]);
    expect(need('/api/v1/admin/moderation/reports/:id/claim', 'POST')).toEqual(['reports.assign']);
    expect(need('/api/v1/admin/appeals/:id/decision', 'POST')).toEqual(['appeals.decide']);
    expect(need('/api/v1/admin/live/sessions/:id/terminate', 'POST')).toEqual(['live.terminate']);
    expect(need('/api/v1/admin/policy/categories/:category', 'PUT')).toEqual(['policy.update']);
    expect(need('/api/v1/admin/safety/incidents/:id/escalate', 'POST')).toEqual([
      'safety.incidents.write',
      'reports.escalate',
    ]);
    expect(need('/api/v1/admin/business/verification/:id/decision', 'POST')).toEqual([
      'business.verify',
    ]);
    expect(need('/api/v1/admin/business/pages/:id/suspend', 'POST')).toEqual(['business.manage']);
    expect(need('/api/v1/admin/ads/campaigns/:id/approve', 'POST')).toEqual(['ads.manage']);
  });

  it('does not offer the delivery of advertising over HTTP at all', () => {
    // Recording what an ad cost is for the ad-serving service that does not exist yet. A route that
    // wrote spend would let anyone who found it spend someone else's budget.
    const delivery = routes.filter(
      (r) =>
        /(^|\/)(deliver\w*|spend|impressions?|clicks?)(\/|$)/i.test(r.path) && r.method !== 'GET',
    );
    expect(delivery.map(key)).toEqual([]);
  });
});
