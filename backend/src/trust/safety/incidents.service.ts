import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../../admin/audit/audit.service.js';
import { AdminPermissionsService } from '../../admin/rbac/admin-permissions.service.js';
import { Errors } from '../../common/errors/app-error.js';
import type { AdminAuthContext } from '../../common/http/request.js';
import { Page, clampLimit, decodeCursor } from '../../common/pagination/cursor.js';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  IncidentEventKind,
  IncidentStatus,
  IncidentType,
  Prisma,
  ReportCategory,
  Severity,
} from '../../generated/prisma/client.js';

const cursorSchema = z.object({ t: z.string(), id: z.string() });

interface Meta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

/** The reports that are never just a queue item: somebody may be in danger. */
const INCIDENT_CATEGORIES: Partial<Record<ReportCategory, IncidentType>> = {
  SELF_HARM: 'SELF_HARM',
  CHILD_SAFETY: 'CHILD_SAFETY',
};

const include = {
  user: { select: { id: true, username: true, status: true } },
  owner: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.SafetyIncidentInclude;

type IncidentRow = Prisma.SafetyIncidentGetPayload<{ include: typeof include }>;

/**
 * Safety incidents: the cases where a person may be in danger (self-harm, violence, a child at
 * risk, a scam in progress) and the response has to be recorded.
 *
 * What is built is the record and the workflow: who raised it, who owns it, every note and
 * escalation in order, and the outcome. What is not built is any connection to the outside world:
 * `escalatedTo` is a note that somebody outside the platform (a helpline, a local authority) was
 * contacted, written by the person who did it. Who to contact, and when the law requires it, is a
 * matter for the business and its counsel (see docs/security.md).
 */
@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly permissions: AdminPermissionsService,
  ) {}

  // -------------------------------------------------------------- from a report --

  /**
   * Called inside the transaction that stores a report in a category that endangers someone. One
   * open incident per person and kind: a second report adds to its log instead of making another.
   */
  async openFromReport(
    tx: Prisma.TransactionClient,
    report: {
      id: string;
      category: ReportCategory;
      severity: Severity;
      targetType: string;
      targetId: string;
      targetUserId: string | null;
    },
  ): Promise<void> {
    const type = INCIDENT_CATEGORIES[report.category];
    if (!type) return;
    const open = report.targetUserId
      ? await tx.safetyIncident.findFirst({
          where: {
            userId: report.targetUserId,
            type,
            status: { in: ['OPEN', 'ESCALATED'] },
          },
          select: { id: true },
        })
      : null;
    if (open) {
      await tx.safetyIncidentEvent.create({
        data: {
          incidentId: open.id,
          kind: 'NOTE',
          note: `Another report arrived (report ${report.id}).`,
        },
      });
      return;
    }
    const incident = await tx.safetyIncident.create({
      data: {
        type,
        severity: report.severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
        userId: report.targetUserId,
        reportId: report.id,
        summary: `Raised from a ${report.category.toLowerCase().replace(/_/g, ' ')} report on a ${report.targetType.toLowerCase()} (report ${report.id}).`,
      },
      select: { id: true },
    });
    await tx.safetyIncidentEvent.create({
      data: {
        incidentId: incident.id,
        kind: 'OPENED',
        note: 'Opened automatically from a report.',
      },
    });
    await this.audit.record(
      {
        actorType: 'SYSTEM',
        action: 'incident.opened_from_report',
        targetType: 'safety_incident',
        targetId: incident.id,
        after: { reportId: report.id, type },
      },
      tx,
    );
  }

  // -------------------------------------------------------------------- reading --

  private card(i: IncidentRow) {
    return {
      id: i.id,
      type: i.type,
      severity: i.severity,
      status: i.status,
      summary: i.summary,
      actionTaken: i.actionTaken,
      escalatedTo: i.escalatedTo,
      user: i.user,
      liveSessionId: i.liveSessionId,
      reportId: i.reportId,
      owner: i.owner,
      createdBy: i.createdBy,
      createdAt: i.createdAt.toISOString(),
      resolvedAt: i.resolvedAt?.toISOString() ?? null,
    };
  }

  async list(
    actor: AdminAuthContext,
    q: {
      status?: IncidentStatus | undefined;
      type?: IncidentType | undefined;
      severity?: Severity | undefined;
      owner?: string | undefined;
      cursor?: string | undefined;
      limit?: number | undefined;
    },
  ) {
    const limit = clampLimit(q.limit);
    const after = decodeCursor(q.cursor, cursorSchema);
    const rows = await this.prisma.safetyIncident.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.type ? { type: q.type } : {}),
        ...(q.severity ? { severity: q.severity } : {}),
        ...(q.owner === 'me'
          ? { ownerId: actor.adminId }
          : q.owner === 'unassigned'
            ? { ownerId: null }
            : {}),
        ...(after
          ? {
              OR: [
                { createdAt: { lt: new Date(after.t) } },
                { createdAt: new Date(after.t), id: { lt: after.id } },
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
      (r) => this.card(r),
    );
  }

  async get(id: string) {
    const i = await this.prisma.safetyIncident.findUnique({
      where: { id },
      include: {
        ...include,
        events: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: { admin: { select: { id: true, name: true } } },
        },
      },
    });
    if (!i) throw Errors.notFound('Incident');
    return {
      ...this.card(i),
      events: i.events.map((e) => ({
        id: e.id,
        kind: e.kind,
        note: e.note,
        by: e.admin ? { id: e.admin.id, name: e.admin.name } : null,
        at: e.createdAt.toISOString(),
      })),
    };
  }

  // ------------------------------------------------------------------- changing --

  async create(
    actor: AdminAuthContext,
    input: {
      type: IncidentType;
      severity?: Severity | undefined;
      summary: string;
      userId?: string | undefined;
      liveSessionId?: string | undefined;
      reportId?: string | undefined;
    },
    meta: Meta,
  ) {
    const id = await this.prisma.$transaction(async (tx) => {
      if (input.userId) {
        const u = await tx.user.findFirst({ where: { id: input.userId }, select: { id: true } });
        if (!u) throw Errors.validation([{ field: 'userId', reasons: ['not_found'] }]);
      }
      if (input.liveSessionId) {
        const l = await tx.liveSession.findUnique({
          where: { id: input.liveSessionId },
          select: { id: true },
        });
        if (!l) throw Errors.validation([{ field: 'liveSessionId', reasons: ['not_found'] }]);
      }
      if (input.reportId) {
        const r = await tx.report.findUnique({
          where: { id: input.reportId },
          select: { id: true },
        });
        if (!r) throw Errors.validation([{ field: 'reportId', reasons: ['not_found'] }]);
      }
      const created = await tx.safetyIncident.create({
        data: {
          type: input.type,
          severity: input.severity ?? 'HIGH',
          summary: input.summary.trim(),
          userId: input.userId ?? null,
          liveSessionId: input.liveSessionId ?? null,
          reportId: input.reportId ?? null,
          createdById: actor.adminId,
          ownerId: actor.adminId,
        },
        select: { id: true },
      });
      await this.event(tx, created.id, actor.adminId, 'OPENED', 'Opened by staff.');
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'incident.create',
          targetType: 'safety_incident',
          targetId: created.id,
          after: { type: input.type, severity: input.severity ?? 'HIGH' },
          ...meta,
        },
        tx,
      );
      return created.id;
    });
    return this.get(id);
  }

  private event(
    tx: Prisma.TransactionClient,
    incidentId: string,
    adminId: string | null,
    kind: IncidentEventKind,
    note?: string,
  ) {
    return tx.safetyIncidentEvent.create({
      data: { incidentId, adminId, kind, note: note?.slice(0, 1000) ?? null },
    });
  }

  /** Runs `change` on a locked, existing incident and writes the log and audit entries together. */
  private async change(
    actor: AdminAuthContext,
    id: string,
    audit: { action: string; reason?: string; meta: Meta },
    change: (
      tx: Prisma.TransactionClient,
      current: { status: IncidentStatus; ownerId: string | null },
    ) => Promise<{
      data: Prisma.SafetyIncidentUpdateInput;
      kind: IncidentEventKind;
      note?: string;
    }>,
  ) {
    await this.prisma.$transaction(async (tx) => {
      // Lock the row: two staff acting on the same incident are applied one after the other.
      const rows = await tx.$queryRaw<
        Array<{ status: IncidentStatus; owner_id: string | null }>
      >`SELECT status::text AS status, owner_id FROM safety_incidents WHERE id = ${id}::uuid FOR UPDATE`;
      const current = rows[0];
      if (!current) throw Errors.notFound('Incident');
      const out = await change(tx, { status: current.status, ownerId: current.owner_id });
      await tx.safetyIncident.update({ where: { id }, data: out.data });
      await this.event(tx, id, actor.adminId, out.kind, out.note);
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: audit.action,
          targetType: 'safety_incident',
          targetId: id,
          ...(audit.reason ? { reason: audit.reason } : {}),
          before: { status: current.status, ownerId: current.owner_id },
          after: { event: out.kind },
          ...audit.meta,
        },
        tx,
      );
    });
    return this.get(id);
  }

  addNote(actor: AdminAuthContext, id: string, note: string, meta: Meta) {
    return this.change(actor, id, { action: 'incident.note', meta }, async (_tx, cur) => {
      if (cur.status === 'RESOLVED')
        throw Errors.conflict('This incident is resolved. Reopen it to add to it.');
      return { data: {}, kind: 'NOTE', note: note.trim() };
    });
  }

  /** Take it (or, for a senior, hand it to somebody who can do the job). */
  assign(actor: AdminAuthContext, id: string, adminId: string, meta: Meta) {
    return this.change(actor, id, { action: 'incident.assign', meta }, async (tx, cur) => {
      if (cur.status === 'RESOLVED') throw Errors.conflict('This incident is resolved.');
      if (adminId !== actor.adminId) {
        if (!actor.permissions.has('reports.escalate'))
          throw Errors.forbidden('Only a senior moderator can give an incident to someone else.');
        const target = await tx.adminUser.findUnique({
          where: { id: adminId },
          select: { status: true, name: true },
        });
        if (!target || target.status !== 'ACTIVE')
          throw Errors.validation([{ field: 'adminId', reasons: ['not_active_staff'] }]);
        const access = await this.permissions.accessFor(adminId);
        if (!access.permissions.has('safety.incidents.write'))
          throw Errors.validation([{ field: 'adminId', reasons: ['cannot_handle_incidents'] }]);
      } else if (cur.ownerId && cur.ownerId !== actor.adminId) {
        if (!actor.permissions.has('reports.escalate'))
          throw Errors.conflict('Someone else is looking after this incident.');
      }
      return {
        data: { owner: { connect: { id: adminId } } },
        kind: 'ASSIGNED',
        note: adminId === actor.adminId ? 'Took the incident.' : 'Handed to another staff member.',
      };
    });
  }

  escalate(
    actor: AdminAuthContext,
    id: string,
    input: { escalatedTo: string; note?: string | undefined },
    meta: Meta,
  ) {
    return this.change(actor, id, { action: 'incident.escalate', meta }, async (_tx, cur) => {
      if (cur.status !== 'OPEN') throw Errors.conflict('Only an open incident can be escalated.');
      return {
        data: { status: 'ESCALATED', escalatedTo: input.escalatedTo.trim() },
        kind: 'ESCALATED',
        note: `Escalated to ${input.escalatedTo.trim()}.${input.note ? ` ${input.note.trim()}` : ''}`,
      };
    });
  }

  resolve(actor: AdminAuthContext, id: string, actionTaken: string, meta: Meta) {
    return this.change(
      actor,
      id,
      { action: 'incident.resolve', reason: actionTaken, meta },
      async (_tx, cur) => {
        if (cur.status === 'RESOLVED') throw Errors.conflict('This incident is already resolved.');
        if (
          cur.ownerId &&
          cur.ownerId !== actor.adminId &&
          !actor.permissions.has('reports.escalate')
        )
          throw Errors.conflict('Someone else is looking after this incident.');
        return {
          data: {
            status: 'RESOLVED',
            resolvedAt: new Date(),
            actionTaken: actionTaken.trim(),
            owner: { connect: { id: actor.adminId } },
          },
          kind: 'RESOLVED',
          note: actionTaken.trim(),
        };
      },
    );
  }

  reopen(actor: AdminAuthContext, id: string, reason: string, meta: Meta) {
    return this.change(actor, id, { action: 'incident.reopen', reason, meta }, async (_tx, cur) => {
      if (cur.status !== 'RESOLVED')
        throw Errors.conflict('Only a resolved incident can be reopened.');
      return {
        data: { status: 'OPEN', resolvedAt: null },
        kind: 'REOPENED',
        note: reason.trim(),
      };
    });
  }

  /** Counts for the summary page. */
  async counts() {
    const [open, escalated] = await Promise.all([
      this.prisma.safetyIncident.count({ where: { status: 'OPEN' } }),
      this.prisma.safetyIncident.count({ where: { status: 'ESCALATED' } }),
    ]);
    return { open, escalated };
  }
}
