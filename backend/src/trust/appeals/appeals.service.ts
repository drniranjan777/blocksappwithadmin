import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../../admin/audit/audit.service.js';
import { Errors } from '../../common/errors/app-error.js';
import type { AdminAuthContext } from '../../common/http/request.js';
import { Page, clampLimit, decodeCursor } from '../../common/pagination/cursor.js';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  AppealKind,
  AppealStatus,
  ModerationActionType,
  Prisma,
} from '../../generated/prisma/client.js';
import { ModerationService } from '../moderation/moderation.service.js';
import { ModerationNotices } from '../moderation-notices.js';
import { ACCOUNT_ACTIONS, APPEALABLE_ACTIONS, SYSTEM_REASONS, reasonTitle } from '../policy.js';
import { PolicyService } from '../policy/policy.service.js';
import { TargetsService } from '../targets.service.js';

interface Meta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

const cursorSchema = z.object({ t: z.string(), id: z.string() });
const DAY = 24 * 3_600_000;
const WAITING: AppealStatus[] = ['OPEN', 'IN_REVIEW'];

/** How a decision reads to the person it was made about. */
function plainKind(a: ModerationActionType): string {
  switch (a) {
    case 'REMOVE':
      return 'REMOVED';
    case 'RESTRICT':
      return 'HIDDEN';
    case 'WARN':
      return 'WARNING';
    case 'RESTRICT_USER':
      return 'ACCOUNT_RESTRICTED';
    case 'SUSPEND_USER':
      return 'ACCOUNT_SUSPENDED';
    default:
      return a;
  }
}

/**
 * Appeals: asking for a decision to be looked at again.
 *
 * People can appeal decisions made about their own content or account, once per decision, within
 * a window the policy sets. Staff decide appeals under three rules, all enforced in the service and
 * the first also in the database:
 *   - the reviewer cannot be the person who made the decision under appeal;
 *   - the reviewer takes the appeal before deciding it, so two people never decide at once;
 *   - overturning needs the permission that undoes that kind of decision, and undoes it the same
 *     way a direct reversal does.
 *
 * The note a reviewer writes is shown to the person who appealed. Staff are told so on the form.
 * A suspended account cannot sign in, so cannot appeal in the app; that needs a route outside it
 * (see docs/security.md).
 */
@Injectable()
export class AppealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly moderation: ModerationService,
    private readonly policy: PolicyService,
    private readonly notices: ModerationNotices,
    private readonly targets: TargetsService,
  ) {}

  // ================================================================== the person ==

  /** Decisions about this person, and whether each can still be appealed. */
  async decisionsFor(
    userId: string,
    q: { cursor?: string | undefined; limit?: number | undefined },
  ) {
    const limit = clampLimit(q.limit);
    const c = decodeCursor(q.cursor, cursorSchema);
    const { appealWindowDays } = await this.policy.limits();
    const rows = await this.prisma.moderationAction.findMany({
      where: {
        targetUserId: userId,
        action: { in: APPEALABLE_ACTIONS.slice() },
        ...(c
          ? {
              OR: [
                { createdAt: { lt: new Date(c.t) } },
                { createdAt: new Date(c.t), id: { lt: c.id } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        policyReason: true,
        createdAt: true,
        reversedBy: { select: { id: true } },
        appeals: { select: { id: true, status: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const now = Date.now();
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.createdAt.toISOString(), id: r.id }),
      (r) => {
        const appeal = r.appeals[0] ?? null;
        const open = r.createdAt.getTime() + appealWindowDays * DAY > now;
        return {
          id: r.id,
          kind: plainKind(r.action),
          targetType: r.targetType,
          targetId: r.targetId,
          rule: reasonTitle(r.policyReason),
          decidedAt: r.createdAt.toISOString(),
          reversed: !!r.reversedBy,
          appeal: appeal ? { id: appeal.id, status: appeal.status } : null,
          canAppeal: !r.reversedBy && !appeal && open,
          appealUntil: new Date(r.createdAt.getTime() + appealWindowDays * DAY).toISOString(),
        };
      },
    );
  }

  async create(userId: string, input: { moderationActionId: string; reason: string }) {
    const action = await this.prisma.moderationAction.findFirst({
      where: { id: input.moderationActionId, targetUserId: userId },
      select: {
        id: true,
        action: true,
        createdAt: true,
        reversedBy: { select: { id: true } },
      },
    });
    // Someone else's decision looks the same as one that does not exist.
    if (!action) throw Errors.notFound('That decision');
    if (!APPEALABLE_ACTIONS.includes(action.action))
      throw Errors.conflict('That decision cannot be appealed.');
    if (action.reversedBy) throw Errors.conflict('That decision was already reversed.');
    const limits = await this.policy.limits();
    if (action.createdAt.getTime() + limits.appealWindowDays * DAY < Date.now())
      throw Errors.conflict('The time to appeal that decision has passed.');

    const kind: AppealKind = ACCOUNT_ACTIONS.includes(action.action) ? 'ACCOUNT' : 'MODERATION';
    let id: string;
    try {
      const created = await this.prisma.appeal.create({
        data: {
          userId,
          kind,
          moderationActionId: action.id,
          reason: input.reason.trim(),
          slaDueAt: new Date(Date.now() + limits.appealSlaHours * 3_600_000),
        },
        select: { id: true },
      });
      id = created.id;
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002')
        throw Errors.conflict('You have already appealed that decision.');
      throw e;
    }
    await this.notices.appealReceived(userId, id);
    return this.mine(userId, id);
  }

  private mineView(
    a: Prisma.AppealGetPayload<{
      include: {
        moderationAction: {
          select: {
            action: true;
            policyReason: true;
            targetType: true;
            targetId: true;
            createdAt: true;
          };
        };
      };
    }>,
  ) {
    return {
      id: a.id,
      kind: a.kind,
      status: a.status,
      reason: a.reason,
      decision: a.moderationAction
        ? {
            id: a.moderationActionId,
            kind: plainKind(a.moderationAction.action),
            rule: reasonTitle(a.moderationAction.policyReason),
            targetType: a.moderationAction.targetType,
            targetId: a.moderationAction.targetId,
            decidedAt: a.moderationAction.createdAt.toISOString(),
          }
        : null,
      // The reviewer's note is written for the person, and shown to them only once decided.
      outcomeNote: a.decidedAt ? a.decisionNote : null,
      createdAt: a.createdAt.toISOString(),
      decidedAt: a.decidedAt?.toISOString() ?? null,
    };
  }

  async mine(userId: string, id: string) {
    const a = await this.prisma.appeal.findFirst({
      where: { id, userId },
      include: {
        moderationAction: {
          select: {
            action: true,
            policyReason: true,
            targetType: true,
            targetId: true,
            createdAt: true,
          },
        },
      },
    });
    if (!a) throw Errors.notFound('Appeal');
    return this.mineView(a);
  }

  async listMine(userId: string, q: { cursor?: string | undefined; limit?: number | undefined }) {
    const limit = clampLimit(q.limit);
    const c = decodeCursor(q.cursor, cursorSchema);
    const rows = await this.prisma.appeal.findMany({
      where: {
        userId,
        ...(c
          ? {
              OR: [
                { createdAt: { lt: new Date(c.t) } },
                { createdAt: new Date(c.t), id: { lt: c.id } },
              ],
            }
          : {}),
      },
      include: {
        moderationAction: {
          select: {
            action: true,
            policyReason: true,
            targetType: true,
            targetId: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.createdAt.toISOString(), id: r.id }),
      (r) => this.mineView(r),
    );
  }

  // ===================================================================== staff ==

  private card(
    a: Prisma.AppealGetPayload<{
      include: {
        user: { select: { id: true; username: true; status: true } };
        assignedTo: { select: { id: true; name: true } };
        decidedBy: { select: { id: true; name: true } };
        moderationAction: {
          select: { action: true; policyReason: true; adminId: true; source: true };
        };
      };
    }>,
    now = new Date(),
  ) {
    return {
      id: a.id,
      kind: a.kind,
      status: a.status,
      user: a.user,
      decision: a.moderationAction
        ? {
            id: a.moderationActionId,
            action: a.moderationAction.action,
            source: a.moderationAction.source,
            policyTitle: reasonTitle(a.moderationAction.policyReason),
          }
        : null,
      assignedTo: a.assignedTo,
      decidedBy: a.decidedBy,
      createdAt: a.createdAt.toISOString(),
      slaDueAt: a.slaDueAt?.toISOString() ?? null,
      overdue: WAITING.includes(a.status) && !!a.slaDueAt && a.slaDueAt < now,
      decidedAt: a.decidedAt?.toISOString() ?? null,
    };
  }

  private static readonly include = {
    user: { select: { id: true, username: true, status: true } },
    assignedTo: { select: { id: true, name: true } },
    decidedBy: { select: { id: true, name: true } },
    moderationAction: {
      select: { action: true, policyReason: true, adminId: true, source: true },
    },
  } satisfies Prisma.AppealInclude;

  async list(
    actor: AdminAuthContext,
    q: {
      scope?: 'waiting' | 'decided' | 'all' | undefined;
      status?: AppealStatus | undefined;
      kind?: AppealKind | undefined;
      assignee?: string | undefined;
      overdue?: boolean | undefined;
      cursor?: string | undefined;
      limit?: number | undefined;
    },
  ) {
    const limit = clampLimit(q.limit);
    const scope = q.scope ?? 'waiting';
    const c = decodeCursor(q.cursor, cursorSchema);
    const now = new Date();
    // Waiting ones are worked oldest first; decided ones are read newest first.
    const oldestFirst = scope === 'waiting' && !q.status;
    const and: Prisma.AppealWhereInput[] = [];
    if (q.status) and.push({ status: q.status });
    else if (scope === 'waiting') and.push({ status: { in: WAITING } });
    else if (scope === 'decided')
      and.push({ status: { in: ['UPHELD', 'OVERTURNED', 'REJECTED'] } });
    if (q.kind) and.push({ kind: q.kind });
    if (q.overdue) and.push({ status: { in: WAITING }, slaDueAt: { lt: now } });
    if (q.assignee === 'me') and.push({ assignedToId: actor.adminId });
    else if (q.assignee === 'unassigned') and.push({ assignedToId: null });
    else if (q.assignee) and.push({ assignedToId: q.assignee });
    if (c) {
      const t = new Date(c.t);
      and.push(
        oldestFirst
          ? { OR: [{ createdAt: { gt: t } }, { createdAt: t, id: { gt: c.id } }] }
          : { OR: [{ createdAt: { lt: t } }, { createdAt: t, id: { lt: c.id } }] },
      );
    }
    const rows = await this.prisma.appeal.findMany({
      where: { AND: and },
      include: AppealsService.include,
      orderBy: oldestFirst
        ? [{ createdAt: 'asc' }, { id: 'asc' }]
        : [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.createdAt.toISOString(), id: r.id }),
      (r) => this.card(r, now),
    );
  }

  async get(actor: AdminAuthContext, id: string) {
    const a = await this.prisma.appeal.findUnique({
      where: { id },
      include: {
        ...AppealsService.include,
        moderationAction: {
          include: {
            admin: { select: { id: true, name: true } },
            report: { select: { id: true, category: true, description: true, status: true } },
            reversedBy: { select: { id: true } },
          },
        },
      },
    });
    if (!a) throw Errors.notFound('Appeal');
    const act = a.moderationAction;
    const target = act ? await this.targets.describe(act.targetType, act.targetId) : null;
    const madeByMe = !!act?.adminId && act.adminId === actor.adminId;
    const waiting = WAITING.includes(a.status);
    return {
      ...this.card({ ...a, moderationAction: act }),
      reason: a.reason,
      decisionNote: a.decisionNote,
      original: act
        ? {
            id: act.id,
            action: act.action,
            source: act.source,
            policyReason: act.policyReason,
            policyTitle: reasonTitle(act.policyReason),
            notes: act.notes,
            by: act.admin,
            at: act.createdAt.toISOString(),
            reversed: !!act.reversedBy,
            report: act.report,
          }
        : null,
      target,
      // So the console can say why a button is missing rather than silently hiding it.
      you: {
        madeTheOriginalDecision: madeByMe,
        canClaim:
          waiting && actor.permissions.has('appeals.decide') && !madeByMe && !a.assignedToId,
        canDecide:
          a.status === 'IN_REVIEW' &&
          a.assignedToId === actor.adminId &&
          actor.permissions.has('appeals.decide') &&
          !madeByMe,
      },
    };
  }

  /** Takes the appeal for review. Refused if this person made the decision being appealed. */
  async claim(actor: AdminAuthContext, id: string, meta: Meta) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM appeals WHERE id = ${id}::uuid FOR UPDATE`;
      const a = await tx.appeal.findUnique({
        where: { id },
        select: {
          status: true,
          assignedToId: true,
          moderationAction: { select: { adminId: true } },
        },
      });
      if (!a) throw Errors.notFound('Appeal');
      this.separation(actor, a.moderationAction?.adminId);
      if (!WAITING.includes(a.status))
        throw Errors.conflict('This appeal has already been decided.');
      if (a.assignedToId === actor.adminId) return;
      if (a.assignedToId) throw Errors.conflict('Someone else is already reviewing this appeal.');
      await tx.appeal.update({
        where: { id },
        data: { status: 'IN_REVIEW', assignedToId: actor.adminId },
      });
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'appeal.claim',
          targetType: 'appeal',
          targetId: id,
          ...meta,
        },
        tx,
      );
    });
    return this.get(actor, id);
  }

  async release(actor: AdminAuthContext, id: string, meta: Meta) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM appeals WHERE id = ${id}::uuid FOR UPDATE`;
      const a = await tx.appeal.findUnique({
        where: { id },
        select: { status: true, assignedToId: true },
      });
      if (!a) throw Errors.notFound('Appeal');
      if (a.status !== 'IN_REVIEW') return;
      if (a.assignedToId !== actor.adminId)
        throw Errors.conflict('Only the person reviewing an appeal can put it back.');
      await tx.appeal.update({ where: { id }, data: { status: 'OPEN', assignedToId: null } });
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'appeal.release',
          targetType: 'appeal',
          targetId: id,
          ...meta,
        },
        tx,
      );
    });
    return this.get(actor, id);
  }

  private separation(actor: AdminAuthContext, deciderOfOriginal: string | null | undefined) {
    if (deciderOfOriginal && deciderOfOriginal === actor.adminId) {
      throw Errors.forbidden(
        'You made the decision under appeal, so someone else has to review it.',
      );
    }
  }

  async decide(
    actor: AdminAuthContext,
    id: string,
    input: { decision: 'UPHELD' | 'OVERTURNED' | 'REJECTED'; note: string },
    meta: Meta,
  ) {
    const after: Array<() => Promise<void>> = [];
    const subject = await this.prisma.appeal.findUnique({
      where: { id },
      select: { userId: true, moderationActionId: true },
    });
    if (!subject) throw Errors.notFound('Appeal');
    // Needs the permission that undoes this kind of decision before anything is touched.
    const original =
      input.decision === 'OVERTURNED' && subject.moderationActionId
        ? await this.moderation.reversible(actor, subject.moderationActionId)
        : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM appeals WHERE id = ${id}::uuid FOR UPDATE`;
      const a = await tx.appeal.findUnique({
        where: { id },
        select: {
          status: true,
          assignedToId: true,
          moderationActionId: true,
          moderationAction: { select: { adminId: true } },
        },
      });
      if (!a) throw Errors.notFound('Appeal');
      this.separation(actor, a.moderationAction?.adminId);
      if (a.status !== 'IN_REVIEW')
        throw Errors.conflict(
          a.status === 'OPEN'
            ? 'Take this appeal before deciding it.'
            : 'This appeal has already been decided.',
        );
      if (a.assignedToId !== actor.adminId)
        throw Errors.conflict('Someone else is reviewing this appeal.');

      let reversalId: string | null = null;
      if (input.decision === 'OVERTURNED') {
        if (!original) throw Errors.conflict('There is no decision to overturn.');
        reversalId = await this.moderation.reverseWithin(
          tx,
          actor,
          original,
          input.note,
          SYSTEM_REASONS.appealOverturned,
          meta,
          after,
        );
      }
      await tx.appeal.update({
        where: { id },
        data: {
          status: input.decision,
          decidedById: actor.adminId,
          decidedAt: new Date(),
          decisionNote: input.note.trim(),
        },
      });
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: `appeal.${input.decision.toLowerCase()}`,
          targetType: 'appeal',
          targetId: id,
          reason: input.note,
          before: { status: a.status },
          after: { status: input.decision, reversalId },
          ...meta,
        },
        tx,
      );
    });
    after.push(() => this.notices.appealDecided(subject.userId, id, input.decision));
    for (const f of after) await f();
    return this.get(actor, id);
  }
}
