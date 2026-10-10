import { ModulesContainer } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditService } from '../../src/admin/audit/audit.service.js';
import { PERMISSIONS, ROLES } from '../../src/admin/rbac/permission-catalog.js';
import { RbacSyncService } from '../../src/admin/rbac/rbac-sync.service.js';
import {
  ALLOW_ENROL_SCOPE,
  ANY_ADMIN,
  IS_ADMIN_ROUTE,
  IS_PUBLIC,
  PERMISSIONS_KEY,
} from '../../src/common/decorators/route-metadata.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { adminCall, staffSession, type StaffSession } from '../support/admin.js';
import { AUTH_TEST_ENV, freshName } from '../support/auth.js';

describe('audit trail and role catalogue', () => {
  let t: TestApp;
  let boss: StaffSession;

  beforeAll(async () => {
    t = await createTestApp({ ...AUTH_TEST_ENV });
    boss = await staffSession(t, ['super_admin']);
  });
  afterAll(async () => {
    await t.close();
  });

  describe('the audit log', () => {
    it('cannot be altered or erased, even with direct database access', async () => {
      await t.app.get(AuditService, { strict: false }).record({
        actorType: 'SYSTEM',
        action: 'test.immutable',
        reason: 'to be tampered with',
      });
      await expect(
        t.db.query("UPDATE audit_logs SET reason = 'edited' WHERE action = 'test.immutable'"),
      ).rejects.toThrow(/append-only|not allowed|immutable/i);
      await expect(
        t.db.query("DELETE FROM audit_logs WHERE action = 'test.immutable'"),
      ).rejects.toThrow(/append-only|not allowed|immutable/i);
      await expect(t.db.query('TRUNCATE audit_logs')).rejects.toThrow(
        /append-only|not allowed|immutable/i,
      );
      const still = await t.db.query(
        "SELECT reason FROM audit_logs WHERE action = 'test.immutable'",
      );
      expect(still.rows[0]).toEqual({ reason: 'to be tampered with' });
    });

    it('never stores secrets, whatever a caller hands it', async () => {
      await t.app.get(AuditService, { strict: false }).record({
        actorType: 'SYSTEM',
        action: 'test.redaction',
        after: {
          email: 'a@b.test',
          password: 'hunter2',
          nested: { refreshToken: 'abc', accountNumber: '123456789012' },
        },
      });
      const row = await t.db.query<{ after: Record<string, any> }>(
        "SELECT after FROM audit_logs WHERE action = 'test.redaction'",
      );
      expect(row.rows[0]?.after.email).toBe('a@b.test');
      expect(row.rows[0]?.after.password).toBe('[redacted]');
      expect(row.rows[0]?.after.nested.refreshToken).toBe('[redacted]');
      expect(row.rows[0]?.after.nested.accountNumber).toBe('[redacted]');
    });

    it('shows who did what, newest first, and filters', async () => {
      const k = `audit_${freshName('r').slice(-6)}`;
      await adminCall(t, 'post', '/roles', {
        token: boss.accessToken,
        body: { key: k, name: 'Audit probe', permissionKeys: ['users.read'] },
      }).expect(201);

      const mine = await adminCall(t, 'get', '/audit-logs', {
        token: boss.accessToken,
        query: { actorId: boss.admin.id, module: 'role' },
      }).expect(200);
      expect(mine.body.data.length).toBeGreaterThan(0);
      expect(mine.body.data[0]).toMatchObject({
        action: 'role.created',
        actorType: 'ADMIN',
        actorId: boss.admin.id,
        targetType: 'role',
      });
      expect(mine.body.data[0].after.key).toBe(k);
      expect(mine.body.data[0].actorLabel).toBeTruthy();

      const exact = await adminCall(t, 'get', '/audit-logs', {
        token: boss.accessToken,
        query: { action: 'role.created' },
      }).expect(200);
      expect(exact.body.data.every((e: { action: string }) => e.action === 'role.created')).toBe(
        true,
      );

      const times = mine.body.data.map((e: { createdAt: string }) => e.createdAt);
      expect([...times].sort().reverse()).toEqual(times);
    });

    it('filters by time and target, and pages without gaps', async () => {
      const before = new Date().toISOString();
      for (let i = 0; i < 5; i++) {
        await adminCall(t, 'post', '/roles', {
          token: boss.accessToken,
          body: {
            key: `page_${freshName('p').slice(-7)}`,
            name: `Paging ${i}`,
            permissionKeys: ['users.read'],
          },
        }).expect(201);
      }
      const seen: string[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const res = await adminCall(t, 'get', '/audit-logs', {
          token: boss.accessToken,
          query: { action: 'role.created', from: before, limit: 2, ...(cursor ? { cursor } : {}) },
        }).expect(200);
        seen.push(...res.body.data.map((e: { id: string }) => e.id));
        cursor = res.body.meta.hasMore ? res.body.meta.nextCursor : undefined;
        pages++;
      } while (cursor && pages < 10);
      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5);

      const none = await adminCall(t, 'get', '/audit-logs', {
        token: boss.accessToken,
        query: { action: 'role.created', from: new Date(Date.now() + 3_600_000).toISOString() },
      }).expect(200);
      expect(none.body.data).toEqual([]);
      await adminCall(t, 'get', '/audit-logs', {
        token: boss.accessToken,
        query: { from: 'yesterday-ish' },
      }).expect(400);
      await adminCall(t, 'get', '/audit-logs', {
        token: boss.accessToken,
        query: { actorId: 'x' },
      }).expect(400);
      await adminCall(t, 'get', '/audit-logs', {
        token: boss.accessToken,
        query: { module: 'DROP TABLE' },
      }).expect(400);
    });

    it('hides entries about protected data from those who may not see them', async () => {
      await t.app.get(AuditService, { strict: false }).record({
        actorType: 'ADMIN',
        action: 'kyc.document_viewed',
        targetType: 'kyc',
        targetId: 'case-1',
        sensitive: true,
      });
      // A custom role that can read the audit log but not the sensitive part of it.
      const k = `plain_audit_${freshName('r').slice(-5)}`;
      await adminCall(t, 'post', '/roles', {
        token: boss.accessToken,
        body: { key: k, name: 'Plain auditor', permissionKeys: ['audit.read'] },
      }).expect(201);
      const plain = await staffSession(t, [k]);

      const seenByPlain = await adminCall(t, 'get', '/audit-logs', {
        token: plain.accessToken,
        query: { limit: 50 },
      }).expect(200);
      expect(seenByPlain.body.data.some((e: { sensitive: boolean }) => e.sensitive)).toBe(false);
      expect(
        seenByPlain.body.data.some((e: { action: string }) => e.action === 'kyc.document_viewed'),
      ).toBe(false);
      await adminCall(t, 'get', '/audit-logs', {
        token: plain.accessToken,
        query: { sensitiveOnly: true },
      }).expect(403);

      const auditor = await staffSession(t, ['auditor']);
      const seenByAuditor = await adminCall(t, 'get', '/audit-logs', {
        token: auditor.accessToken,
        query: { sensitiveOnly: true },
      }).expect(200);
      expect(seenByAuditor.body.data.map((e: { action: string }) => e.action)).toContain(
        'kyc.document_viewed',
      );
      // Asking for "not only the sensitive ones" must not give the sensitive ones alone.
      const everything = await adminCall(t, 'get', '/audit-logs', {
        token: auditor.accessToken,
        query: { sensitiveOnly: false, limit: 50 },
      }).expect(200);
      expect(everything.body.data.some((e: { sensitive: boolean }) => !e.sensitive)).toBe(true);
      const entry = seenByAuditor.body.data.find(
        (e: { action: string }) => e.action === 'kyc.document_viewed',
      );
      await adminCall(t, 'get', `/audit-logs/${entry.id}`, { token: auditor.accessToken }).expect(
        200,
      );
      await adminCall(t, 'get', `/audit-logs/${entry.id}`, { token: plain.accessToken }).expect(
        404,
      );
    });

    it('writes the change and its record together or not at all', async () => {
      // A failing change (duplicate key) must leave no "created" record behind.
      const k = `atomic_${freshName('a').slice(-6)}`;
      const body = { key: k, name: 'Atomic', permissionKeys: ['users.read'] };
      await adminCall(t, 'post', '/roles', { token: boss.accessToken, body }).expect(201);
      await adminCall(t, 'post', '/roles', { token: boss.accessToken, body }).expect(409);
      const rows = await t.db.query(
        "SELECT 1 FROM audit_logs WHERE action = 'role.created' AND after->>'key' = $1",
        [k],
      );
      expect(rows.rowCount).toBe(1);
    });
  });

  describe('the role catalogue in the database', () => {
    it('mirrors the code at start-up', async () => {
      const perms = await t.db.query<{ n: string }>('SELECT count(*) AS n FROM permissions');
      expect(Number(perms.rows[0]?.n)).toBe(PERMISSIONS.length);
      for (const role of ROLES) {
        const row = await t.db.query<{ is_system: boolean; n: string }>(
          `SELECT r.is_system, count(rp.permission_id) AS n FROM roles r
             LEFT JOIN role_permissions rp ON rp.role_id = r.id WHERE r.key = $1 GROUP BY r.id`,
          [role.key],
        );
        expect(row.rows[0]?.is_system, role.key).toBe(true);
        expect(Number(row.rows[0]?.n), role.key).toBe(role.permissions.length);
      }
    });

    it('puts a built-in role back if someone edits it in SQL, and drops a permission the code no longer has', async () => {
      await t.db.query(
        "DELETE FROM role_permissions WHERE role_id = (SELECT id FROM roles WHERE key = 'auditor') AND permission_id = (SELECT id FROM permissions WHERE key = 'audit.read')",
      );
      await t.db.query(
        "INSERT INTO role_permissions (role_id, permission_id) SELECT (SELECT id FROM roles WHERE key = 'auditor'), id FROM permissions WHERE key = 'payout.approve'",
      );
      await t.db.query("UPDATE roles SET name = 'Hacked' WHERE key = 'auditor'");
      await t.db.query(
        "INSERT INTO permissions (id, key, module) VALUES (gen_random_uuid(), 'fake.permission', 'fake')",
      );
      // A custom role is none of the sync's business.
      const k = `keep_${freshName('k').slice(-6)}`;
      await adminCall(t, 'post', '/roles', {
        token: boss.accessToken,
        body: { key: k, name: 'Keep me', permissionKeys: ['users.read'] },
      }).expect(201);

      await t.app.get(RbacSyncService, { strict: false }).sync();

      const auditor = await t.db.query<{ name: string; keys: string[] }>(
        `SELECT r.name, array_agg(p.key ORDER BY p.key) AS keys FROM roles r
           JOIN role_permissions rp ON rp.role_id = r.id JOIN permissions p ON p.id = rp.permission_id
          WHERE r.key = 'auditor' GROUP BY r.id`,
      );
      expect(auditor.rows[0]?.name).toBe('Auditor');
      expect(auditor.rows[0]?.keys).toContain('audit.read');
      expect(auditor.rows[0]?.keys).not.toContain('payout.approve');
      expect(
        (await t.db.query("SELECT 1 FROM permissions WHERE key = 'fake.permission'")).rowCount,
      ).toBe(0);
      expect((await t.db.query('SELECT 1 FROM roles WHERE key = $1', [k])).rowCount).toBe(1);
    });

    it('is safe to run many times at once', async () => {
      const sync = t.app.get(RbacSyncService, { strict: false });
      await Promise.all([sync.sync(), sync.sync(), sync.sync()]);
      const perms = await t.db.query<{ n: string }>('SELECT count(*) AS n FROM permissions');
      expect(Number(perms.rows[0]?.n)).toBe(PERMISSIONS.length);
      const roles = await t.db.query<{ n: string }>(
        'SELECT count(*) AS n FROM roles WHERE is_system',
      );
      expect(Number(roles.rows[0]?.n)).toBe(ROLES.length);
    });
  });

  describe('route coverage', () => {
    interface RouteInfo {
      controller: string;
      handler: string;
      path: string;
      admin: boolean;
      isPublic: boolean;
      permissions: string[] | undefined;
      anyAdmin: boolean;
      enrol: boolean;
    }

    function routes(): RouteInfo[] {
      const out: RouteInfo[] = [];
      const container = t.app.get(ModulesContainer);
      for (const mod of container.values()) {
        for (const wrapper of mod.controllers.values()) {
          const cls = wrapper.metatype as (new (...a: never[]) => unknown) | null;
          if (!cls) continue;
          const base = String(Reflect.getMetadata('path', cls) ?? '');
          for (const name of Object.getOwnPropertyNames(cls.prototype)) {
            // The class's own constructor carries the controller's path metadata; it is not a route.
            if (name === 'constructor') continue;
            const fn = (cls.prototype as Record<string, unknown>)[name];
            if (typeof fn !== 'function' || Reflect.getMetadata('path', fn) === undefined) continue;
            const meta = <T>(key: string): T | undefined =>
              Reflect.getMetadata(key, fn) ?? Reflect.getMetadata(key, cls);
            out.push({
              controller: cls.name,
              handler: name,
              path: `${base}/${String(Reflect.getMetadata('path', fn))}`,
              admin: !!meta<boolean>(IS_ADMIN_ROUTE),
              isPublic: !!meta<boolean>(IS_PUBLIC),
              permissions: meta<string[]>(PERMISSIONS_KEY),
              anyAdmin: !!meta<boolean>(ANY_ADMIN),
              enrol: !!meta<boolean>(ALLOW_ENROL_SCOPE),
            });
          }
        }
      }
      return out;
    }

    it('finds the routes it is meant to check', () => {
      const all = routes();
      expect(all.length).toBeGreaterThan(60);
      // 6 sign-in steps + 10 staff + 6 roles + 2 audit, and more as modules arrive.
      expect(all.filter((r) => r.admin).length).toBeGreaterThanOrEqual(24);
    });

    it('has no route under /admin that forgot to say it is a staff route', () => {
      for (const r of routes().filter((x) => x.path.startsWith('admin'))) {
        expect(r.admin || r.isPublic, `${r.controller}.${r.handler} (${r.path})`).toBe(true);
      }
    });

    it('declares a permission, or says why not, on every staff route', () => {
      for (const r of routes().filter((x) => x.admin && !x.isPublic)) {
        const declared = (r.permissions?.length ?? 0) > 0 || r.anyAdmin || r.enrol;
        expect(
          declared,
          `${r.controller}.${r.handler} (${r.path}) has no @RequirePermissions`,
        ).toBe(true);
      }
    });

    it('only names permissions that exist', () => {
      const known = new Set<string>(PERMISSIONS.map((p) => p.key));
      for (const r of routes()) {
        for (const p of r.permissions ?? [])
          expect(known.has(p), `${r.controller}.${r.handler}: ${p}`).toBe(true);
      }
    });

    it('lets only the enrolment steps be used before set-up is finished', () => {
      const enrol = routes()
        .filter((r) => r.enrol)
        .map((r) => `${r.controller}.${r.handler}`)
        .sort();
      expect(enrol).toEqual(
        [
          'AdminAuthController.changePassword',
          'AdminAuthController.confirmTwoFactor',
          'AdminAuthController.logout',
          'AdminAuthController.me',
          'AdminAuthController.setupTwoFactor',
          'AdminAuthController.verify',
        ].sort(),
      );
    });

    it('keeps the list of public routes short and known', () => {
      const publicRoutes = routes()
        .filter((r) => r.isPublic)
        .map((r) => `${r.path}`)
        .sort();
      // Every unauthenticated entry point of the API, on one screen. Adding one should be a conscious act.
      expect(publicRoutes).toEqual(
        expect.arrayContaining([
          'admin/auth/login',
          'admin/auth/refresh',
          'auth/register',
          'auth/login',
          'auth/refresh',
          'auth/password/forgot',
          'auth/password/verify',
          'auth/password/reset',
          'auth/password-policy',
          'auth/verify-contact',
          'auth/resend',
          'auth/login/verify',
        ]),
      );
      // Media links are public on purpose: the signed, expiring token in the address is the
      // permission (and only processed files can be reached; see the media delivery tests).
      const mediaLinks = [
        'media/f/*path',
        'media/local-download/:token',
        'media/local-upload/:token',
      ];
      expect(publicRoutes.filter((p) => p.startsWith('media/'))).toEqual(mediaLinks);
      const notExpected = publicRoutes.filter(
        (p) =>
          !/^(admin\/auth\/(login|refresh)|auth\/|health|dev\/outbox)/.test(p) &&
          !mediaLinks.includes(p),
      );
      expect(notExpected).toEqual([]);
    });
  });
});
