import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../../admin/audit/audit.service.js';
import { Errors } from '../../common/errors/app-error.js';
import type { AdminAuthContext } from '../../common/http/request.js';
import { Page, clampLimit, decodeCursor } from '../../common/pagination/cursor.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { IncidentType, LiveStatus, Prisma } from '../../generated/prisma/client.js';
import { ModerationNotices } from '../moderation-notices.js';
import { ruleByCode } from '../policy.js';
import { ACTIVE_STATUSES } from '../reports/reports.service.js';
import { LiveProvider } from './live-provider.js';

interface Meta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

const cursorSchema = z.object({ t: z.string(), id: z.string() });

const include = {
  host: { select: { id: true, username: true, status: true } },
  terminatedBy: { select: { id: true, name: true } },
} satisfies Prisma.LiveSessionInclude;
type Row = Prisma.LiveSessionGetPayload<{ include: typeof include }>;

/**
 * What staff can do about live sessions: see them, and end one at once.
 *
 * There is no live streaming in BLOCKS yet (and none is built here: a stream needs a provider,
 * moderation at scale, and legal review first). This is the safety side that has to exist before
 * there is one: a list of sessions with their risk signals and reports, an emergency stop that
 * works in one request with one permission, and an incident log. Sessions are created by the
 * future live service; until it exists the table is empty and these screens say so.
 */
@Injectable()
export class LiveAdminService {
  private readonly logger = new Logger('LiveAdmin');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly provider: LiveProvider,
    private readonly notices: ModerationNotices,
  ) {}

  private view(s: Row, extra: { openReports?: number; openIncidents?: number } = {}) {
    return {
      id: s.id,
      title: s.title,
      status: s.status,
      host: s.host,
      startedAt: s.startedAt?.toISOString() ?? null,
      endedAt: s.endedAt?.toISOString() ?? null,
      peakViewers: s.peakViewers,
      riskFlags: s.riskFlags ?? null,
      terminatedBy: s.terminatedBy,
      terminationReason: s.terminationReason,
      createdAt: s.createdAt.toISOString(),
      openReports: extra.openReports ?? 0,
      openIncidents: extra.openIncidents ?? 0,
    };
  }

  async list(q: {
    scope?: 'active' | 'past' | undefined;
    status?: LiveStatus | undefined;
    hostId?: string | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
  }) {
    const limit = clampLimit(q.limit);
    const c = decodeCursor(q.cursor, cursorSchema);
    const scope = q.scope ?? 'active';
    const rows = await this.prisma.liveSession.findMany({
      where: {
        ...(q.status
          ? { status: q.status }
          : {
              status: {
                in:
                  scope === 'active'
                    ? (['SCHEDULED', 'LIVE'] as const)
                    : (['ENDED', 'TERMINATED'] as const),
              },
            }),
        ...(q.hostId ? { hostId: q.hostId } : {}),
        ...(c
          ? {
              OR: [
                { createdAt: { lt: new Date(c.t) } },
                { createdAt: new Date(c.t), id: { lt: c.id } },
              ],
            }
          : {}),
      },
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const ids = page.map((r) => r.id);
    const [reports, incidents] = ids.length
      ? await Promise.all([
          this.prisma.report.groupBy({
            by: ['targetId'],
            where: { targetType: 'LIVE', targetId: { in: ids }, status: { in: ACTIVE_STATUSES } },
            _count: { _all: true },
          }),
          this.prisma.safetyIncident.groupBy({
            by: ['liveSessionId'],
            where: { liveSessionId: { in: ids }, status: { in: ['OPEN', 'ESCALATED'] } },
            _count: { _all: true },
          }),
        ])
      : [[], []];
    const rc = new Map(reports.map((r) => [r.targetId, r._count._all]));
    const ic = new Map(incidents.map((r) => [r.liveSessionId, r._count._all]));
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.createdAt.toISOString(), id: r.id }),
      (r) => this.view(r, { openReports: rc.get(r.id) ?? 0, openIncidents: ic.get(r.id) ?? 0 }),
    );
  }

  async get(id: string) {
    const s = await this.prisma.liveSession.findUnique({
      where: { id },
      include: {
        ...include,
        incidents: {
          select: { id: true, type: true, severity: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!s) throw Errors.notFound('Live session');
    const reports = await this.prisma.report.findMany({
      where: { targetType: 'LIVE', targetId: id },
      select: { id: true, category: true, severity: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      ...this.view(s, {
        openReports: reports.filter((r) => ACTIVE_STATUSES.includes(r.status)).length,
        openIncidents: s.incidents.filter((i) => i.status !== 'RESOLVED').length,
      }),
      incidents: s.incidents.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() })),
      reports: reports.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    };
  }

  /**
   * Ends a session now. The decision is stored first (and is what a provider must obey), then the
   * provider is told to stop it. If the provider cannot be reached the session is still terminated
   * here, the response says the provider did not confirm, and the failure is audited, so staff know
   * to cut the stream at the source.
   */
  async terminate(
    actor: AdminAuthContext,
    id: string,
    input: {
      reason: string;
      policyReason?: string | undefined;
      incident?: { type: IncidentType; summary: string } | undefined;
    },
    meta: Meta,
  ) {
    const policyReason = input.policyReason ?? 'other_guidelines';
    if (
      !ruleByCode(policyReason) ||
      policyReason === 'no_violation' ||
      policyReason === 'report_in_bad_faith'
    ) {
      throw Errors.validation([{ field: 'policyReason', reasons: ['does_not_fit_this_decision'] }]);
    }
    const after: Array<() => Promise<void>> = [];
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM live_sessions WHERE id = ${id}::uuid FOR UPDATE`;
      const s = await tx.liveSession.findUnique({
        where: { id },
        select: { status: true, hostId: true },
      });
      if (!s) throw Errors.notFound('Live session');
      if (s.status !== 'LIVE' && s.status !== 'SCHEDULED')
        throw Errors.conflict('This session has already ended.');
      const now = new Date();
      await tx.liveSession.update({
        where: { id },
        data: {
          status: 'TERMINATED',
          endedAt: now,
          terminatedById: actor.adminId,
          terminationReason: input.reason.trim().slice(0, 300),
        },
      });
      const decision = await tx.moderationAction.create({
        data: {
          adminId: actor.adminId,
          source: 'ADMIN',
          targetType: 'LIVE',
          targetId: id,
          targetUserId: s.hostId,
          action: 'REMOVE',
          policyReason,
          notes: input.reason.trim().slice(0, 1000),
        },
        select: { id: true },
      });
      if (input.incident) {
        const incident = await tx.safetyIncident.create({
          data: {
            type: input.incident.type,
            severity: 'HIGH',
            userId: s.hostId,
            liveSessionId: id,
            summary: input.incident.summary.trim(),
            actionTaken: 'The live session was ended by staff.',
            createdById: actor.adminId,
            ownerId: actor.adminId,
          },
          select: { id: true },
        });
        await tx.safetyIncidentEvent.create({
          data: {
            incidentId: incident.id,
            adminId: actor.adminId,
            kind: 'OPENED',
            note: 'Opened when the live session was ended.',
          },
        });
      }
      // Reports about this session are answered by ending it.
      const waiting = await tx.report.findMany({
        where: { targetType: 'LIVE', targetId: id, status: { in: ACTIVE_STATUSES } },
        select: { id: true, reporterId: true },
      });
      if (waiting.length) {
        await tx.report.updateMany({
          where: { id: { in: waiting.map((w) => w.id) } },
          data: {
            status: 'RESOLVED',
            resolvedAt: now,
            resolution: 'The live session was ended by staff.',
          },
        });
        for (const w of waiting) {
          const reporterId = w.reporterId;
          if (reporterId)
            after.push(() => this.notices.reportOutcome(reporterId, w.id, 'action_taken'));
        }
      }
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'live.terminate',
          targetType: 'live_session',
          targetId: id,
          reason: input.reason,
          before: { status: s.status },
          after: {
            status: 'TERMINATED',
            moderationActionId: decision.id,
            reportsClosed: waiting.length,
          },
          ...meta,
        },
        tx,
      );
      const hostId = s.hostId;
      after.push(() =>
        this.notices.contentDecision(hostId, 'removed', 'LIVE', policyReason, decision.id, id),
      );
    });

    let providerConfirmed = false;
    try {
      providerConfirmed = (await this.provider.terminate(id, input.reason)).confirmed;
    } catch (e) {
      this.logger.error(`Live provider could not end session ${id}: ${(e as Error).message}`);
    }
    await this.audit
      .record({
        actorType: 'ADMIN',
        actorId: actor.adminId,
        actorLabel: actor.name,
        action: 'live.terminate_provider',
        targetType: 'live_session',
        targetId: id,
        after: { providerConfirmed },
        ...meta,
      })
      .catch(() => undefined);
    for (const f of after) await f();
    return { ...(await this.get(id)), providerConfirmed };
  }
}
