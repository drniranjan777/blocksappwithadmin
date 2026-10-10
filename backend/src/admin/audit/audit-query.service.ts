import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Errors } from '../../common/errors/app-error.js';
import { Page, clampLimit, decodeCursor } from '../../common/pagination/cursor.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { AuditLog, Prisma } from '../../generated/prisma/client.js';

const cursorSchema = z.object({ t: z.string(), id: z.string() });

export interface AuditFilter {
  cursor?: string | undefined;
  limit?: number | undefined;
  actorId?: string | undefined;
  /** Exact action, e.g. `admin.disabled`. */
  action?: string | undefined;
  /** Everything in a module, e.g. `admin` matches `admin.*`. */
  module?: string | undefined;
  targetType?: string | undefined;
  targetId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  /** Only entries about access to protected data. Needs `audit.sensitive.read`. */
  sensitiveOnly?: boolean | undefined;
}

export function toAuditView(a: AuditLog) {
  return {
    id: a.id,
    createdAt: a.createdAt.toISOString(),
    actorType: a.actorType,
    actorId: a.actorId,
    actorLabel: a.actorLabel,
    action: a.action,
    targetType: a.targetType,
    targetId: a.targetId,
    reason: a.reason,
    before: a.before,
    after: a.after,
    ip: a.ip,
    requestId: a.requestId,
    sensitive: a.sensitive,
  };
}

/** Reading the audit trail. Entries about protected data are hidden from those who may not see them. */
@Injectable()
export class AuditQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: AuditFilter, canSeeSensitive: boolean) {
    if (filter.sensitiveOnly && !canSeeSensitive) throw Errors.forbidden();
    const limit = clampLimit(filter.limit);
    const after = decodeCursor(filter.cursor, cursorSchema);
    const created: Prisma.DateTimeFilter = {
      ...(filter.from ? { gte: this.date(filter.from, 'from') } : {}),
      ...(filter.to ? { lte: this.date(filter.to, 'to') } : {}),
    };
    const where: Prisma.AuditLogWhereInput = {
      ...(filter.actorId ? { actorId: filter.actorId } : {}),
      ...(filter.action ? { action: filter.action } : {}),
      ...(filter.module ? { action: { startsWith: `${filter.module}.` } } : {}),
      ...(filter.targetType ? { targetType: filter.targetType } : {}),
      ...(filter.targetId ? { targetId: filter.targetId } : {}),
      ...(Object.keys(created).length ? { createdAt: created } : {}),
      ...(filter.sensitiveOnly ? { sensitive: true } : canSeeSensitive ? {} : { sensitive: false }),
    };
    const rows = await this.prisma.auditLog.findMany({
      where: {
        AND: [
          where,
          ...(after
            ? [
                {
                  OR: [
                    { createdAt: { lt: new Date(after.t) } },
                    { createdAt: new Date(after.t), id: { lt: after.id } },
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.createdAt.toISOString(), id: r.id }),
      toAuditView,
    );
  }

  async get(id: string, canSeeSensitive: boolean) {
    const row = await this.prisma.auditLog.findUnique({ where: { id } });
    if (!row || (row.sensitive && !canSeeSensitive)) throw Errors.notFound('Audit entry');
    return toAuditView(row);
  }

  private date(value: string, field: string): Date {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw Errors.validation([{ field, reasons: ['invalid_date'] }]);
    return d;
  }
}
