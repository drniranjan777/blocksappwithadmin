import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppUsersService, type StatusChange } from '../../admin/app-users/app-users.service.js';
import { AuditService } from '../../admin/audit/audit.service.js';
import { AdminPermissionsService } from '../../admin/rbac/admin-permissions.service.js';
import { Errors } from '../../common/errors/app-error.js';
import type { AdminAuthContext } from '../../common/http/request.js';
import { Page, clampLimit, decodeCursor } from '../../common/pagination/cursor.js';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  ModerationActionType,
  Prisma,
  ReportCategory,
  ReportStatus,
  ReportTargetType,
  Severity,
} from '../../generated/prisma/client.js';
import { ModerationNotices } from '../moderation-notices.js';
import {
  ACCOUNT_ACTIONS,
  ACTION_PERMISSIONS,
  REVERSIBLE_ACTIONS,
  type StaffAction,
  STAFF_ACTIONS,
  SYSTEM_REASONS,
  actionAllowedOn,
  reasonAllowedFor,
  reasonTitle,
  ruleByCode,
} from '../policy.js';
import { PolicyService } from '../policy/policy.service.js';
import { ACTIVE_STATUSES } from '../reports/reports.service.js';
import { TargetsService, isContentTarget } from '../targets.service.js';

interface Meta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

const queueCursor = z.object({ k: z.literal('q'), p: z.number(), t: z.string(), id: z.string() });
const recentCursor = z.object({ k: z.literal('r'), t: z.string(), id: z.string() });
const actionCursor = z.object({ t: z.string(), id: z.string() });

const reportInclude = {
  assignedTo: { select: { id: true, name: true } },
  reporter: { select: { id: true, username: true } },
  targetUser: { select: { id: true, username: true, status: true } },
} satisfies Prisma.ReportInclude;
type ReportRow = Prisma.ReportGetPayload<{ include: typeof reportInclude }>;

const isActive = (s: ReportStatus) => (ACTIVE_STATUSES as ReportStatus[]).includes(s);

const needs = (actor: AdminAuthContext, ...keys: string[]) => {
  const missing = keys.filter((k) => !actor.permissions.has(k));
  if (missing.length) throw Errors.forbidden('You do not have permission to do that.');
};

/**
 * The moderators' side: the queue, who is looking at what, the decisions, and taking them back.
 *
 * The rules this class keeps:
 *   - A decision names a published rule, and the rule has to fit the decision (you cannot remove
 *     something for "no violation").
 *   - One person works a report at a time. Taking it is atomic, and only the person holding it (or
 *     a senior, by reassigning it first) can decide it.
 *   - Each decision needs the permission for what it does on top of `reports.resolve`: a moderator
 *     can hide and remove content, but only a senior can suspend an account.
 *   - A decision is recorded, audited and applied in one transaction; people are told afterwards.
 *   - Nothing is erased. A mistake is taken back by a new decision that points at the old one, and
 *     only the most recent one on a given item can be taken back, so the history always reads true.
 *   - Escalated reports can only be decided by someone who holds `reports.escalate`.
 */
@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly targets: TargetsService,
    private readonly users: AppUsersService,
    private readonly notices: ModerationNotices,
    private readonly permissions: AdminPermissionsService,
    private readonly policy: PolicyService,
  ) {}

  // =========================================================================== reading ==

  private card(r: ReportRow, siblings: number, now = new Date()) {
    const snapshot = (r.evidence as { snapshot?: { excerpt?: string | null } } | null)?.snapshot;
    return {
      id: r.id,
      targetType: r.targetType,
      targetId: r.targetId,
      category: r.category,
      severity: r.severity,
      priority: r.priority,
      status: r.status,
      source: r.source,
      excerpt: snapshot?.excerpt?.slice(0, 140) ?? null,
      createdAt: r.createdAt.toISOString(),
      slaDueAt: r.slaDueAt?.toISOString() ?? null,
      overdue: isActive(r.status) && !!r.slaDueAt && r.slaDueAt < now,
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      assignedTo: r.assignedTo,
      reporter: r.reporter ? { username: r.reporter.username } : null,
      targetUser: r.targetUser ? { id: r.targetUser.id, username: r.targetUser.username } : null,
      reportsOnTarget: siblings,
    };
  }

  async queue(
    actor: AdminAuthContext,
    q: {
      scope?: 'active' | 'closed' | 'all' | undefined;
      status?: ReportStatus | undefined;
      severity?: Severity | undefined;
      category?: ReportCategory | undefined;
      targetType?: ReportTargetType | undefined;
      targetUserId?: string | undefined;
      source?: 'USER' | 'AUTOMATED' | 'ADMIN' | undefined;
      assignee?: string | undefined;
      overdue?: boolean | undefined;
      sort?: 'queue' | 'recent' | undefined;
      cursor?: string | undefined;
      limit?: number | undefined;
    },
  ) {
    const limit = clampLimit(q.limit);
    const scope = q.scope ?? 'active';
    const sort = q.sort ?? (scope === 'active' ? 'queue' : 'recent');
    const now = new Date();
    const and: Prisma.ReportWhereInput[] = [];
    if (q.status) and.push({ status: q.status });
    else if (scope === 'active') and.push({ status: { in: ACTIVE_STATUSES } });
    else if (scope === 'closed') and.push({ status: { in: ['RESOLVED', 'DISMISSED'] } });
    if (q.overdue) and.push({ status: { in: ACTIVE_STATUSES }, slaDueAt: { lt: now } });
    if (q.severity) and.push({ severity: q.severity });
    if (q.category) and.push({ category: q.category });
    if (q.targetType) and.push({ targetType: q.targetType });
    if (q.targetUserId) and.push({ targetUserId: q.targetUserId });
    if (q.source) and.push({ source: q.source });
    if (q.assignee === 'me') and.push({ assignedToId: actor.adminId });
    else if (q.assignee === 'unassigned') and.push({ assignedToId: null });
    else if (q.assignee) and.push({ assignedToId: q.assignee });

    if (sort === 'queue') {
      const c = decodeCursor(q.cursor, queueCursor);
      if (c) {
        const t = new Date(c.t);
        and.push({
          OR: [
            { priority: { lt: c.p } },
            { priority: c.p, createdAt: { gt: t } },
            { priority: c.p, createdAt: t, id: { gt: c.id } },
          ],
        });
      }
    } else {
      const c = decodeCursor(q.cursor, recentCursor);
      if (c) {
        const t = new Date(c.t);
        and.push({ OR: [{ createdAt: { lt: t } }, { createdAt: t, id: { lt: c.id } }] });
      }
    }
    const rows = await this.prisma.report.findMany({
      where: { AND: and },
      include: reportInclude,
      orderBy:
        sort === 'queue'
          ? [{ priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }]
          : [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const counts = page.length
      ? await this.prisma.report.groupBy({
          by: ['targetType', 'targetId'],
          where: {
            status: { in: ACTIVE_STATUSES },
            OR: page.map((r) => ({ targetType: r.targetType, targetId: r.targetId })),
          },
          _count: { _all: true },
        })
      : [];
    const sibs = new Map(counts.map((c) => [`${c.targetType}:${c.targetId}`, c._count._all]));
    return Page.fromRows(
      rows,
      limit,
      (r): Record<string, string | number> =>
        sort === 'queue'
          ? { k: 'q', p: r.priority, t: r.createdAt.toISOString(), id: r.id }
          : { k: 'r', t: r.createdAt.toISOString(), id: r.id },
      (r) => this.card(r, sibs.get(`${r.targetType}:${r.targetId}`) ?? 0, now),
    );
  }

  /** What the console's front page of moderation shows, limited to what this person may see. */
  async summary(actor: AdminAuthContext) {
    const now = new Date();
    const [byStatus, bySeverity, overdue, unassigned, mine, resolvedToday] = await Promise.all([
      this.prisma.report.groupBy({
        by: ['status'],
        where: { status: { in: ACTIVE_STATUSES } },
        _count: { _all: true },
      }),
      this.prisma.report.groupBy({
        by: ['severity'],
        where: { status: { in: ACTIVE_STATUSES } },
        _count: { _all: true },
      }),
      this.prisma.report.count({
        where: { status: { in: ACTIVE_STATUSES }, slaDueAt: { lt: now } },
      }),
      this.prisma.report.count({ where: { status: { in: ACTIVE_STATUSES }, assignedToId: null } }),
      this.prisma.report.count({
        where: { status: { in: ACTIVE_STATUSES }, assignedToId: actor.adminId },
      }),
      this.prisma.report.count({
        where: {
          status: { in: ['RESOLVED', 'DISMISSED'] },
          resolvedAt: { gte: new Date(now.getTime() - 24 * 3_600_000) },
        },
      }),
    ]);
    const n = (s: ReportStatus) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
    const sev = (s: Severity) => bySeverity.find((b) => b.severity === s)?._count._all ?? 0;
    const [appeals, incidents, live] = await Promise.all([
      actor.permissions.has('appeals.read')
        ? Promise.all([
            this.prisma.appeal.count({ where: { status: 'OPEN' } }),
            this.prisma.appeal.count({ where: { status: 'IN_REVIEW' } }),
            this.prisma.appeal.count({
              where: { status: { in: ['OPEN', 'IN_REVIEW'] }, slaDueAt: { lt: now } },
            }),
          ]).then(([open, inReview, late]) => ({ open, inReview, overdue: late }))
        : null,
      actor.permissions.has('safety.incidents.read')
        ? Promise.all([
            this.prisma.safetyIncident.count({ where: { status: 'OPEN' } }),
            this.prisma.safetyIncident.count({ where: { status: 'ESCALATED' } }),
          ]).then(([open, escalated]) => ({ open, escalated }))
        : null,
      actor.permissions.has('live.read')
        ? this.prisma.liveSession.count({ where: { status: 'LIVE' } }).then((live) => ({ live }))
        : null,
    ]);
    return {
      reports: {
        active: n('OPEN') + n('IN_REVIEW') + n('ESCALATED'),
        open: n('OPEN'),
        inReview: n('IN_REVIEW'),
        escalated: n('ESCALATED'),
        bySeverity: {
          CRITICAL: sev('CRITICAL'),
          HIGH: sev('HIGH'),
          MEDIUM: sev('MEDIUM'),
          LOW: sev('LOW'),
        },
        overdue,
        unassigned,
        mine,
        resolvedLast24h: resolvedToday,
      },
      appeals,
      incidents,
      live,
    };
  }

  async detail(actor: AdminAuthContext, id: string) {
    const r = await this.prisma.report.findUnique({ where: { id }, include: reportInclude });
    if (!r) throw Errors.notFound('Report');
    const [target, siblings, history, standing] = await Promise.all([
      this.targets.describe(r.targetType, r.targetId),
      this.prisma.report.findMany({
        where: { targetType: r.targetType, targetId: r.targetId, id: { not: id } },
        select: {
          id: true,
          category: true,
          status: true,
          source: true,
          createdAt: true,
          description: true,
          reporter: { select: { username: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.history({ targetType: r.targetType, targetId: r.targetId, userId: r.targetUserId }),
      r.targetUserId ? this.standing(r.targetUserId) : null,
    ]);
    const evidence = (r.evidence ?? {}) as {
      refs?: unknown[];
      snapshot?: { excerpt?: string | null; ownerUsername?: string; capturedAt?: string };
    };
    const siblingCount =
      siblings.filter((s) => isActive(s.status)).length + (isActive(r.status) ? 1 : 0);
    return {
      ...this.card(r, siblingCount),
      description: r.description,
      resolution: r.resolution,
      evidence: { refs: evidence.refs ?? [], snapshot: evidence.snapshot ?? null },
      target,
      standing,
      otherReports: siblings.map((s) => ({
        id: s.id,
        category: s.category,
        status: s.status,
        source: s.source,
        description: s.description,
        reporter: s.reporter ? { username: s.reporter.username } : null,
        createdAt: s.createdAt.toISOString(),
      })),
      history,
      allowed: this.allowedFor(actor, r),
    };
  }

  /** What this person can do with this report right now, so the console shows only real options. */
  private allowedFor(actor: AdminAuthContext, r: ReportRow) {
    const active = isActive(r.status);
    const senior = actor.permissions.has('reports.escalate');
    const mineOrFree = !r.assignedToId || r.assignedToId === actor.adminId;
    const canWork =
      active &&
      actor.permissions.has('reports.resolve') &&
      mineOrFree &&
      (r.status !== 'ESCALATED' || senior);
    return {
      claim:
        active &&
        actor.permissions.has('reports.assign') &&
        !r.assignedToId &&
        (r.status !== 'ESCALATED' || senior),
      release: active && !!r.assignedToId && (r.assignedToId === actor.adminId || senior),
      escalate: canWork && r.status !== 'ESCALATED',
      actions: canWork
        ? STAFF_ACTIONS.filter(
            (a) =>
              actionAllowedOn(a, r.targetType) &&
              ACTION_PERMISSIONS[a].every((p) => actor.permissions.has(p)),
          )
        : [],
    };
  }

  /** How things stand with an account: what has been done about it and what has been said of it. */
  private async standing(userId: string) {
    const since = new Date(Date.now() - 90 * 24 * 3_600_000);
    const [user, reportsAgainst, recent, last] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, status: true, createdAt: true, riskLevel: true },
      }),
      this.prisma.report.count({ where: { targetUserId: userId } }),
      this.prisma.moderationAction.groupBy({
        by: ['action'],
        where: {
          targetUserId: userId,
          createdAt: { gte: since },
          action: { in: ['WARN', 'RESTRICT', 'REMOVE', 'RESTRICT_USER', 'SUSPEND_USER'] },
        },
        _count: { _all: true },
      }),
      this.prisma.moderationAction.findFirst({
        where: { targetUserId: userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);
    if (!user) return null;
    const n = (a: ModerationActionType) => recent.find((x) => x.action === a)?._count._all ?? 0;
    return {
      user: { id: user.id, username: user.username, status: user.status, risk: user.riskLevel },
      memberSince: user.createdAt.toISOString(),
      reportsAgainst,
      last90Days: {
        warnings: n('WARN'),
        restricted: n('RESTRICT'),
        removed: n('REMOVE'),
        accountRestrictions: n('RESTRICT_USER'),
        suspensions: n('SUSPEND_USER'),
      },
      lastActionAt: last?.createdAt.toISOString() ?? null,
    };
  }

  // ---------------------------------------------------------------------- history --

  private actionView(
    a: Prisma.ModerationActionGetPayload<{
      include: {
        admin: { select: { id: true; name: true } };
        reversedBy: { select: { id: true } };
        appeals: { select: { id: true; status: true } };
      };
    }>,
  ) {
    return {
      id: a.id,
      action: a.action,
      source: a.source,
      targetType: a.targetType,
      targetId: a.targetId,
      targetUserId: a.targetUserId,
      reportId: a.reportId,
      policyReason: a.policyReason,
      policyTitle: reasonTitle(a.policyReason),
      notes: a.notes,
      by: a.admin ? { id: a.admin.id, name: a.admin.name } : null,
      reversalOfId: a.reversalOfId,
      reversed: !!a.reversedBy,
      appeal: a.appeals[0] ? { id: a.appeals[0].id, status: a.appeals[0].status } : null,
      createdAt: a.createdAt.toISOString(),
    };
  }

  /** The decisions about one item and about everything its owner has been the subject of, newest first. */
  async history(o: {
    targetType?: ReportTargetType | undefined;
    targetId?: string | undefined;
    userId?: string | null | undefined;
    limit?: number;
  }) {
    const or: Prisma.ModerationActionWhereInput[] = [];
    if (o.targetType && o.targetId) or.push({ targetType: o.targetType, targetId: o.targetId });
    if (o.userId) or.push({ targetUserId: o.userId });
    if (!or.length) return [];
    const rows = await this.prisma.moderationAction.findMany({
      where: { OR: or },
      include: {
        admin: { select: { id: true, name: true } },
        reversedBy: { select: { id: true } },
        appeals: { select: { id: true, status: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: o.limit ?? 50,
    });
    return rows.map((a) => this.actionView(a));
  }

  /** The action log, filterable, for the page that audits moderation itself. */
  async actions(q: {
    adminId?: string | undefined;
    action?: ModerationActionType | undefined;
    targetUserId?: string | undefined;
    source?: 'ADMIN' | 'AUTOMATED' | 'USER' | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
  }) {
    const limit = clampLimit(q.limit);
    const c = decodeCursor(q.cursor, actionCursor);
    const rows = await this.prisma.moderationAction.findMany({
      where: {
        ...(q.adminId ? { adminId: q.adminId } : {}),
        ...(q.action ? { action: q.action } : {}),
        ...(q.targetUserId ? { targetUserId: q.targetUserId } : {}),
        ...(q.source ? { source: q.source } : {}),
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
        admin: { select: { id: true, name: true } },
        reversedBy: { select: { id: true } },
        appeals: { select: { id: true, status: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.createdAt.toISOString(), id: r.id }),
      (r) => this.actionView(r),
    );
  }

  // ======================================================================== working it ==

  /** Locks the report for the rest of the transaction and returns it. */
  private async lock(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM reports WHERE id = ${id}::uuid FOR UPDATE`;
    const r = await tx.report.findUnique({ where: { id } });
    if (!r) throw Errors.notFound('Report');
    return r;
  }

  private audited(
    tx: Prisma.TransactionClient,
    actor: AdminAuthContext,
    action: string,
    reportId: string,
    meta: Meta,
    extra: { reason?: string; before?: unknown; after?: unknown } = {},
  ) {
    return this.audit.record(
      {
        actorType: 'ADMIN',
        actorId: actor.adminId,
        actorLabel: actor.name,
        action,
        targetType: 'report',
        targetId: reportId,
        ...extra,
        ...meta,
      },
      tx,
    );
  }

  /** A staff member flags something themselves; it joins the same queue as everyone's reports. */
  async createFromStaff(
    actor: AdminAuthContext,
    input: {
      targetType: ReportTargetType;
      targetId: string;
      category: ReportCategory;
      description?: string | undefined;
    },
    meta: Meta,
  ) {
    const thing = await this.targets.forReport(null, input.targetType, input.targetId);
    const cat = await this.policy.categoryPolicy(input.category);
    const id = await this.prisma.$transaction(async (tx) => {
      const report = await tx.report.create({
        data: {
          reporterId: null,
          source: 'ADMIN',
          targetType: input.targetType,
          targetId: input.targetId,
          targetUserId: thing.ownerId,
          category: input.category,
          description: input.description?.trim() || null,
          evidence: {
            refs: [],
            snapshot: {
              excerpt: thing.excerpt,
              ownerUsername: thing.ownerUsername,
              capturedAt: new Date().toISOString(),
            },
          },
          severity: cat.severity,
          slaDueAt: new Date(Date.now() + cat.slaHours * 3_600_000),
          priority:
            cat.severity === 'CRITICAL'
              ? 60
              : cat.severity === 'HIGH'
                ? 40
                : cat.severity === 'MEDIUM'
                  ? 20
                  : 0,
        },
        select: { id: true },
      });
      await this.audited(tx, actor, 'report.create', report.id, meta, {
        after: { targetType: input.targetType, category: input.category },
      });
      return report.id;
    });
    return this.detail(actor, id);
  }

  async claim(actor: AdminAuthContext, id: string, meta: Meta) {
    await this.prisma.$transaction(async (tx) => {
      const r = await this.lock(tx, id);
      if (!isActive(r.status)) throw Errors.conflict('This report is already closed.');
      if (r.status === 'ESCALATED') needs(actor, 'reports.escalate');
      if (r.assignedToId === actor.adminId) return; // already yours: taking it again changes nothing
      if (r.assignedToId)
        throw Errors.conflict('Someone else is already looking at this report.', 'CONFLICT', {
          assignedToId: r.assignedToId,
        });
      await tx.report.update({
        where: { id },
        data: {
          assignedToId: actor.adminId,
          status: r.status === 'ESCALATED' ? 'ESCALATED' : 'IN_REVIEW',
        },
      });
      await this.audited(tx, actor, 'report.claim', id, meta, {
        before: { status: r.status },
      });
    });
    return this.detail(actor, id);
  }

  async assign(actor: AdminAuthContext, id: string, adminId: string, meta: Meta) {
    const target = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
      select: { id: true, status: true, name: true },
    });
    if (!target || target.status !== 'ACTIVE')
      throw Errors.validation([{ field: 'adminId', reasons: ['not_active_staff'] }]);
    const access = await this.permissions.accessFor(adminId);
    await this.prisma.$transaction(async (tx) => {
      const r = await this.lock(tx, id);
      if (!isActive(r.status)) throw Errors.conflict('This report is already closed.');
      const needed =
        r.status === 'ESCALATED' ? ['reports.resolve', 'reports.escalate'] : ['reports.resolve'];
      if (!needed.every((k) => (access.permissions as Set<string>).has(k)))
        throw Errors.validation([{ field: 'adminId', reasons: ['cannot_handle_this_report'] }]);
      // Taking a report off a colleague is for seniors; handing out an unassigned one is for anyone who triages.
      if (r.assignedToId && r.assignedToId !== actor.adminId) needs(actor, 'reports.escalate');
      await tx.report.update({
        where: { id },
        data: {
          assignedToId: adminId,
          status: r.status === 'ESCALATED' ? 'ESCALATED' : 'IN_REVIEW',
        },
      });
      await this.audited(tx, actor, 'report.assign', id, meta, {
        before: { assignedToId: r.assignedToId },
        after: { assignedToId: adminId },
      });
    });
    return this.detail(actor, id);
  }

  async release(actor: AdminAuthContext, id: string, meta: Meta) {
    await this.prisma.$transaction(async (tx) => {
      const r = await this.lock(tx, id);
      if (!isActive(r.status)) throw Errors.conflict('This report is already closed.');
      if (!r.assignedToId) return;
      if (r.assignedToId !== actor.adminId) needs(actor, 'reports.escalate');
      await tx.report.update({
        where: { id },
        data: { assignedToId: null, status: r.status === 'ESCALATED' ? 'ESCALATED' : 'OPEN' },
      });
      await this.audited(tx, actor, 'report.release', id, meta, {
        before: { assignedToId: r.assignedToId },
      });
    });
    return this.detail(actor, id);
  }

  /** Hands a report to the senior queue when it needs more than this person can decide. */
  async escalate(actor: AdminAuthContext, id: string, reason: string, meta: Meta) {
    await this.prisma.$transaction(async (tx) => {
      const r = await this.lock(tx, id);
      if (!isActive(r.status)) throw Errors.conflict('This report is already closed.');
      if (r.status === 'ESCALATED') throw Errors.conflict('This report is already escalated.');
      if (r.assignedToId && r.assignedToId !== actor.adminId)
        throw Errors.conflict('Someone else is looking at this report.');
      await tx.report.update({
        where: { id },
        data: {
          status: 'ESCALATED',
          assignedToId: null,
          priority: Math.min(r.priority + 10, 1000),
        },
      });
      await tx.moderationAction.create({
        data: {
          reportId: id,
          adminId: actor.adminId,
          source: 'ADMIN',
          targetType: r.targetType,
          targetId: r.targetId,
          targetUserId: r.targetUserId,
          action: 'ESCALATE',
          policyReason: SYSTEM_REASONS.seniorReview,
          notes: reason.trim().slice(0, 1000),
        },
      });
      await this.audited(tx, actor, 'report.escalate', id, meta, {
        reason,
        before: { status: r.status },
        after: { status: 'ESCALATED' },
      });
    });
    return this.detail(actor, id);
  }

  // ----------------------------------------------------------------------- deciding --

  async act(
    actor: AdminAuthContext,
    id: string,
    input: { action: StaffAction; policyReason: string; notes?: string | undefined },
    meta: Meta,
  ) {
    const { action, policyReason } = input;
    needs(actor, 'reports.resolve', ...ACTION_PERMISSIONS[action]);
    if (!ruleByCode(policyReason) || !reasonAllowedFor(action, policyReason)) {
      throw Errors.validation([{ field: 'policyReason', reasons: ['does_not_fit_this_decision'] }]);
    }
    const notes = input.notes?.trim() || undefined;
    const after: Array<() => Promise<void>> = [];

    await this.prisma.$transaction(async (tx) => {
      const r = await this.lock(tx, id);
      if (!isActive(r.status)) throw Errors.conflict('This report is already closed.');
      if (r.status === 'ESCALATED') needs(actor, 'reports.escalate');
      if (r.assignedToId && r.assignedToId !== actor.adminId)
        throw Errors.conflict('Someone else is looking at this report.', 'CONFLICT', {
          assignedToId: r.assignedToId,
        });
      if (!actionAllowedOn(action, r.targetType)) {
        throw Errors.validation([{ field: 'action', reasons: ['not_possible_on_this_kind'] }]);
      }
      const ownerId = r.targetUserId;
      const dismissing = action === 'APPROVE' || action === 'DISMISS_REPORT';
      let actionId: string | null = null;

      switch (action) {
        case 'APPROVE': {
          if (!isContentTarget(r.targetType)) break;
          const held = await this.currentHold(tx, r.targetType, r.targetId);
          if (held && held.source !== 'AUTOMATED')
            throw Errors.conflict(
              'A moderator restricted this on purpose. If that was a mistake, reverse that decision.',
            );
          if (held) {
            actionId = await this.releaseHold(tx, actor, r, held, policyReason, notes, after);
          }
          break;
        }
        case 'DISMISS_REPORT':
          // Nothing is done to the item; whether an automatic hold is lifted is decided below,
          // once we know whether anything else is still waiting on it.
          break;
        case 'RESTRICT':
        case 'REMOVE': {
          if (!isContentTarget(r.targetType)) break;
          const to = action === 'RESTRICT' ? 'RESTRICTED' : 'REMOVED';
          const moved = await this.targets.setState(tx, r.targetType, r.targetId, to);
          if (!moved.changed)
            throw Errors.conflict(
              `This is already ${to === 'REMOVED' ? 'removed' : 'restricted'}.`,
            );
          const rec = await tx.moderationAction.create({
            data: {
              reportId: id,
              adminId: actor.adminId,
              source: 'ADMIN',
              targetType: r.targetType,
              targetId: r.targetId,
              targetUserId: moved.ownerId,
              action,
              policyReason,
              notes: notes ?? null,
            },
            select: { id: true },
          });
          actionId = rec.id;
          after.push(() =>
            this.notices.contentDecision(
              moved.ownerId,
              action === 'REMOVE' ? 'removed' : 'restricted',
              r.targetType,
              policyReason,
              rec.id,
              r.targetId,
            ),
          );
          break;
        }
        case 'WARN': {
          if (!ownerId) throw Errors.conflict('There is nobody to warn.');
          const rec = await tx.moderationAction.create({
            data: {
              reportId: id,
              adminId: actor.adminId,
              source: 'ADMIN',
              targetType: r.targetType,
              targetId: r.targetId,
              targetUserId: ownerId,
              action: 'WARN',
              policyReason,
              notes: notes ?? null,
            },
            select: { id: true },
          });
          actionId = rec.id;
          after.push(() =>
            this.notices.contentDecision(
              ownerId,
              'warning',
              r.targetType,
              policyReason,
              rec.id,
              r.targetId,
            ),
          );
          break;
        }
        case 'RESTRICT_USER':
        case 'SUSPEND_USER': {
          if (!ownerId) throw Errors.conflict('There is no account to act on.');
          const change = await this.users.applyStatusChange(
            tx,
            actor,
            ownerId,
            action === 'SUSPEND_USER' ? 'suspend' : 'restrict',
            notes ?? reasonTitle(policyReason),
            meta,
            { policyReason, reportId: id },
          );
          actionId = change.actionId;
          after.push(() => this.users.afterStatusChange(ownerId, change));
          break;
        }
      }

      // A review that found nothing to do is still a decision, and is kept as one.
      if (!actionId) {
        const rec = await tx.moderationAction.create({
          data: {
            reportId: id,
            adminId: actor.adminId,
            source: 'ADMIN',
            targetType: r.targetType,
            targetId: r.targetId,
            targetUserId: ownerId,
            action,
            policyReason,
            notes: notes ?? null,
          },
          select: { id: true },
        });
        actionId = rec.id;
      }

      // ---- close this report, and the others the same decision answers ----------------
      const now = new Date();
      const resolution = (notes ?? reasonTitle(policyReason)).slice(0, 500);
      const closeAs: ReportStatus = dismissing ? 'DISMISSED' : 'RESOLVED';
      await tx.report.update({
        where: { id },
        data: { status: closeAs, resolvedAt: now, assignedToId: actor.adminId, resolution },
      });
      const sweeping = action === 'REMOVE' || action === 'SUSPEND_USER';
      const others = await tx.report.findMany({
        where: {
          targetType: r.targetType,
          targetId: r.targetId,
          id: { not: id },
          status: { in: ACTIVE_STATUSES },
          OR: [{ assignedToId: null }, { assignedToId: actor.adminId }],
          ...(sweeping ? {} : { category: r.category }),
        },
        select: { id: true, reporterId: true },
      });
      if (others.length) {
        await tx.report.updateMany({
          where: { id: { in: others.map((o) => o.id) } },
          data: {
            status: closeAs,
            resolvedAt: now,
            resolution: `Decided together with report ${id}.`,
          },
        });
      }
      const outcome = dismissing ? 'no_violation' : 'action_taken';
      for (const c of [{ id, reporterId: r.reporterId }, ...others]) {
        const reporterId = c.reporterId;
        if (reporterId) after.push(() => this.notices.reportOutcome(reporterId, c.id, outcome));
      }

      // A dismissal lifts an automatic hold only if nothing else is still waiting on the item.
      if (action === 'DISMISS_REPORT' && isContentTarget(r.targetType)) {
        const waiting = await tx.report.count({
          where: {
            targetType: r.targetType,
            targetId: r.targetId,
            status: { in: ACTIVE_STATUSES },
          },
        });
        const held = waiting === 0 ? await this.currentHold(tx, r.targetType, r.targetId) : null;
        if (held?.source === 'AUTOMATED') {
          await this.releaseHold(tx, actor, r, held, 'no_violation', notes, after, false);
        }
      }

      await this.audited(tx, actor, `moderation.${action.toLowerCase()}`, id, meta, {
        ...(notes ? { reason: notes } : {}),
        before: { status: r.status },
        after: {
          status: closeAs,
          policyReason,
          moderationActionId: actionId,
          alsoClosed: others.length,
          target: `${r.targetType}:${r.targetId}`,
        },
      });
    });
    for (const f of after) await f();
    return this.detail(actor, id);
  }

  /** The decision that currently keeps an item hidden or removed, if there is one. */
  private async currentHold(
    tx: Prisma.TransactionClient,
    type: ReportTargetType,
    targetId: string,
  ) {
    return tx.moderationAction.findFirst({
      where: {
        targetType: type,
        targetId,
        action: { in: ['RESTRICT', 'REMOVE'] },
        reversedBy: null,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, source: true, action: true, targetUserId: true },
    });
  }

  /** Lifts a hold (the report's own action row records it as the reversal). Returns that row's id. */
  private async releaseHold(
    tx: Prisma.TransactionClient,
    actor: AdminAuthContext,
    report: { id: string; targetType: ReportTargetType; targetId: string },
    hold: { id: string; targetUserId: string | null; action: ModerationActionType },
    policyReason: string,
    notes: string | undefined,
    after: Array<() => Promise<void>>,
    linkToReport = true,
  ): Promise<string> {
    if (!isContentTarget(report.targetType)) throw Errors.conflict('Nothing to lift here.');
    const moved = await this.targets.setState(tx, report.targetType, report.targetId, 'APPROVED', {
      expectFrom: hold.action === 'REMOVE' ? 'REMOVED' : 'RESTRICTED',
    });
    const rec = await tx.moderationAction.create({
      data: {
        reportId: linkToReport ? report.id : null,
        adminId: actor.adminId,
        source: 'ADMIN',
        targetType: report.targetType,
        targetId: report.targetId,
        targetUserId: moved.ownerId,
        action: linkToReport ? 'APPROVE' : 'RESTORE',
        policyReason,
        notes: notes ?? null,
        reversalOfId: hold.id,
      },
      select: { id: true },
    });
    after.push(() =>
      this.notices.contentDecision(
        moved.ownerId,
        'restored',
        report.targetType,
        policyReason,
        rec.id,
        report.targetId,
      ),
    );
    return rec.id;
  }

  // ----------------------------------------------------------------------- reversing --

  /**
   * Takes a decision back. Only the latest decision on an item can be undone (so the history stays
   * a true account of what happened), and it needs the permission that undoes that kind of
   * decision. If the person had appealed it, the appeal is closed as overturned.
   */
  async reverse(actor: AdminAuthContext, actionId: string, reason: string, meta: Meta) {
    const a = await this.reversible(actor, actionId);
    const after: Array<() => Promise<void>> = [];
    let closed: { id: string; userId: string } | null = null;
    await this.prisma.$transaction(async (tx) => {
      const recId = await this.reverseWithin(
        tx,
        actor,
        a,
        reason,
        SYSTEM_REASONS.reversal,
        meta,
        after,
      );
      // An appeal still waiting is answered by this: the decision it asked to undo is undone.
      const appeal = await tx.appeal.findUnique({
        where: { moderationActionId: a.id },
        select: { id: true, userId: true, status: true },
      });
      if (appeal && (appeal.status === 'OPEN' || appeal.status === 'IN_REVIEW')) {
        await tx.appeal.update({
          where: { id: appeal.id },
          data: {
            status: 'OVERTURNED',
            decidedAt: new Date(),
            decisionNote: 'The decision was taken back before the appeal was reviewed.',
          },
        });
        closed = { id: appeal.id, userId: appeal.userId };
      }
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'moderation.reverse',
          targetType: 'moderation_action',
          targetId: a.id,
          reason,
          before: { action: a.action },
          after: { reversalId: recId, appealClosed: (closed as { id: string } | null)?.id ?? null },
          ...meta,
        },
        tx,
      );
    });
    const done = closed as { id: string; userId: string } | null;
    if (done) after.push(() => this.notices.appealDecided(done.userId, done.id, 'OVERTURNED'));
    for (const f of after) await f();
    const view = await this.prisma.moderationAction.findUniqueOrThrow({
      where: { id: actionId },
      include: {
        admin: { select: { id: true, name: true } },
        reversedBy: { select: { id: true } },
        appeals: { select: { id: true, status: true } },
      },
    });
    return this.actionView(view);
  }

  /** The decision, if it can be taken back by this person. */
  async reversible(actor: AdminAuthContext, actionId: string) {
    const a = await this.prisma.moderationAction.findUnique({
      where: { id: actionId },
      include: { reversedBy: { select: { id: true } } },
    });
    if (!a) throw Errors.notFound('Decision');
    if (!REVERSIBLE_ACTIONS.includes(a.action))
      throw Errors.conflict('This kind of decision cannot be taken back.');
    if (a.reversedBy) throw Errors.conflict('This decision was already taken back.');
    needs(actor, ACCOUNT_ACTIONS.includes(a.action) ? 'users.restore' : 'content.restore');
    return a;
  }

  /**
   * Undoes `a` inside the caller's transaction and returns the id of the decision that records it.
   * Used for a direct reversal and for an appeal that is overturned, so both undo things the same way.
   */
  async reverseWithin(
    tx: Prisma.TransactionClient,
    actor: AdminAuthContext,
    a: Prisma.ModerationActionGetPayload<object>,
    reason: string,
    policyReason: string,
    meta: Meta,
    after: Array<() => Promise<void>>,
  ): Promise<string> {
    const account = ACCOUNT_ACTIONS.includes(a.action);
    // Only the latest decision on the same item (or account) can be undone.
    const newer = await tx.moderationAction.findFirst({
      where: {
        id: { not: a.id },
        createdAt: { gt: a.createdAt },
        reversedBy: null,
        action: {
          in: account
            ? ACCOUNT_ACTIONS.slice()
            : (['RESTRICT', 'REMOVE', 'WARN'] as ModerationActionType[]),
        },
        ...(account
          ? { targetType: 'USER', targetUserId: a.targetUserId }
          : { targetType: a.targetType, targetId: a.targetId }),
      },
      select: { id: true },
    });
    if (newer) throw Errors.conflict('A later decision exists. Take that one back first.');

    if (account) {
      if (!a.targetUserId) throw Errors.conflict('There is no account to restore.');
      const userId = a.targetUserId;
      const change: StatusChange = await this.users.applyStatusChange(
        tx,
        actor,
        userId,
        'restore',
        reason,
        meta,
        { policyReason, reversalOfId: a.id },
      );
      after.push(() => this.users.afterStatusChange(userId, change));
      return change.actionId;
    }
    if (a.action !== 'WARN' && isContentTarget(a.targetType)) {
      // Taking back a removal returns the item to where an earlier, still-standing decision left
      // it: if it was hidden before it was removed, it is hidden again, not public.
      const earlier =
        a.action === 'REMOVE'
          ? await tx.moderationAction.findFirst({
              where: {
                id: { not: a.id },
                createdAt: { lt: a.createdAt },
                reversedBy: null,
                action: 'RESTRICT',
                targetType: a.targetType,
                targetId: a.targetId,
              },
              select: { id: true },
            })
          : null;
      await this.targets.setState(
        tx,
        a.targetType,
        a.targetId,
        earlier ? 'RESTRICTED' : 'APPROVED',
        { expectFrom: a.action === 'REMOVE' ? 'REMOVED' : 'RESTRICTED' },
      );
    }
    const rec = await tx.moderationAction.create({
      data: {
        reportId: null,
        adminId: actor.adminId,
        source: 'ADMIN',
        targetType: a.targetType,
        targetId: a.targetId,
        targetUserId: a.targetUserId,
        action: 'RESTORE',
        policyReason,
        notes: reason.trim().slice(0, 1000),
        reversalOfId: a.id,
      },
      select: { id: true },
    });
    if (a.targetUserId && a.action !== 'WARN') {
      const owner = a.targetUserId;
      after.push(() =>
        this.notices.contentDecision(
          owner,
          'restored',
          a.targetType,
          policyReason,
          rec.id,
          a.targetId,
        ),
      );
    }
    return rec.id;
  }
}
