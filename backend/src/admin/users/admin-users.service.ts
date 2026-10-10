import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { normalizeEmail } from '../../auth/identifier.js';
import { TwoFactorService } from '../../auth/two-factor.service.js';
import { PasswordHasher } from '../../common/crypto/password.js';
import { generateTempPassword } from '../../common/crypto/tokens.js';
import { Errors } from '../../common/errors/app-error.js';
import type { AdminAuthContext } from '../../common/http/request.js';
import { Page, clampLimit, decodeCursor } from '../../common/pagination/cursor.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { AdminSessionService } from '../auth/admin-session.service.js';
import { RolesService } from '../roles/roles.service.js';
import { AdminMailer } from './admin-mailer.js';

const cursorSchema = z.object({ t: z.string(), id: z.string() });

interface Meta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

const include = {
  roles: { select: { role: { select: { key: true, name: true } } } },
} satisfies Prisma.AdminUserInclude;

type AdminRow = Prisma.AdminUserGetPayload<{ include: typeof include }>;

export function toStaffView(a: AdminRow) {
  return {
    id: a.id,
    email: a.email,
    name: a.name,
    status: a.status,
    roles: a.roles.map((r) => r.role),
    twoFactorEnabled: a.twoFactorEnabled,
    mustChangePassword: a.mustChangePassword,
    inviteExpiresAt: a.inviteExpiresAt?.toISOString() ?? null,
    lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}

/**
 * Managing staff accounts. The rules that matter, in one place:
 *
 *   - nobody changes their own roles, status or two-step verification here (a
 *     second person must), so one account cannot raise itself;
 *   - only a super admin can touch a super admin, and the last active super
 *     admin can never be removed or disabled;
 *   - roles can be handed out only within your own permissions and the
 *     separation-of-duties rules (see `RolesService.assertAssignable`);
 *   - every change is audited in the same transaction, with a reason where the
 *     change is a sensitive one.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly roles: RolesService,
    private readonly sessions: AdminSessionService,
    private readonly twoFactor: TwoFactorService,
    private readonly audit: AuditService,
    private readonly mailer: AdminMailer,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ---------------------------------------------------------------- reading --

  async list(q: {
    cursor?: string | undefined;
    limit?: number | undefined;
    status?: 'INVITED' | 'ACTIVE' | 'DISABLED' | undefined;
    role?: string | undefined;
    q?: string | undefined;
  }) {
    const limit = clampLimit(q.limit);
    const after = decodeCursor(q.cursor, cursorSchema);
    const rows = await this.prisma.adminUser.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.role ? { roles: { some: { role: { key: q.role } } } } : {}),
        ...(q.q
          ? {
              OR: [
                { email: { contains: q.q, mode: 'insensitive' as const } },
                { name: { contains: q.q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
        ...(after
          ? {
              AND: [
                {
                  OR: [
                    { createdAt: { lt: new Date(after.t) } },
                    { createdAt: new Date(after.t), id: { lt: after.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.createdAt.toISOString(), id: r.id }),
      toStaffView,
    );
  }

  async get(id: string) {
    const a = await this.prisma.adminUser.findUnique({ where: { id }, include });
    if (!a) throw Errors.notFound('Staff account');
    return toStaffView(a);
  }

  async sessionsOf(id: string) {
    await this.get(id);
    const rows = await this.sessions.listActive(id);
    return rows.map((s) => ({
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      lastUsedAt: s.lastUsedAt.toISOString(),
      idleExpiresAt: s.idleExpiresAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      mfaVerified: !!s.mfaVerifiedAt,
      ip: s.ip,
    }));
  }

  // ---------------------------------------------------------------- guards --

  private async target(id: string): Promise<AdminRow> {
    const a = await this.prisma.adminUser.findUnique({ where: { id }, include });
    if (!a) throw Errors.notFound('Staff account');
    return a;
  }

  private assertNotSelf(actor: AdminAuthContext, targetId: string): void {
    if (actor.adminId === targetId) {
      throw Errors.forbidden('Ask another administrator to make this change to your own account.');
    }
  }

  private assertMayTouch(actor: AdminAuthContext, target: AdminRow): void {
    const targetIsSuper = target.roles.some((r) => r.role.key === 'super_admin');
    if (targetIsSuper && !actor.roles.includes('super_admin')) {
      throw Errors.forbidden('Only a super admin can change a super admin.');
    }
  }

  /** The number of other super admins who could still sign in. */
  private async otherActiveSuperAdmins(excludingId: string): Promise<number> {
    return this.prisma.adminUser.count({
      where: {
        id: { not: excludingId },
        status: { in: ['ACTIVE', 'INVITED'] },
        roles: { some: { role: { key: 'super_admin' } } },
      },
    });
  }

  private async assertNotLastSuperAdmin(target: AdminRow): Promise<void> {
    if (!target.roles.some((r) => r.role.key === 'super_admin')) return;
    if ((await this.otherActiveSuperAdmins(target.id)) === 0) {
      throw Errors.conflict('This is the last super admin. Make another one first.');
    }
  }

  // --------------------------------------------------------------- invite --

  async invite(
    actor: AdminAuthContext,
    input: { email: string; name: string; roleKeys: string[] },
    meta: Meta,
  ) {
    const email = normalizeEmail(input.email);
    if (!email) throw Errors.validation([{ field: 'email', reasons: ['invalid'] }]);
    const { roles } = await this.roles.assertAssignable(actor, input.roleKeys);
    if (await this.prisma.adminUser.findUnique({ where: { email }, select: { id: true } })) {
      throw Errors.conflict('A staff account with that e-mail already exists.');
    }

    const temporaryPassword = generateTempPassword();
    const expiresAt = new Date(Date.now() + this.env.ADMIN_INVITE_TTL_HOURS * 3_600_000);
    const created = await this.prisma.$transaction(async (tx) => {
      const admin = await tx.adminUser.create({
        data: {
          email,
          name: input.name.trim(),
          passwordHash: await this.hasher.hash(temporaryPassword),
          status: 'INVITED',
          mustChangePassword: true,
          inviteExpiresAt: expiresAt,
          createdById: actor.adminId,
          roles: { create: roles.map((r) => ({ roleId: r.id })) },
        },
        include,
      });
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'admin.invited',
          targetType: 'admin',
          targetId: admin.id,
          after: { email, name: admin.name, roles: input.roleKeys },
          ...meta,
        },
        tx,
      );
      return admin;
    });

    const emailSent = await this.mailer.sendInvite({
      to: email,
      name: created.name,
      temporaryPassword,
      expiresAt,
      invitedBy: actor.name,
    });
    return { ...toStaffView(created), inviteEmailSent: emailSent };
  }

  async reinvite(actor: AdminAuthContext, id: string, meta: Meta) {
    const target = await this.target(id);
    this.assertNotSelf(actor, id);
    this.assertMayTouch(actor, target);
    if (target.status !== 'INVITED') {
      throw Errors.conflict('Only an account that has not finished set-up can be re-invited.');
    }
    const temporaryPassword = generateTempPassword();
    const expiresAt = new Date(Date.now() + this.env.ADMIN_INVITE_TTL_HOURS * 3_600_000);
    await this.prisma.$transaction(async (tx) => {
      await tx.adminUser.update({
        where: { id },
        data: {
          passwordHash: await this.hasher.hash(temporaryPassword),
          mustChangePassword: true,
          inviteExpiresAt: expiresAt,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'admin.reinvited',
          targetType: 'admin',
          targetId: id,
          ...meta,
        },
        tx,
      );
    });
    await this.sessions.revokeAll(id, 'ADMIN');
    const emailSent = await this.mailer.sendInvite({
      to: target.email,
      name: target.name,
      temporaryPassword,
      expiresAt,
      invitedBy: actor.name,
    });
    return { ...(await this.get(id)), inviteEmailSent: emailSent };
  }

  // ----------------------------------------------------------------- roles --

  async setRoles(
    actor: AdminAuthContext,
    id: string,
    input: { roleKeys: string[]; reason: string },
    meta: Meta,
  ) {
    this.assertNotSelf(actor, id);
    const target = await this.target(id);
    this.assertMayTouch(actor, target);
    const { roles } = await this.roles.assertAssignable(actor, input.roleKeys);

    const before = target.roles.map((r) => r.role.key).sort();
    const after = [...input.roleKeys].sort();
    if (before.join() === after.join()) return toStaffView(target);
    if (before.includes('super_admin') && !after.includes('super_admin')) {
      await this.assertNotLastSuperAdmin(target);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.adminUserRole.deleteMany({ where: { adminId: id } });
      await tx.adminUserRole.createMany({
        data: roles.map((r) => ({ adminId: id, roleId: r.id })),
      });
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'admin.roles.changed',
          targetType: 'admin',
          targetId: id,
          reason: input.reason,
          before: { roles: before },
          after: { roles: after },
          ...meta,
        },
        tx,
      );
    });
    void this.mailer.sendSecurityNotice({
      to: target.email,
      name: target.name,
      subject: 'Your BLOCKS admin roles changed',
      text: `Your roles are now: ${after.join(', ')}.`,
    });
    return this.get(id);
  }

  // ---------------------------------------------------------------- status --

  async disable(actor: AdminAuthContext, id: string, reason: string, meta: Meta) {
    this.assertNotSelf(actor, id);
    const target = await this.target(id);
    this.assertMayTouch(actor, target);
    if (target.status === 'DISABLED') return toStaffView(target);
    await this.assertNotLastSuperAdmin(target);

    await this.prisma.$transaction(async (tx) => {
      await tx.adminUser.update({ where: { id }, data: { status: 'DISABLED' } });
      await tx.adminSession.updateMany({
        where: { adminId: id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'ADMIN' },
      });
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'admin.disabled',
          targetType: 'admin',
          targetId: id,
          reason,
          before: { status: target.status },
          after: { status: 'DISABLED' },
          ...meta,
        },
        tx,
      );
    });
    return this.get(id);
  }

  async enable(actor: AdminAuthContext, id: string, reason: string, meta: Meta) {
    this.assertNotSelf(actor, id);
    const target = await this.target(id);
    this.assertMayTouch(actor, target);
    if (target.status !== 'DISABLED') throw Errors.conflict('That account is not disabled.');

    // Someone who never finished set-up goes back to "invited" with no usable
    // password until they are invited again; everyone else can sign in as before.
    const status = target.twoFactorEnabled ? 'ACTIVE' : 'INVITED';
    await this.prisma.$transaction(async (tx) => {
      await tx.adminUser.update({
        where: { id },
        data: {
          status,
          failedLoginCount: 0,
          lockedUntil: null,
          ...(status === 'INVITED' ? { inviteExpiresAt: null, mustChangePassword: true } : {}),
        },
      });
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'admin.enabled',
          targetType: 'admin',
          targetId: id,
          reason,
          before: { status: 'DISABLED' },
          after: { status },
          ...meta,
        },
        tx,
      );
    });
    return this.get(id);
  }

  // ---------------------------------------------------------- two-factor / sessions --

  /**
   * For someone who has lost their authenticator and backup codes. A second
   * person does it, with a reason; the target is signed out everywhere and must
   * set up again after entering their password.
   */
  async resetTwoFactor(actor: AdminAuthContext, id: string, reason: string, meta: Meta) {
    this.assertNotSelf(actor, id);
    const target = await this.target(id);
    this.assertMayTouch(actor, target);
    if (!target.twoFactorEnabled)
      throw Errors.conflict('Two-step verification is not set up on that account.');

    await this.twoFactor.disable('admin', id);
    await this.sessions.revokeAll(id, 'ADMIN');
    await this.audit.record({
      actorType: 'ADMIN',
      actorId: actor.adminId,
      actorLabel: actor.name,
      action: 'admin.two_factor.reset',
      targetType: 'admin',
      targetId: id,
      reason,
      ...meta,
    });
    void this.mailer.sendSecurityNotice({
      to: target.email,
      name: target.name,
      subject: 'Two-step verification was reset on your BLOCKS admin account',
      text: `${actor.name} reset two-step verification on your account. You will be asked to set it up again the next time you sign in.`,
    });
    return this.get(id);
  }

  async revokeSessions(actor: AdminAuthContext, id: string, reason: string, meta: Meta) {
    this.assertMayTouch(actor, await this.target(id));
    const count = await this.sessions.revokeAll(id, 'ADMIN');
    await this.audit.record({
      actorType: 'ADMIN',
      actorId: actor.adminId,
      actorLabel: actor.name,
      action: 'admin.sessions.revoked',
      targetType: 'admin',
      targetId: id,
      reason,
      after: { count },
      ...meta,
    });
    return { signedOut: count };
  }
}
