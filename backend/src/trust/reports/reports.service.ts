import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../../admin/audit/audit.service.js';
import { AppError, Errors } from '../../common/errors/app-error.js';
import { Page, clampLimit, decodeCursor } from '../../common/pagination/cursor.js';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  Prisma,
  ReportCategory,
  ReportStatus,
  ReportTargetType,
  Severity,
} from '../../generated/prisma/client.js';
import { ModerationNotices } from '../moderation-notices.js';
import { SYSTEM_REASONS, maxSeverity, priorityFor } from '../policy.js';
import { PolicyService } from '../policy/policy.service.js';
import { IncidentsService } from '../safety/incidents.service.js';
import { TargetsService, isContentTarget } from '../targets.service.js';

export const ACTIVE_STATUSES: ReportStatus[] = ['OPEN', 'IN_REVIEW', 'ESCALATED'];
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const cursorSchema = z.object({ t: z.string(), id: z.string() });

export interface EvidenceRef {
  kind: 'POST' | 'REEL' | 'STORY' | 'COMMENT' | 'USER';
  id: string;
}

export interface NewReport {
  targetType: ReportTargetType;
  targetId: string;
  category: ReportCategory;
  description?: string | undefined;
  evidence?: EvidenceRef[] | undefined;
}

/** What the person who reported sees: it was received, then it was looked at. */
function reporterStatus(s: ReportStatus): 'RECEIVED' | 'REVIEWED' {
  return s === 'RESOLVED' || s === 'DISMISSED' ? 'REVIEWED' : 'RECEIVED';
}

/**
 * People reporting things.
 *
 * The person reporting has to be able to see what they report (so the endpoint cannot be used to
 * find out whether something private exists), cannot report themselves, and is held to a daily
 * limit so reporting cannot be used as a weapon in itself. The same report twice is answered with
 * the first one, so a retry or a double tap is harmless. Every report is kept with a short excerpt
 * of what it was about, because the author can edit or delete it afterwards.
 *
 * Severity and response time come from the category's policy. When enough *different* people
 * report the same thing in a category whose policy says to hide on report, it is hidden pending
 * review (and says so to its author); when a report is about somebody's safety, an incident is
 * opened at once.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly targets: TargetsService,
    private readonly policy: PolicyService,
    private readonly incidents: IncidentsService,
    private readonly audit: AuditService,
    private readonly notices: ModerationNotices,
  ) {}

  async create(userId: string, input: NewReport) {
    const thing = await this.targets.forReport(userId, input.targetType, input.targetId);
    if (thing.ownerId === userId) {
      throw Errors.validation([{ field: 'targetId', reasons: ['cannot_report_yourself'] }]);
    }
    const duplicate = () =>
      this.prisma.report.findFirst({
        where: {
          reporterId: userId,
          targetType: input.targetType,
          targetId: input.targetId,
          category: input.category,
          status: { in: ACTIVE_STATUSES },
        },
        select: { id: true },
      });
    const already = await duplicate();
    if (already) return { id: already.id, status: 'RECEIVED' as const, duplicate: true };

    const limits = await this.policy.limits();
    const recent = await this.prisma.report.findMany({
      where: { reporterId: userId, createdAt: { gte: new Date(Date.now() - DAY) } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: limits.reportsPerDay,
    });
    if (recent.length >= limits.reportsPerDay) {
      const first = recent[0]?.createdAt.getTime() ?? Date.now();
      throw Errors.rateLimited(Math.max(60, (first + DAY - Date.now()) / 1000));
    }

    const cat = await this.policy.categoryPolicy(input.category);
    const after: Array<() => Promise<void>> = [];
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const report = await tx.report.create({
          data: {
            reporterId: userId,
            source: 'USER',
            targetType: input.targetType,
            targetId: input.targetId,
            targetUserId: thing.ownerId,
            category: input.category,
            description: input.description?.trim() || null,
            evidence: {
              refs: dedupeRefs(input.evidence ?? []),
              snapshot: {
                excerpt: thing.excerpt,
                ownerUsername: thing.ownerUsername,
                capturedAt: new Date().toISOString(),
              },
            } as unknown as Prisma.InputJsonValue,
            severity: cat.severity,
            slaDueAt: new Date(Date.now() + cat.slaHours * HOUR),
          },
        });
        const open = await tx.report.findMany({
          where: {
            targetType: input.targetType,
            targetId: input.targetId,
            status: { in: ACTIVE_STATUSES },
          },
          select: { id: true, reporterId: true, severity: true, category: true },
        });
        const worst = open.reduce<Severity>((s, r) => maxSeverity(s, r.severity), 'LOW');
        const people = new Set(open.map((r) => r.reporterId ?? `system:${r.id}`));
        const priority = priorityFor(worst, people.size);
        await tx.report.updateMany({
          where: { id: { in: open.map((r) => r.id) } },
          data: { priority },
        });

        await this.incidents.openFromReport(tx, {
          id: report.id,
          category: input.category,
          severity: cat.severity,
          targetType: input.targetType,
          targetId: input.targetId,
          targetUserId: thing.ownerId,
        });

        if (cat.autoHoldAt > 0 && isContentTarget(input.targetType)) {
          const same = new Set(
            open
              .filter((r) => r.category === input.category && r.reporterId)
              .map((r) => r.reporterId),
          );
          if (same.size >= cat.autoHoldAt) {
            await this.autoHold(tx, report.id, input.targetType, input.targetId, same.size, after);
          }
        }
        return report.id;
      });
    } catch (e) {
      // The database refuses a second open report from the same person about the same thing for the
      // same reason; two taps that raced each other end up here, and the answer is the first one.
      if ((e as { code?: string }).code === 'P2002') {
        const first = await duplicate();
        if (first) return { id: first.id, status: 'RECEIVED' as const, duplicate: true };
      }
      throw e;
    }
    for (const f of after) await f();
    return { id, status: 'RECEIVED' as const, duplicate: false };
  }

  /** Hides content pending review, in the transaction that stored the report that tipped it. */
  private async autoHold(
    tx: Prisma.TransactionClient,
    reportId: string,
    type: ReportTargetType,
    targetId: string,
    people: number,
    after: Array<() => Promise<void>>,
  ): Promise<void> {
    if (!isContentTarget(type)) return;
    let moved;
    try {
      moved = await this.targets.setState(tx, type, targetId, 'RESTRICTED');
    } catch (e) {
      if (e instanceof AppError) return; // deleted meanwhile: nothing to hide
      throw e;
    }
    // Hide only what is public and approved. Anything else is the media pipeline's, or already hidden.
    if (!moved.changed || moved.from !== 'APPROVED') return;
    const action = await tx.moderationAction.create({
      data: {
        reportId,
        adminId: null,
        source: 'AUTOMATED',
        targetType: type,
        targetId,
        targetUserId: moved.ownerId,
        action: 'RESTRICT',
        policyReason: SYSTEM_REASONS.autoHold,
        notes: `Held automatically after ${people} different people reported it.`,
      },
      select: { id: true },
    });
    await this.audit.record(
      {
        actorType: 'SYSTEM',
        action: 'moderation.auto_hold',
        targetType: type.toLowerCase(),
        targetId,
        before: { state: moved.from },
        after: { state: 'RESTRICTED', moderationActionId: action.id, reporters: people },
      },
      tx,
    );
    after.push(() =>
      this.notices.contentDecision(
        moved.ownerId,
        'restricted',
        type,
        SYSTEM_REASONS.autoHold,
        action.id,
        targetId,
      ),
    );
  }

  /** The reports this person made, newest first. They see whether it was looked at, not what came of it. */
  async mine(userId: string, q: { cursor?: string | undefined; limit?: number | undefined }) {
    const limit = clampLimit(q.limit);
    const cur = decodeCursor(q.cursor, cursorSchema);
    const rows = await this.prisma.report.findMany({
      where: {
        reporterId: userId,
        ...(cur
          ? {
              OR: [
                { createdAt: { lt: new Date(cur.t) } },
                { createdAt: new Date(cur.t), id: { lt: cur.id } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        targetType: true,
        category: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.createdAt.toISOString(), id: r.id }),
      (r) => ({
        id: r.id,
        targetType: r.targetType,
        category: r.category,
        status: reporterStatus(r.status),
        createdAt: r.createdAt.toISOString(),
        reviewedAt: r.resolvedAt?.toISOString() ?? null,
      }),
    );
  }
}

function dedupeRefs(refs: EvidenceRef[]): EvidenceRef[] {
  const seen = new Set<string>();
  return refs.filter((r) => {
    const key = `${r.kind}:${r.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
