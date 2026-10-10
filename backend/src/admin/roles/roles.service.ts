import { Injectable } from '@nestjs/common';
import { Errors, type FieldIssue } from '../../common/errors/app-error.js';
import type { AdminAuthContext } from '../../common/http/request.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { type PermissionKey, PERMISSIONS, isPermissionKey } from '../rbac/permission-catalog.js';
import { findSeparationViolations, isExempt } from '../rbac/separation.js';

export interface RoleView {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  memberCount: number;
}

interface Meta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

/**
 * Roles and the permission catalogue.
 *
 * Two rules keep staff from growing their own power:
 *   - **no escalation**: you can only put a permission into a role (or hand out
 *     a role) if you hold it yourself; only the super admin is above this;
 *   - **separation of duties**: a role, or a person's combined roles, may not
 *     contain a forbidden pair (see `separation.ts`).
 * The built-in roles are defined in code and cannot be edited here.
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  catalogue() {
    const modules = new Map<string, Array<{ key: string; description: string }>>();
    for (const p of PERMISSIONS) {
      const list = modules.get(p.module) ?? [];
      list.push({ key: p.key, description: p.description });
      modules.set(p.module, list);
    }
    return [...modules.entries()].map(([module, permissions]) => ({ module, permissions }));
  }

  async list(): Promise<RoleView[]> {
    const roles = await this.prisma.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: {
        permissions: { select: { permission: { select: { key: true } } } },
        _count: { select: { admins: true } },
      },
    });
    return roles.map((r) => this.view(r));
  }

  async get(id: string): Promise<RoleView> {
    const r = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: { select: { permission: { select: { key: true } } } },
        _count: { select: { admins: true } },
      },
    });
    if (!r) throw Errors.notFound('Role');
    return this.view(r);
  }

  private view(r: {
    id: string;
    key: string;
    name: string;
    description: string | null;
    isSystem: boolean;
    permissions: Array<{ permission: { key: string } }>;
    _count: { admins: number };
  }): RoleView {
    return {
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissions: r.permissions
        .map((p) => p.permission.key)
        .filter(isPermissionKey)
        .sort(),
      memberCount: r._count.admins,
    };
  }

  /** The roles with these keys and the permissions they grant together. Unknown keys are a 400. */
  async resolve(roleKeys: readonly string[]) {
    const roles = await this.prisma.role.findMany({
      where: { key: { in: [...roleKeys] } },
      include: { permissions: { select: { permission: { select: { key: true } } } } },
    });
    const found = new Set(roles.map((r) => r.key));
    const unknown = roleKeys.filter((k) => !found.has(k));
    if (unknown.length) {
      throw Errors.validation([
        { field: 'roleKeys', reasons: unknown.map((k) => `unknown_role:${k}`) },
      ]);
    }
    const permissions = new Set<PermissionKey>();
    for (const r of roles) {
      for (const p of r.permissions)
        if (isPermissionKey(p.permission.key)) permissions.add(p.permission.key);
    }
    return { roles, permissions };
  }

  /**
   * Whether `actor` may give someone these roles. Throws a precise 400 if not:
   * a role holding a permission the actor lacks (escalation), or a combination
   * the separation-of-duties rules forbid.
   */
  async assertAssignable(actor: AdminAuthContext, roleKeys: readonly string[]) {
    const resolved = await this.resolve(roleKeys);
    const actorIsSuper = actor.roles.includes('super_admin');
    const issues: FieldIssue[] = [];

    if (roleKeys.includes('super_admin') && !actorIsSuper) {
      issues.push({ field: 'roleKeys', reasons: ['only_super_admin_can_grant:super_admin'] });
    }
    if (!actorIsSuper) {
      const beyond = [...resolved.permissions].filter((p) => !actor.permissions.has(p));
      if (beyond.length) {
        issues.push({
          field: 'roleKeys',
          reasons: beyond.map((p) => `beyond_your_permissions:${p}`),
        });
      }
    }
    if (!isExempt(roleKeys)) {
      const breaches = findSeparationViolations(resolved.permissions);
      if (breaches.length) {
        issues.push({
          field: 'roleKeys',
          reasons: breaches.map((b) => `separation_of_duties:${b.a}+${b.b}`),
        });
      }
    }
    if (issues.length) throw Errors.validation(issues);
    return resolved;
  }

  private assertPermissionSet(actor: AdminAuthContext, keys: readonly string[]): PermissionKey[] {
    const issues: FieldIssue[] = [];
    const unknown = keys.filter((k) => !isPermissionKey(k));
    if (unknown.length) {
      issues.push({
        field: 'permissionKeys',
        reasons: unknown.map((k) => `unknown_permission:${k}`),
      });
    }
    const valid = keys.filter(isPermissionKey);
    if (!actor.roles.includes('super_admin')) {
      const beyond = valid.filter((p) => !actor.permissions.has(p));
      if (beyond.length) {
        issues.push({
          field: 'permissionKeys',
          reasons: beyond.map((p) => `beyond_your_permissions:${p}`),
        });
      }
    }
    const breaches = findSeparationViolations(valid);
    if (breaches.length) {
      issues.push({
        field: 'permissionKeys',
        reasons: breaches.map((b) => `separation_of_duties:${b.a}+${b.b}`),
      });
    }
    if (issues.length) throw Errors.validation(issues);
    return valid;
  }

  async create(
    actor: AdminAuthContext,
    input: {
      key: string;
      name: string;
      description?: string | undefined;
      permissionKeys: string[];
    },
    meta: Meta,
  ): Promise<RoleView> {
    const keys = this.assertPermissionSet(actor, input.permissionKeys);
    const clash = await this.prisma.role.findUnique({
      where: { key: input.key },
      select: { id: true },
    });
    if (clash) throw Errors.conflict('A role with that key already exists.');

    const permissionRows = await this.prisma.permission.findMany({ where: { key: { in: keys } } });
    const role = await this.prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: {
          key: input.key,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          isSystem: false,
          permissions: { create: permissionRows.map((p) => ({ permissionId: p.id })) },
        },
      });
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'role.created',
          targetType: 'role',
          targetId: created.id,
          after: { key: created.key, name: created.name, permissions: keys },
          ...meta,
        },
        tx,
      );
      return created;
    });
    return this.get(role.id);
  }

  async update(
    actor: AdminAuthContext,
    id: string,
    input: { name: string; description?: string | undefined; permissionKeys: string[] },
    meta: Meta,
  ): Promise<RoleView> {
    const before = await this.get(id);
    if (before.isSystem)
      throw Errors.conflict('Built-in roles are defined in code and cannot be edited.');
    const keys = this.assertPermissionSet(actor, input.permissionKeys);
    const permissionRows = await this.prisma.permission.findMany({ where: { key: { in: keys } } });

    await this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: { name: input.name.trim(), description: input.description?.trim() || null },
      });
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.rolePermission.createMany({
        data: permissionRows.map((p) => ({ roleId: id, permissionId: p.id })),
      });
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'role.updated',
          targetType: 'role',
          targetId: id,
          before: { name: before.name, permissions: before.permissions },
          after: { name: input.name.trim(), permissions: keys },
          ...meta,
        },
        tx,
      );
    });
    return this.get(id);
  }

  async remove(actor: AdminAuthContext, id: string, meta: Meta): Promise<void> {
    const role = await this.get(id);
    if (role.isSystem) throw Errors.conflict('Built-in roles cannot be deleted.');
    if (role.memberCount > 0) {
      throw Errors.conflict('Take this role away from the staff who hold it first.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.role.delete({ where: { id } });
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'role.deleted',
          targetType: 'role',
          targetId: id,
          before: { key: role.key, name: role.name, permissions: role.permissions },
          ...meta,
        },
        tx,
      );
    });
  }
}
