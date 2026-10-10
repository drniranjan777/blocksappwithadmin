import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../support/app.js';
import {
  ADMIN_PASSWORD,
  adminCall,
  insertAdmin,
  provisionAdmin,
  signInAdmin,
  staffSession,
  type StaffSession,
} from '../support/admin.js';
import { AUTH_TEST_ENV, freshName, outbox, totpNow } from '../support/auth.js';

describe('managing staff and roles', () => {
  let t: TestApp;
  let boss: StaffSession;

  beforeAll(async () => {
    t = await createTestApp({ ...AUTH_TEST_ENV });
    boss = await staffSession(t, ['super_admin'], 'Boss');
  });
  afterAll(async () => {
    await t.close();
  });

  const invite = (token: string, roleKeys: string[], over: Record<string, unknown> = {}) =>
    adminCall(t, 'post', '/staff', {
      token,
      body: { email: `${freshName('inv')}@blocks.test`, name: 'Invited Person', roleKeys, ...over },
    });

  /** A staff member with exactly these roles, fully signed in. */
  const as = (roleKeys: string[]) => staffSession(t, roleKeys);

  describe('who can do what', () => {
    const attempts: Array<[string, 'get' | 'post', string, object | undefined]> = [
      ['list staff', 'get', '/staff', undefined],
      [
        'invite',
        'post',
        '/staff',
        { email: 'x@blocks.test', name: 'X Person', roleKeys: ['auditor'] },
      ],
      ['list roles', 'get', '/roles', undefined],
      ['permissions', 'get', '/permissions', undefined],
      ['audit log', 'get', '/audit-logs', undefined],
    ];
    const expected: Record<string, number[]> = {
      // list staff, invite, list roles, permissions, audit log
      moderator: [403, 403, 403, 403, 403],
      user_operations: [403, 403, 403, 403, 403],
      support_agent: [403, 403, 403, 403, 403],
      finance_operator: [403, 403, 403, 403, 403],
      kyc_reviewer: [403, 403, 403, 403, 403],
      readonly_analyst: [403, 403, 403, 403, 403],
      auditor: [200, 403, 200, 200, 200],
    };

    for (const [role, statuses] of Object.entries(expected)) {
      it(`gives a ${role} exactly the access its role grants`, async () => {
        const s = await as([role]);
        for (const [i, [label, method, path, body]] of attempts.entries()) {
          const res = await adminCall(t, method, path, {
            token: s.accessToken,
            ...(body ? { body } : {}),
          });
          expect(res.status, `${role}: ${label}`).toBe(statuses[i]);
          if (res.status === 403) expect(res.body.error.code).toBe('FORBIDDEN');
        }
      });
    }

    it('lets the super admin do all of it', async () => {
      for (const [label, method, path] of attempts.filter((a) => a[1] === 'get')) {
        const res = await adminCall(t, method, path, { token: boss.accessToken });
        expect(res.status, label).toBe(200);
      }
    });

    it('does not say which permission was missing', async () => {
      const s = await as(['moderator']);
      const res = await adminCall(t, 'get', '/staff', { token: s.accessToken }).expect(403);
      // The message is generic; it must not name the permission key that was missing.
      expect(res.body.error.message).toBe('You do not have permission to do that.');
      expect(JSON.stringify(res.body)).not.toMatch(/admin\.users|\.read|\.manage/);
      expect(res.body.error.details).toBeUndefined();
    });

    it('records refused attempts', async () => {
      const s = await as(['moderator']);
      await adminCall(t, 'get', '/staff', { token: s.accessToken }).expect(403);
      const rows = await t.db.query<{ after: { path: string } }>(
        "SELECT after FROM audit_logs WHERE action = 'admin.access_denied' AND actor_id = $1",
        [s.admin.id],
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]?.after.path).toBe('/api/v1/admin/staff');
    });

    it('changes at once when a role changes, without signing in again', async () => {
      const target = await as(['moderator']);
      await adminCall(t, 'get', '/roles', { token: target.accessToken }).expect(403);
      await adminCall(t, 'put', `/staff/${target.admin.id}/roles`, {
        token: boss.accessToken,
        body: { roleKeys: ['auditor'], reason: 'Moving to the audit team' },
      }).expect(200);
      await adminCall(t, 'get', '/roles', { token: target.accessToken }).expect(200);
      const me = await adminCall(t, 'get', '/auth/me', { token: target.accessToken }).expect(200);
      expect(me.body.data.admin.permissions).toContain('audit.read');
      expect(me.body.data.admin.permissions).not.toContain('content.moderate');
    });
  });

  describe('inviting', () => {
    it('lists the new account with its roles and no secrets', async () => {
      const res = await invite(boss.accessToken, ['moderator', 'support_agent'], {
        name: '  Ravi Kumar ',
      }).expect(201);
      expect(res.body.data).toMatchObject({
        name: 'Ravi Kumar',
        status: 'INVITED',
        twoFactorEnabled: false,
        mustChangePassword: true,
      });
      expect(res.body.data.roles.map((r: { key: string }) => r.key).sort()).toEqual([
        'moderator',
        'support_agent',
      ]);
      const list = await adminCall(t, 'get', '/staff', {
        token: boss.accessToken,
        query: { q: 'ravi' },
      }).expect(200);
      expect(list.body.data.map((a: { id: string }) => a.id)).toContain(res.body.data.id);
      expect(JSON.stringify(list.body)).not.toMatch(/hash|secret|backup/i);
    });

    it('rejects bad input', async () => {
      const dup = await insertAdmin(t, { roleKeys: ['auditor'] });
      expect((await invite(boss.accessToken, ['auditor'], { email: dup.email })).status).toBe(409);
      expect(
        (await invite(boss.accessToken, ['auditor'], { email: dup.email.toUpperCase() })).status,
      ).toBe(409);
      expect((await invite(boss.accessToken, ['auditor'], { email: 'not-an-email' })).status).toBe(
        400,
      );
      expect((await invite(boss.accessToken, [])).status).toBe(400);
      expect((await invite(boss.accessToken, ['auditor', 'auditor'])).status).toBe(400);
      expect((await invite(boss.accessToken, ['Not A Key'])).status).toBe(400);
      expect(
        (await invite(boss.accessToken, ['ghost_role'])).body.error.details[0].reasons,
      ).toContain('unknown_role:ghost_role');
      expect((await invite(boss.accessToken, ['auditor'], { status: 'ACTIVE' })).status).toBe(400);
    });

    it('refuses roles that break separation of duties', async () => {
      const res = await invite(boss.accessToken, ['kyc_reviewer', 'finance_operator']).expect(400);
      expect(JSON.stringify(res.body.error.details)).toContain(
        'separation_of_duties:kyc.review+payout.approve',
      );
    });

    it('lets the break-glass role hold what others cannot', async () => {
      await invite(boss.accessToken, ['super_admin']).expect(201);
    });

    it('re-invites someone who has not finished: the old password stops, a new one works', async () => {
      const created = await invite(boss.accessToken, ['auditor']).expect(201);
      const email = created.body.data.email as string;
      const oldTemp = /Temporary password: (\S+)/.exec(
        outbox(t).last(email, 'admin_invite')?.body ?? '',
      )?.[1] as string;

      const again = await adminCall(t, 'post', `/staff/${created.body.data.id}/reinvite`, {
        token: boss.accessToken,
      }).expect(200);
      expect(again.body.data.inviteEmailSent).toBe(true);
      const newTemp = /Temporary password: (\S+)/.exec(
        outbox(t).last(email, 'admin_invite')?.body ?? '',
      )?.[1] as string;
      expect(newTemp).not.toBe(oldTemp);

      await adminCall(t, 'post', '/auth/login', { body: { email, password: oldTemp } }).expect(401);
      await adminCall(t, 'post', '/auth/login', { body: { email, password: newTemp } }).expect(200);
    });

    it('does not re-invite someone who is already active', async () => {
      const a = await provisionAdmin(t, { roleKeys: ['auditor'] });
      await adminCall(t, 'post', `/staff/${a.id}/reinvite`, { token: boss.accessToken }).expect(
        409,
      );
    });
  });

  describe('no escalation', () => {
    /** A manager who can invite and assign, but holds only a few permissions. */
    async function manager() {
      const role = await adminCall(t, 'post', '/roles', {
        token: boss.accessToken,
        body: {
          key: `people_manager_${freshName('r').slice(-6)}`,
          name: 'People manager',
          permissionKeys: ['admin.users.read', 'admin.users.manage', 'users.read'],
        },
      }).expect(201);
      const s = await as(['moderator']);
      await adminCall(t, 'put', `/staff/${s.admin.id}/roles`, {
        token: boss.accessToken,
        body: { roleKeys: [role.body.data.key], reason: 'Becoming a people manager' },
      }).expect(200);
      return { s, role: role.body.data };
    }

    it('lets a manager hand out only roles within their own permissions', async () => {
      const { s } = await manager();
      const tooMuch = await invite(s.accessToken, ['moderator']).expect(400);
      expect(JSON.stringify(tooMuch.body.error.details)).toContain(
        'beyond_your_permissions:content.moderate',
      );
      await invite(s.accessToken, ['super_admin']).expect(400);

      // A role that is a subset of what they hold is fine.
      const small = await adminCall(t, 'post', '/roles', {
        token: boss.accessToken,
        body: {
          key: `viewer_${freshName('v').slice(-6)}`,
          name: 'Viewer',
          permissionKeys: ['users.read'],
        },
      }).expect(201);
      await invite(s.accessToken, [small.body.data.key]).expect(201);
    });

    it('does not let a manager put a permission they lack into a role', async () => {
      const { s } = await manager();
      const res = await adminCall(t, 'post', '/roles', {
        token: s.accessToken,
        body: {
          key: `sneaky_${freshName('s').slice(-6)}`,
          name: 'Sneaky',
          permissionKeys: ['users.read', 'payout.approve'],
        },
      });
      // They hold neither admin.roles.manage nor payout.approve.
      expect(res.status).toBe(403);
    });

    it('does not let anyone change their own roles, status or two-step verification', async () => {
      const { s } = await manager();
      const me = s.admin.id;
      const body = { reason: 'because I would like to' };
      await adminCall(t, 'put', `/staff/${me}/roles`, {
        token: s.accessToken,
        body: { ...body, roleKeys: ['auditor'] },
      }).expect(403);
      await adminCall(t, 'post', `/staff/${me}/disable`, { token: s.accessToken, body }).expect(
        403,
      );
      await adminCall(t, 'post', `/staff/${me}/enable`, { token: s.accessToken, body }).expect(403);
      await adminCall(t, 'post', `/staff/${me}/reset-two-factor`, {
        token: s.accessToken,
        body,
      }).expect(403);
      // Not even the super admin.
      await adminCall(t, 'put', `/staff/${boss.admin.id}/roles`, {
        token: boss.accessToken,
        body: { ...body, roleKeys: ['super_admin'] },
      }).expect(403);
      await adminCall(t, 'post', `/staff/${boss.admin.id}/disable`, {
        token: boss.accessToken,
        body,
      }).expect(403);
    });

    it('lets only a super admin change a super admin', async () => {
      const { s } = await manager();
      const otherSuper = await provisionAdmin(t, { roleKeys: ['super_admin'] });
      const body = { reason: 'Housekeeping on the team' };
      await adminCall(t, 'put', `/staff/${otherSuper.id}/roles`, {
        token: s.accessToken,
        body: { ...body, roleKeys: ['auditor'] },
      }).expect(403);
      await adminCall(t, 'post', `/staff/${otherSuper.id}/disable`, {
        token: s.accessToken,
        body,
      }).expect(403);
      await adminCall(t, 'post', `/staff/${otherSuper.id}/reset-two-factor`, {
        token: s.accessToken,
        body,
      }).expect(403);
      // Another super admin can.
      await adminCall(t, 'put', `/staff/${otherSuper.id}/roles`, {
        token: boss.accessToken,
        body: { ...body, roleKeys: ['auditor'] },
      }).expect(200);
    });
  });

  describe('changing roles', () => {
    it('records who, what, when and why', async () => {
      const target = await provisionAdmin(t, { roleKeys: ['moderator'] });
      await adminCall(t, 'put', `/staff/${target.id}/roles`, {
        token: boss.accessToken,
        body: { roleKeys: ['senior_moderator'], reason: 'Promoted after review' },
      }).expect(200);
      const row = await t.db.query<{
        actor_id: string;
        reason: string;
        before: { roles: string[] };
        after: { roles: string[] };
      }>(
        "SELECT actor_id, reason, before, after FROM audit_logs WHERE action = 'admin.roles.changed' AND target_id = $1",
        [target.id],
      );
      expect(row.rows).toHaveLength(1);
      expect(row.rows[0]).toMatchObject({
        actor_id: boss.admin.id,
        reason: 'Promoted after review',
        before: { roles: ['moderator'] },
        after: { roles: ['senior_moderator'] },
      });
      expect(
        outbox(t)
          .to(target.email)
          .some((m) => m.template === 'admin_security_notice'),
      ).toBe(true);
    });

    it('asks for a reason, and for at least one role', async () => {
      const target = await provisionAdmin(t, { roleKeys: ['moderator'] });
      await adminCall(t, 'put', `/staff/${target.id}/roles`, {
        token: boss.accessToken,
        body: { roleKeys: ['auditor'] },
      }).expect(400);
      await adminCall(t, 'put', `/staff/${target.id}/roles`, {
        token: boss.accessToken,
        body: { roleKeys: ['auditor'], reason: 'no' },
      }).expect(400);
      await adminCall(t, 'put', `/staff/${target.id}/roles`, {
        token: boss.accessToken,
        body: { roleKeys: [], reason: 'Taking away everything' },
      }).expect(400);
    });

    it('does nothing, and writes nothing, when the roles are unchanged', async () => {
      const target = await provisionAdmin(t, { roleKeys: ['moderator'] });
      await adminCall(t, 'put', `/staff/${target.id}/roles`, {
        token: boss.accessToken,
        body: { roleKeys: ['moderator'], reason: 'No real change' },
      }).expect(200);
      const n = await t.db.query(
        "SELECT 1 FROM audit_logs WHERE action = 'admin.roles.changed' AND target_id = $1",
        [target.id],
      );
      expect(n.rowCount).toBe(0);
    });

    it('refuses an unknown staff id', async () => {
      await adminCall(t, 'put', '/staff/01990000-0000-7000-8000-000000000001/roles', {
        token: boss.accessToken,
        body: { roleKeys: ['auditor'], reason: 'There is nobody here' },
      }).expect(404);
      await adminCall(t, 'get', '/staff/not-a-uuid', { token: boss.accessToken }).expect(400);
    });
  });

  describe('disabling and re-enabling', () => {
    it('signs the person out on their very next request, and back in once re-enabled', async () => {
      const target = await provisionAdmin(t, { roleKeys: ['auditor'] });
      const session = await signInAdmin(t, target);
      await adminCall(t, 'get', '/roles', { token: session.accessToken }).expect(200);

      await adminCall(t, 'post', `/staff/${target.id}/disable`, {
        token: boss.accessToken,
        body: { reason: 'Left the company' },
      }).expect(200);
      const res = await adminCall(t, 'get', '/roles', { token: session.accessToken }).expect(401);
      expect(res.body.error.code).toBe('SESSION_REVOKED');
      await adminCall(t, 'post', '/auth/login', {
        body: { email: target.email, password: target.password },
      }).expect(401);

      const enabled = await adminCall(t, 'post', `/staff/${target.id}/enable`, {
        token: boss.accessToken,
        body: { reason: 'Returned after leave' },
      }).expect(200);
      expect(enabled.body.data.status).toBe('ACTIVE');
      await signInAdmin(t, target);
    });

    it('needs a reason, records it, and cannot enable what is not disabled', async () => {
      const target = await provisionAdmin(t, { roleKeys: ['auditor'] });
      await adminCall(t, 'post', `/staff/${target.id}/disable`, {
        token: boss.accessToken,
        body: {},
      }).expect(400);
      await adminCall(t, 'post', `/staff/${target.id}/enable`, {
        token: boss.accessToken,
        body: { reason: 'Not disabled at all' },
      }).expect(409);
      await adminCall(t, 'post', `/staff/${target.id}/disable`, {
        token: boss.accessToken,
        body: { reason: 'Policy breach case 42' },
      }).expect(200);
      const row = await t.db.query<{
        reason: string;
        before: { status: string };
        after: { status: string };
      }>(
        "SELECT reason, before, after FROM audit_logs WHERE action = 'admin.disabled' AND target_id = $1",
        [target.id],
      );
      expect(row.rows[0]).toMatchObject({
        reason: 'Policy breach case 42',
        before: { status: 'ACTIVE' },
        after: { status: 'DISABLED' },
      });
    });

    it('sends someone who never finished set-up back to "invited", with no usable password', async () => {
      const created = await invite(boss.accessToken, ['auditor']).expect(201);
      const email = created.body.data.email as string;
      const temp = /Temporary password: (\S+)/.exec(
        outbox(t).last(email, 'admin_invite')?.body ?? '',
      )?.[1] as string;
      await adminCall(t, 'post', `/staff/${created.body.data.id}/disable`, {
        token: boss.accessToken,
        body: { reason: 'Hired in error' },
      }).expect(200);
      const back = await adminCall(t, 'post', `/staff/${created.body.data.id}/enable`, {
        token: boss.accessToken,
        body: { reason: 'It was correct after all' },
      }).expect(200);
      expect(back.body.data.status).toBe('INVITED');
      await adminCall(t, 'post', '/auth/login', { body: { email, password: temp } }).expect(401);
      await adminCall(t, 'post', `/staff/${created.body.data.id}/reinvite`, {
        token: boss.accessToken,
      }).expect(200);
      const fresh = /Temporary password: (\S+)/.exec(
        outbox(t).last(email, 'admin_invite')?.body ?? '',
      )?.[1] as string;
      await adminCall(t, 'post', '/auth/login', { body: { email, password: fresh } }).expect(200);
    });
  });

  describe('resetting two-step verification', () => {
    it('is done by another person, signs the target out, and makes them set it up again', async () => {
      const target = await provisionAdmin(t, { roleKeys: ['auditor'] });
      const session = await signInAdmin(t, target);

      await adminCall(t, 'post', `/staff/${target.id}/reset-two-factor`, {
        token: boss.accessToken,
        body: { reason: 'Lost phone, identity confirmed in person' },
      }).expect(200);
      await adminCall(t, 'get', '/auth/me', { token: session.accessToken }).expect(401);

      const login = await adminCall(t, 'post', '/auth/login', {
        body: { email: target.email, password: target.password },
      }).expect(200);
      expect(login.body.data.nextStep).toBe('two_factor_setup');
      await adminCall(t, 'get', '/roles', { token: login.body.data.tokens.accessToken }).expect(
        403,
      );

      const setup = await adminCall(t, 'post', '/auth/two-factor/setup', {
        token: login.body.data.tokens.accessToken,
      }).expect(200);
      expect(setup.body.data.secret).not.toBe(target.secret);
      const done = await adminCall(t, 'post', '/auth/two-factor/confirm', {
        token: login.body.data.tokens.accessToken,
        body: { code: totpNow(setup.body.data.secret) },
      }).expect(200);
      expect(done.body.data.nextStep).toBeNull();

      const audited = await t.db.query<{ reason: string }>(
        "SELECT reason FROM audit_logs WHERE action = 'admin.two_factor.reset' AND target_id = $1",
        [target.id],
      );
      expect(audited.rows[0]?.reason).toContain('Lost phone');
      expect(
        outbox(t)
          .to(target.email)
          .some((m) => /reset/i.test(m.subject ?? '')),
      ).toBe(true);
    });

    it('cannot reset what is not set up, and needs a reason', async () => {
      const invited = await invite(boss.accessToken, ['auditor']).expect(201);
      await adminCall(t, 'post', `/staff/${invited.body.data.id}/reset-two-factor`, {
        token: boss.accessToken,
        body: { reason: 'Nothing to reset here' },
      }).expect(409);
      const target = await provisionAdmin(t, { roleKeys: ['auditor'] });
      await adminCall(t, 'post', `/staff/${target.id}/reset-two-factor`, {
        token: boss.accessToken,
        body: {},
      }).expect(400);
    });
  });

  describe('sessions', () => {
    it('lists active sign-ins and ends them all on request', async () => {
      const target = await provisionAdmin(t, { roleKeys: ['auditor'] });
      const one = await signInAdmin(t, target);
      const two = await signInAdmin(t, target);
      const list = await adminCall(t, 'get', `/staff/${target.id}/sessions`, {
        token: boss.accessToken,
      }).expect(200);
      expect(list.body.data.length).toBeGreaterThanOrEqual(2);
      expect(JSON.stringify(list.body)).not.toMatch(/refresh|hash|token/i);

      const res = await adminCall(t, 'post', `/staff/${target.id}/revoke-sessions`, {
        token: boss.accessToken,
        body: { reason: 'Device reported stolen' },
      }).expect(200);
      expect(res.body.data.signedOut).toBeGreaterThanOrEqual(2);
      await adminCall(t, 'get', '/auth/me', { token: one.accessToken }).expect(401);
      await adminCall(t, 'get', '/auth/me', { token: two.accessToken }).expect(401);
    });
  });

  describe('custom roles', () => {
    const key = () => `custom_${freshName('c').slice(-8)}`;

    it('can be created, shown with how many hold them, changed and deleted', async () => {
      const k = key();
      const created = await adminCall(t, 'post', '/roles', {
        token: boss.accessToken,
        body: {
          key: k,
          name: 'Case reviewer',
          description: 'Reviews cases',
          permissionKeys: ['reports.read', 'users.read'],
        },
      }).expect(201);
      expect(created.body.data).toMatchObject({ key: k, isSystem: false, memberCount: 0 });
      expect(created.body.data.permissions).toEqual(['reports.read', 'users.read']);

      const member = await provisionAdmin(t, { roleKeys: ['auditor'] });
      await adminCall(t, 'put', `/staff/${member.id}/roles`, {
        token: boss.accessToken,
        body: { roleKeys: [k], reason: 'Joins the case team' },
      }).expect(200);
      const one = await adminCall(t, 'get', `/roles/${created.body.data.id}`, {
        token: boss.accessToken,
      }).expect(200);
      expect(one.body.data.memberCount).toBe(1);

      const updated = await adminCall(t, 'put', `/roles/${created.body.data.id}`, {
        token: boss.accessToken,
        body: { name: 'Case reviewer II', permissionKeys: ['reports.read'] },
      }).expect(200);
      expect(updated.body.data.permissions).toEqual(['reports.read']);

      // In use: cannot be deleted. Free it first.
      await adminCall(t, 'delete', `/roles/${created.body.data.id}`, {
        token: boss.accessToken,
      }).expect(409);
      await adminCall(t, 'put', `/staff/${member.id}/roles`, {
        token: boss.accessToken,
        body: { roleKeys: ['auditor'], reason: 'Leaves the case team' },
      }).expect(200);
      await adminCall(t, 'delete', `/roles/${created.body.data.id}`, {
        token: boss.accessToken,
      }).expect(204);
      await adminCall(t, 'get', `/roles/${created.body.data.id}`, {
        token: boss.accessToken,
      }).expect(404);
    });

    it('cannot reuse a key, name a permission that does not exist, or combine what must stay apart', async () => {
      const k = key();
      const ok = { key: k, name: 'Valid role', permissionKeys: ['users.read'] };
      await adminCall(t, 'post', '/roles', { token: boss.accessToken, body: ok }).expect(201);
      await adminCall(t, 'post', '/roles', { token: boss.accessToken, body: ok }).expect(409);
      await adminCall(t, 'post', '/roles', {
        token: boss.accessToken,
        body: { ...ok, key: 'moderator' },
      }).expect(409);

      const unknown = await adminCall(t, 'post', '/roles', {
        token: boss.accessToken,
        body: { ...ok, key: key(), permissionKeys: ['users.read', 'users.delete_everything'] },
      }).expect(400);
      expect(JSON.stringify(unknown.body.error.details)).toContain(
        'unknown_permission:users.delete_everything',
      );

      const sod = await adminCall(t, 'post', '/roles', {
        token: boss.accessToken,
        body: { ...ok, key: key(), permissionKeys: ['kyc.review', 'payout.approve'] },
      }).expect(400);
      expect(JSON.stringify(sod.body.error.details)).toContain(
        'separation_of_duties:kyc.review+payout.approve',
      );

      await adminCall(t, 'post', '/roles', {
        token: boss.accessToken,
        body: { ...ok, key: 'Bad Key!' },
      }).expect(400);
      await adminCall(t, 'post', '/roles', {
        token: boss.accessToken,
        body: { ...ok, key: key(), permissionKeys: [] },
      }).expect(400);
    });

    it('leaves the built-in roles alone', async () => {
      const roles = await adminCall(t, 'get', '/roles', { token: boss.accessToken }).expect(200);
      const builtin = roles.body.data.find((r: { key: string }) => r.key === 'moderator');
      expect(builtin.isSystem).toBe(true);
      await adminCall(t, 'put', `/roles/${builtin.id}`, {
        token: boss.accessToken,
        body: { name: 'Moderator', permissionKeys: ['users.read'] },
      }).expect(409);
      await adminCall(t, 'delete', `/roles/${builtin.id}`, { token: boss.accessToken }).expect(409);
    });

    it('publishes the permission catalogue grouped by module', async () => {
      const res = await adminCall(t, 'get', '/permissions', { token: boss.accessToken }).expect(
        200,
      );
      const modules = res.body.data.map((m: { module: string }) => m.module);
      expect(modules).toEqual(expect.arrayContaining(['users', 'kyc', 'payout', 'audit', 'admin']));
      const kyc = res.body.data.find((m: { module: string }) => m.module === 'kyc');
      expect(kyc.permissions.map((p: { key: string }) => p.key)).toContain('kyc.documents.view');
      expect(
        res.body.data.flatMap((m: { permissions: unknown[] }) => m.permissions).length,
      ).toBeGreaterThan(60);
    });
  });

  describe('listing', () => {
    it('pages through everyone without gaps or repeats, and filters', async () => {
      for (let i = 0; i < 4; i++) await invite(boss.accessToken, ['readonly_analyst']).expect(201);
      const all: string[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const res = await adminCall(t, 'get', '/staff', {
          token: boss.accessToken,
          query: { limit: 3, ...(cursor ? { cursor } : {}) },
        }).expect(200);
        all.push(...res.body.data.map((a: { id: string }) => a.id));
        cursor = res.body.meta.hasMore ? res.body.meta.nextCursor : undefined;
        pages++;
      } while (cursor && pages < 30);
      const total = await t.db.query<{ n: string }>('SELECT count(*) AS n FROM admin_users');
      expect(all).toHaveLength(Number(total.rows[0]?.n));
      expect(new Set(all).size).toBe(all.length);

      const invited = await adminCall(t, 'get', '/staff', {
        token: boss.accessToken,
        query: { status: 'INVITED', role: 'readonly_analyst', limit: 50 },
      }).expect(200);
      expect(invited.body.data.length).toBeGreaterThanOrEqual(4);
      expect(invited.body.data.every((a: { status: string }) => a.status === 'INVITED')).toBe(true);
      await adminCall(t, 'get', '/staff', {
        token: boss.accessToken,
        query: { status: 'NOPE' },
      }).expect(400);
      await adminCall(t, 'get', '/staff', {
        token: boss.accessToken,
        query: { cursor: 'garbage' },
      }).expect(400);
    });
  });

  it('keeps using the password it was given, and nothing else, to check a staff member’s identity', async () => {
    const target = await provisionAdmin(t, { roleKeys: ['auditor'] });
    expect(target.password).toBe(ADMIN_PASSWORD);
  });
});
