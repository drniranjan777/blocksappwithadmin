import { generateTempPassword } from '../../common/crypto/tokens.js';
import { PasswordHasher } from '../../common/crypto/password.js';
import { normalizeEmail } from '../../auth/identifier.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { syncRbac } from '../rbac/sync-rbac.js';

export interface BootstrapResult {
  id: string;
  email: string;
  /** Shown to the operator once. It is not stored anywhere in clear and never logged. */
  temporaryPassword: string;
  expiresAt: Date;
}

/**
 * Creates the first super admin (or another one, from the command line).
 *
 * There is no default account and no default password: the operator names the
 * person, and a random temporary password is printed once. It expires, and the
 * account cannot do anything until the person has replaced it and set up an
 * authenticator app. The creation is recorded in the audit log as a system
 * action, since no staff member exists yet to be the actor.
 */
export async function bootstrapSuperAdmin(
  prisma: PrismaClient,
  input: { email: string; name: string; inviteTtlHours?: number },
): Promise<BootstrapResult> {
  const email = normalizeEmail(input.email);
  if (!email) throw new Error(`"${input.email}" is not a valid e-mail address`);
  const name = input.name.trim();
  if (name.length < 2) throw new Error('A name of at least two characters is needed');

  await syncRbac(prisma);
  if (await prisma.adminUser.findUnique({ where: { email }, select: { id: true } })) {
    throw new Error(`A staff account for ${email} already exists`);
  }
  const role = await prisma.role.findUniqueOrThrow({ where: { key: 'super_admin' } });

  const temporaryPassword = generateTempPassword();
  const expiresAt = new Date(Date.now() + (input.inviteTtlHours ?? 72) * 3_600_000);
  const admin = await prisma.$transaction(async (tx) => {
    const created = await tx.adminUser.create({
      data: {
        email,
        name,
        passwordHash: await new PasswordHasher().hash(temporaryPassword),
        status: 'INVITED',
        mustChangePassword: true,
        inviteExpiresAt: expiresAt,
        roles: { create: [{ roleId: role.id }] },
      },
    });
    await tx.auditLog.create({
      data: {
        actorType: 'SYSTEM',
        actorLabel: 'bootstrap command',
        action: 'admin.bootstrap',
        targetType: 'admin',
        targetId: created.id,
        after: { email, name, roles: ['super_admin'] },
      },
    });
    return created;
  });
  return { id: admin.id, email, temporaryPassword, expiresAt };
}
