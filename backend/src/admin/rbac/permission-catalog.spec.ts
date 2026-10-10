import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSION_KEYS,
  PERMISSIONS,
  ROLES,
  isPermissionKey,
  permissionsForRoles,
  roleByKey,
} from './permission-catalog.js';

describe('permission catalogue', () => {
  it('has unique keys written as module.action', () => {
    const keys = PERMISSIONS.map((x) => x.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z]+(\.[a-z_]+)+$/);
  });

  it('derives the module from the key', () => {
    expect(PERMISSIONS.find((x) => x.key === 'payout.approve')?.module).toBe('payout');
    expect(PERMISSIONS.find((x) => x.key === 'users.sessions.revoke')?.module).toBe('users');
  });

  it('only recognises keys it defines', () => {
    expect(isPermissionKey('users.read')).toBe(true);
    expect(isPermissionKey('users.delete_everything')).toBe(false);
    expect(isPermissionKey('')).toBe(false);
  });
});

describe('roles', () => {
  it('grant only permissions that exist', () => {
    for (const role of ROLES) {
      for (const permission of role.permissions) {
        expect(isPermissionKey(permission), `${role.key} -> ${permission}`).toBe(true);
      }
    }
  });

  it('are unique and include the eleven the product defines', () => {
    expect(new Set(ROLES.map((r) => r.key)).size).toBe(ROLES.length);
    expect(ROLES.map((r) => r.key).sort()).toEqual(
      [
        'auditor',
        'business_operations',
        'creator_operations',
        'finance_operator',
        'kyc_reviewer',
        'moderator',
        'readonly_analyst',
        'senior_moderator',
        'super_admin',
        'support_agent',
        'user_operations',
      ].sort(),
    );
  });

  it('give the super admin everything, and nobody else everything', () => {
    expect(roleByKey('super_admin')?.permissions.length).toBe(ALL_PERMISSION_KEYS.length);
    for (const role of ROLES.filter((r) => r.key !== 'super_admin')) {
      expect(role.permissions.length, role.key).toBeLessThan(ALL_PERMISSION_KEYS.length);
    }
  });

  describe('separation of duties', () => {
    const can = (role: string, permission: string): boolean =>
      permissionsForRoles([role]).has(permission as never);

    it('keeps identity review apart from paying out', () => {
      expect(can('kyc_reviewer', 'kyc.review')).toBe(true);
      for (const p of ['payout.approve', 'payout.reject', 'payout.hold', 'earnings.adjust']) {
        expect(can('kyc_reviewer', p), p).toBe(false);
      }
      // ...and the payout operator cannot clear the identity checks.
      expect(can('finance_operator', 'payout.approve')).toBe(true);
      for (const p of ['kyc.review', 'kyc.documents.view', 'bank.review']) {
        expect(can('finance_operator', p), p).toBe(false);
      }
    });

    it('lets nobody but the super admin both draft and activate a Reach configuration', () => {
      for (const role of ROLES) {
        const both = can(role.key, 'reach.config.update') && can(role.key, 'reach.config.activate');
        expect(both, role.key).toBe(role.key === 'super_admin');
      }
    });

    it('keeps raw identity documents and licence documents to the roles that need them', () => {
      const withDocs = ROLES.filter((r) => can(r.key, 'kyc.documents.view')).map((r) => r.key);
      expect(withDocs.sort()).toEqual(['kyc_reviewer', 'super_admin']);
      const withLicences = ROLES.filter((r) => can(r.key, 'music.licences.read')).map((r) => r.key);
      expect(withLicences).toEqual(['super_admin']);
    });

    it('keeps full contact details to as few roles as possible', () => {
      const withContact = ROLES.filter((r) => can(r.key, 'users.read_contact')).map((r) => r.key);
      expect(withContact).toEqual(['super_admin']);
    });

    it('never lets a read-only role change anything', () => {
      const writes =
        /\.(update|manage|moderate|restore|suspend|restrict|approve|reject|hold|retry|review|resolve|decide|terminate|adjust|activate|write|send|delete|assign|escalate|verify|revoke|label)$/;
      for (const role of ['auditor', 'readonly_analyst']) {
        for (const permission of roleByKey(role)?.permissions ?? []) {
          expect(permission, role).not.toMatch(writes);
        }
      }
    });

    it('does not let support or moderators see money', () => {
      for (const role of ['support_agent', 'moderator', 'senior_moderator', 'user_operations']) {
        for (const permission of ['payout.read', 'ledger.read', 'bank.read', 'kyc.read']) {
          expect(can(role, permission), `${role} ${permission}`).toBe(false);
        }
      }
    });
  });

  it('combines the permissions of several roles', () => {
    const merged = permissionsForRoles(['moderator', 'support_agent']);
    expect(merged.has('content.moderate')).toBe(true);
    expect(merged.has('users.notes.write')).toBe(true);
    expect(merged.has('payout.approve')).toBe(false);
  });

  it('gives an unknown role no permissions', () => {
    expect(permissionsForRoles(['ghost']).size).toBe(0);
  });
});
