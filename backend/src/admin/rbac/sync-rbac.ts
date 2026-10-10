import type { PrismaClient } from '../../generated/prisma/client.js';
import { PERMISSIONS, ROLES } from './permission-catalog.js';

/** Arbitrary but fixed: serialises the sync across API instances starting together. */
const ADVISORY_LOCK_KEY = 7_201_001;

/**
 * Brings the database copy of the permission catalogue and the built-in roles in
 * line with the code. Idempotent, and safe to run from several processes at
 * once (a transaction-scoped advisory lock serialises them). Custom roles are
 * never touched. Used by the API at start-up and by the seed / admin CLI.
 */
export async function syncRbac(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      // Returns void, which only $executeRaw can read; the lock lasts until commit.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_KEY})`;

      // -- permissions ------------------------------------------------------------
      const existing = await tx.permission.findMany();
      const byKey = new Map(existing.map((p) => [p.key, p]));
      const wanted = new Set<string>(PERMISSIONS.map((p) => p.key));

      const missing = PERMISSIONS.filter((p) => !byKey.has(p.key));
      if (missing.length) {
        await tx.permission.createMany({
          data: missing.map((p) => ({
            key: p.key,
            module: p.module,
            description: p.description,
          })),
          skipDuplicates: true,
        });
      }
      for (const p of PERMISSIONS) {
        const row = byKey.get(p.key);
        if (row && (row.module !== p.module || row.description !== p.description)) {
          await tx.permission.update({
            where: { key: p.key },
            data: { module: p.module, description: p.description },
          });
        }
      }
      const stale = existing.filter((p) => !wanted.has(p.key)).map((p) => p.key);
      if (stale.length) await tx.permission.deleteMany({ where: { key: { in: stale } } });

      const idByKey = new Map((await tx.permission.findMany()).map((p) => [p.key, p.id]));

      // -- built-in roles ----------------------------------------------------------
      for (const def of ROLES) {
        const role = await tx.role.upsert({
          where: { key: def.key },
          update: { name: def.name, description: def.description, isSystem: true },
          create: { key: def.key, name: def.name, description: def.description, isSystem: true },
        });
        const have = await tx.rolePermission.findMany({
          where: { roleId: role.id },
          select: { permissionId: true },
        });
        const haveIds = new Set(have.map((h) => h.permissionId));
        const wantIds = new Set(def.permissions.map((k) => idByKey.get(k) as string));

        const extra = [...haveIds].filter((id) => !wantIds.has(id));
        if (extra.length) {
          await tx.rolePermission.deleteMany({
            where: { roleId: role.id, permissionId: { in: extra } },
          });
        }
        const add = [...wantIds].filter((id) => !haveIds.has(id));
        if (add.length) {
          await tx.rolePermission.createMany({
            data: add.map((permissionId) => ({ roleId: role.id, permissionId })),
            skipDuplicates: true,
          });
        }
      }
    },
    { timeout: 30_000, maxWait: 30_000 },
  );
}
