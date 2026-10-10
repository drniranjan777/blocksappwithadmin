import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { UserSessionService } from '../../auth/user-session.service.js';
import { maskEmail, maskPhone } from '../../common/crypto/mask.js';
import { Errors } from '../../common/errors/app-error.js';
import type { AdminAuthContext } from '../../common/http/request.js';
import { Page, clampLimit, decodeCursor } from '../../common/pagination/cursor.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma, RiskLevel, UserStatus } from '../../generated/prisma/client.js';
import { NotificationService } from '../../notifications/notification.service.js';
import { SecurityEventService } from '../../security/security-events.service.js';
import { reasonTitle } from '../../trust/policy.js';
import { AuditService } from '../audit/audit.service.js';

const cursorSchema = z.object({ t: z.string(), id: z.string() });

interface Meta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

/** What staff can do to an account, and from which state. */
const TRANSITIONS = {
  suspend: { from: ['ACTIVE', 'RESTRICTED'], to: 'SUSPENDED' },
  restrict: { from: ['ACTIVE'], to: 'RESTRICTED' },
  restore: { from: ['SUSPENDED', 'RESTRICTED'], to: 'ACTIVE' },
} as const satisfies Record<string, { from: readonly UserStatus[]; to: UserStatus }>;
export type UserAction = keyof typeof TRANSITIONS;

const ACTION_RECORD = {
  suspend: 'SUSPEND_USER',
  restrict: 'RESTRICT_USER',
  restore: 'REACTIVATE_USER',
} as const satisfies Record<UserAction, string>;

/** What the caller of `applyStatusChange` needs to finish the job after the transaction commits. */
export interface StatusChange {
  actionId: string;
  action: UserAction;
  policyReason: string;
}

/**
 * Looking after app users: finding them, seeing their standing, and taking an account out of
 * circulation when it has to be.
 *
 * Contact details are masked for everyone with `users.read`; the full e-mail and phone are
 * shown only to staff who also hold `users.read_contact`, and each such look is written to the
 * sensitive audit trail. Every status change needs a reason, is audited in the same transaction
 * as the change, and appears in their own login activity so they can see it happened. A suspension
 * also signs the person out of every device; a restriction leaves them signed in but unable to
 * publish (`@Publishes()` routes refuse them) until it is lifted.
 */
@Injectable()
export class AppUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: UserSessionService,
    private readonly security: SecurityEventService,
    private readonly notifications: NotificationService,
  ) {}

  // ------------------------------------------------------------------ reading --

  private card(u: Prisma.UserGetPayload<{ include: { profile: true } }>, full: boolean) {
    return {
      id: u.id,
      username: u.username,
      displayName: u.profile?.displayName ?? u.username,
      email: u.email ? (full ? u.email : maskEmail(u.email)) : null,
      phone: u.phone ? (full ? u.phone : maskPhone(u.phone)) : null,
      emailVerified: !!u.emailVerifiedAt,
      phoneVerified: !!u.phoneVerifiedAt,
      status: u.status,
      statusReason: u.statusReason,
      risk: u.riskLevel,
      accountType: u.accountType,
      twoFactorEnabled: u.twoFactorEnabled,
      followers: u.profile?.followersCount ?? 0,
      following: u.profile?.followingCount ?? 0,
      posts: u.profile?.postsCount ?? 0,
      badge: u.profile?.badge ?? 'NONE',
      location: u.profile
        ? { country: u.profile.country, state: u.profile.state, district: u.profile.district }
        : null,
      createdAt: u.createdAt.toISOString(),
      lastActiveAt: u.lastActiveAt?.toISOString() ?? null,
    };
  }

  async list(q: {
    q?: string | undefined;
    status?: UserStatus | undefined;
    risk?: RiskLevel | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
  }) {
    const limit = clampLimit(q.limit);
    const after = decodeCursor(q.cursor, cursorSchema);
    const text = q.q?.trim().toLowerCase();
    const digits = text?.replace(/[^\d+]/g, '');
    const rows = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(q.status ? { status: q.status } : {}),
        ...(q.risk ? { riskLevel: q.risk } : {}),
        ...(text
          ? {
              OR: [
                { username: { startsWith: text.replace(/^@/, '') } },
                { profile: { displayName: { contains: text, mode: 'insensitive' as const } } },
                // Contact details match only exactly, so search cannot be used to browse them.
                { email: text },
                ...(digits && digits.length >= 8
                  ? [{ phone: digits.startsWith('+') ? digits : `+${digits}` }]
                  : []),
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
      include: { profile: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.createdAt.toISOString(), id: r.id }),
      (r) => this.card(r, false),
    );
  }

  /**
   * One account. `seeContact` is true only for staff with `users.read_contact`, and then the
   * look is itself recorded, so reading someone's e-mail address always leaves a trace.
   */
  async get(actor: AdminAuthContext, id: string, meta: Meta) {
    const seeContact = actor.permissions.has('users.read_contact');
    const u = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { profile: true },
    });
    if (!u) throw Errors.notFound('User');
    const [sessions, reels, kyc, creator, reports] = await Promise.all([
      this.prisma.userSession.count({
        where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } },
      }),
      this.prisma.reel.count({
        where: { authorId: id, deletedAt: null, publishStatus: 'PUBLISHED' },
      }),
      this.prisma.kycProfile.findFirst({
        where: { userId: id },
        orderBy: { submittedAt: 'desc' },
        select: { status: true },
      }),
      this.prisma.creatorProfile.findUnique({
        where: { userId: id },
        select: { monetizationStatus: true, bestReachLevel: true },
      }),
      this.prisma.report.count({ where: { targetUserId: id } }),
    ]);
    if (seeContact && (u.email || u.phone)) {
      await this.audit.record({
        actorType: 'ADMIN',
        actorId: actor.adminId,
        actorLabel: actor.name,
        action: 'user.contact_viewed',
        targetType: 'user',
        targetId: id,
        sensitive: true,
        ...meta,
      });
    }
    return {
      ...this.card(u, seeContact),
      activeSessions: sessions,
      reels,
      identity: kyc?.status ?? 'NOT_STARTED',
      monetization: creator?.monetizationStatus ?? 'NOT_ELIGIBLE',
      bestReachLevel: creator?.bestReachLevel ?? 'DISTRICT',
      reportsAgainst: reports,
    };
  }

  // ----------------------------------------------------------------- changes --

  async changeStatus(
    actor: AdminAuthContext,
    id: string,
    action: UserAction,
    reason: string,
    meta: Meta,
  ) {
    const change = await this.prisma.$transaction((tx) =>
      this.applyStatusChange(tx, actor, id, action, reason, meta, {
        policyReason: 'account_standing',
      }),
    );
    await this.afterStatusChange(id, change);
    return this.get(actor, id, meta);
  }

  /**
   * The status change itself, inside the caller's transaction: the new status, the audit entry and
   * the moderation record (the person's own history, and what an appeal points at) commit together
   * or not at all. Call `afterStatusChange` once the transaction has committed.
   */
  async applyStatusChange(
    tx: Prisma.TransactionClient,
    actor: AdminAuthContext,
    id: string,
    action: UserAction,
    reason: string,
    meta: Meta,
    o: { policyReason: string; reportId?: string | null; reversalOfId?: string | null },
  ): Promise<StatusChange> {
    const rule = TRANSITIONS[action];
    const u = await tx.user.findFirst({
      where: { id, deletedAt: null },
      select: { status: true },
    });
    if (!u) throw Errors.notFound('User');
    if (!(rule.from as readonly UserStatus[]).includes(u.status)) {
      throw Errors.conflict(
        `An account that is ${u.status.toLowerCase().replace(/_/g, ' ')} cannot be ${action}ed.`,
      );
    }
    const res = await tx.user.updateMany({
      where: { id, status: u.status },
      data: { status: rule.to, statusReason: reason.slice(0, 300), statusChangedAt: new Date() },
    });
    if (res.count !== 1)
      throw Errors.conflict('This account was changed by someone else. Reload and try again.');
    const record = await tx.moderationAction.create({
      data: {
        reportId: o.reportId ?? null,
        adminId: actor.adminId,
        source: 'ADMIN',
        targetType: 'USER',
        targetId: id,
        targetUserId: id,
        action: ACTION_RECORD[action],
        policyReason: o.policyReason,
        notes: reason.slice(0, 1000),
        reversalOfId: o.reversalOfId ?? null,
      },
      select: { id: true },
    });
    await this.audit.record(
      {
        actorType: 'ADMIN',
        actorId: actor.adminId,
        actorLabel: actor.name,
        action: `user.${action}`,
        targetType: 'user',
        targetId: id,
        reason,
        before: { status: u.status },
        after: { status: rule.to, moderationActionId: record.id },
        ...meta,
      },
      tx,
    );
    return { actionId: record.id, action, policyReason: o.policyReason };
  }

  /** After the commit: out of every device at once, a note in their activity, and telling them. */
  async afterStatusChange(id: string, change: StatusChange): Promise<void> {
    const { action } = change;
    // A suspended or restricted account must not keep working on a live token.
    if (action === 'suspend') await this.sessions.revokeAll(id, 'ADMIN');
    else await this.sessions.refreshStatus(id);
    await this.security
      .record({
        userId: id,
        type: 'ADMIN_ACTION',
        severity: action === 'restore' ? 'INFO' : 'WARNING',
        details: { action },
      })
      .catch(() => undefined);
    await this.notifications
      .notify({
        userId: id,
        type: 'MODERATION_DECISION',
        template: 'moderation_account_action',
        vars: {
          action:
            action === 'restore'
              ? 'reactivated'
              : action === 'suspend'
                ? 'suspended'
                : 'restricted',
          rule: reasonTitle(change.policyReason),
        },
        severity: action === 'restore' ? 'INFO' : 'WARNING',
        data: { actionId: change.actionId },
        dedupeKey: `mod-action:${change.actionId}`,
      })
      .catch(() => undefined);
  }

  async revokeSessions(actor: AdminAuthContext, id: string, reason: string, meta: Meta) {
    const exists = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!exists) throw Errors.notFound('User');
    const revoked = await this.sessions.revokeAll(id, 'ADMIN');
    await this.audit.record({
      actorType: 'ADMIN',
      actorId: actor.adminId,
      actorLabel: actor.name,
      action: 'user.sessions_revoked',
      targetType: 'user',
      targetId: id,
      reason,
      after: { revoked },
      ...meta,
    });
    return { revoked };
  }

  // -------------------------------------------------------------------- notes --

  async notes(id: string) {
    const rows = await this.prisma.userNote.findMany({
      where: { userId: id },
      include: { author: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((n) => ({
      id: n.id,
      body: n.body,
      by: n.author.name,
      at: n.createdAt.toISOString(),
    }));
  }

  async addNote(actor: AdminAuthContext, id: string, body: string, meta: Meta) {
    const exists = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!exists) throw Errors.notFound('User');
    const note = await this.prisma.userNote.create({
      data: { userId: id, authorId: actor.adminId, body: body.trim() },
    });
    await this.audit.record({
      actorType: 'ADMIN',
      actorId: actor.adminId,
      actorLabel: actor.name,
      action: 'user.note_added',
      targetType: 'user',
      targetId: id,
      ...meta,
    });
    return { id: note.id, body: note.body, by: actor.name, at: note.createdAt.toISOString() };
  }
}
