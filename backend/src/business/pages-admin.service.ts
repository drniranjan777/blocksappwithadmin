import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../admin/audit/audit.service.js';
import type { AdminAuthContext } from '../common/http/request.js';
import { Errors } from '../common/errors/app-error.js';
import { Page, clampLimit, decodeCursor } from '../common/pagination/cursor.js';
import { PrismaService } from '../database/prisma.service.js';
import type { BusinessStatus, Prisma, VerificationStatus } from '../generated/prisma/client.js';
import { NotificationService } from '../notifications/notification.service.js';

const cursorSchema = z.object({ t: z.string(), id: z.string() });

interface Meta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

const include = {
  owner: { select: { id: true, username: true, status: true } },
} satisfies Prisma.BusinessPageInclude;
type Row = Prisma.BusinessPageGetPayload<{ include: typeof include }>;

/** Staff looking after business pages: finding them, and taking one out of view when it must be. */
@Injectable()
export class PagesAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  private card(p: Row) {
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      category: p.category,
      status: p.status,
      statusReason: p.statusReason,
      verification: p.verificationStatus,
      owner: p.owner,
      followers: p.followersCount,
      location: { state: p.state, district: p.district },
      createdAt: p.createdAt.toISOString(),
    };
  }

  async list(q: {
    q?: string | undefined;
    status?: BusinessStatus | undefined;
    verification?: VerificationStatus | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
  }) {
    const limit = clampLimit(q.limit);
    const c = decodeCursor(q.cursor, cursorSchema);
    const text = q.q?.trim().toLowerCase();
    const rows = await this.prisma.businessPage.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.verification ? { verificationStatus: q.verification } : {}),
        ...(text
          ? {
              OR: [
                { name: { contains: text, mode: 'insensitive' as const } },
                { slug: { startsWith: text } },
              ],
            }
          : {}),
        ...(c
          ? {
              AND: [
                {
                  OR: [
                    { createdAt: { lt: new Date(c.t) } },
                    { createdAt: new Date(c.t), id: { lt: c.id } },
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
      (r) => this.card(r),
    );
  }

  async get(id: string) {
    const p = await this.prisma.businessPage.findUnique({ where: { id }, include });
    if (!p) throw Errors.notFound('Page');
    const [posts, offers, campaigns, requests, reports] = await Promise.all([
      this.prisma.post.count({ where: { businessPageId: id, deletedAt: null } }),
      this.prisma.businessOffer.count({ where: { pageId: id } }),
      this.prisma.adCampaign.groupBy({
        by: ['status'],
        where: { businessPageId: id },
        _count: { _all: true },
      }),
      this.prisma.verificationRequest.findMany({
        where: { businessPageId: id },
        select: { id: true, type: true, status: true, submittedAt: true },
        orderBy: { submittedAt: 'desc' },
        take: 10,
      }),
      this.prisma.report.count({ where: { targetUserId: p.ownerId } }),
    ]);
    return {
      ...this.card(p),
      description: p.description,
      contactEmail: p.contactEmail,
      websiteUrl: p.websiteUrl,
      city: p.city,
      gstinLast4: p.gstinLast4,
      statusChangedAt: p.statusChangedAt?.toISOString() ?? null,
      counts: { posts, offers },
      campaigns: Object.fromEntries(campaigns.map((c) => [c.status, c._count._all])),
      verificationRequests: requests.map((r) => ({
        ...r,
        submittedAt: r.submittedAt.toISOString(),
      })),
      ownerReportsAgainst: reports,
    };
  }

  /** Hides a published page and everything posted as it, and pauses its campaigns. */
  async suspend(actor: AdminAuthContext, id: string, reason: string, meta: Meta) {
    let ownerId = '';
    let name = '';
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM business_pages WHERE id = ${id}::uuid FOR UPDATE`;
      const p = await tx.businessPage.findUnique({ where: { id } });
      if (!p) throw Errors.notFound('Page');
      if (p.status !== 'ACTIVE') throw Errors.conflict('Only a published page can be suspended.');
      ownerId = p.ownerId;
      name = p.name;
      await tx.businessPage.update({
        where: { id },
        data: {
          status: 'SUSPENDED',
          statusReason: reason.slice(0, 300),
          statusChangedAt: new Date(),
        },
      });
      const paused = await tx.adCampaign.updateMany({
        where: { businessPageId: id, status: { in: ['APPROVED', 'ACTIVE'] } },
        data: { status: 'PAUSED', reviewNote: 'The page was suspended.' },
      });
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'business.suspend',
          targetType: 'business_page',
          targetId: id,
          reason,
          before: { status: 'ACTIVE' },
          after: { status: 'SUSPENDED', campaignsPaused: paused.count },
          ...meta,
        },
        tx,
      );
    });
    await this.notifications
      .notify({
        userId: ownerId,
        type: 'SYSTEM',
        template: 'business_page_suspended',
        vars: { name },
        severity: 'WARNING',
        data: { pageId: id },
        dedupeKey: `business-suspend:${id}:${Date.now()}`,
      })
      .catch(() => undefined);
    return this.get(id);
  }

  async restore(actor: AdminAuthContext, id: string, reason: string, meta: Meta) {
    let ownerId = '';
    let name = '';
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM business_pages WHERE id = ${id}::uuid FOR UPDATE`;
      const p = await tx.businessPage.findUnique({ where: { id } });
      if (!p) throw Errors.notFound('Page');
      if (p.status !== 'SUSPENDED') throw Errors.conflict('This page is not suspended.');
      ownerId = p.ownerId;
      name = p.name;
      await tx.businessPage.update({
        where: { id },
        data: { status: 'ACTIVE', statusReason: null, statusChangedAt: new Date() },
      });
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'business.restore',
          targetType: 'business_page',
          targetId: id,
          reason,
          before: { status: 'SUSPENDED' },
          after: { status: 'ACTIVE' },
          ...meta,
        },
        tx,
      );
    });
    await this.notifications
      .notify({
        userId: ownerId,
        type: 'SYSTEM',
        template: 'business_page_restored',
        vars: { name },
        severity: 'INFO',
        data: { pageId: id },
        dedupeKey: `business-restore:${id}:${Date.now()}`,
      })
      .catch(() => undefined);
    return this.get(id);
  }
}
