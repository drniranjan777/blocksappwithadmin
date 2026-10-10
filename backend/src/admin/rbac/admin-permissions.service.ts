import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { type PermissionKey, isPermissionKey } from './permission-catalog.js';

export interface AdminAccess {
  roles: Array<{ key: string; name: string }>;
  permissions: Set<PermissionKey>;
}

/**
 * What a staff member may do: the union of the permissions of every role they
 * hold. Read from the database on each request (staff traffic is small), so a
 * role change, a removed role or a disabled account takes effect immediately.
 *
 * A key the code no longer defines is ignored even if a table still lists it:
 * the catalogue in code decides what exists.
 */
@Injectable()
export class AdminPermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async accessFor(adminId: string): Promise<AdminAccess> {
    const rows = await this.prisma.adminUserRole.findMany({
      where: { adminId },
      select: {
        role: {
          select: {
            key: true,
            name: true,
            permissions: { select: { permission: { select: { key: true } } } },
          },
        },
      },
    });
    const permissions = new Set<PermissionKey>();
    for (const { role } of rows) {
      for (const rp of role.permissions) {
        if (isPermissionKey(rp.permission.key)) permissions.add(rp.permission.key);
      }
    }
    return {
      roles: rows.map((r) => ({ key: r.role.key, name: r.role.name })),
      permissions,
    };
  }
}
