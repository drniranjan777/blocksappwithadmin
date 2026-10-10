import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../admin/audit/audit.service.js';
import { Errors } from '../common/errors/app-error.js';
import type { AdminAuthContext } from '../common/http/request.js';
import { Page, clampLimit, decodeCursor } from '../common/pagination/cursor.js';
import { PrismaService } from '../database/prisma.service.js';
import type { AdStatus, BillingStatus, Prisma } from '../generated/prisma/client.js';
import { formatRupees, fromDatabase } from '../ledger/money.js';
import { NotificationService } from '../notifications/notification.service.js';
import { TargetsService } from '../trust/targets.service.js';
import { type Targeting } from './ads-rules.js';
import { AudienceService } from './audience.service.js';

const cursorSchema = z.object({ t: z.string(), id: z.string() });
const advertiserCursor = z.object({ t: z.string(), id: z.string() });

interface Meta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

const include = {
  advertiser: { select: { id: true, username: true, status: true } },
  businessPage: {
    select: { id: true, slug: true, name: true, status: true, verificationStatus: true },
  },
  reviewedBy: { select: { id: true, name: true } },
} satisfies Prisma.AdCampaignInclude;
type Row = Prisma.AdCampaignGetPayload<{ include: typeof include }>;

type Outcome = 'approved' | 'rejected' | 'flagged' | 'paused';

/**
 * Staff reviewing advertising: what is waiting, what each campaign says and who is behind it, and
 * the decisions (approve, refuse, flag, pause, resume), each with a note the advertiser can read.
 *
 * Money details (how it was paid, the provider's reference) are shown only to staff who also hold
 * `ads.billing.read`. A decision to approve checks again that everything the campaign relies on is
 * still true, because days can pass between a campaign being sent and a person looking at it.
 */
@Injectable()
export class AdsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly audience: AudienceService,
    private readonly targets: TargetsService,
  ) {}

  private card(c: Row, now = new Date()) {
    return {
      id: c.id,
      name: c.name,
      objective: c.objective,
      status: c.status,
      advertiser: c.advertiser,
      page: c.businessPage
        ? { id: c.businessPage.id, slug: c.businessPage.slug, name: c.businessPage.name }
        : null,
      budget: formatRupees(fromDatabase(c.budgetTotal)),
      spent: formatRupees(fromDatabase(c.spent)),
      startsAt: c.startsAt.toISOString(),
      endsAt: c.endsAt.toISOString(),
      submittedAt: c.submittedAt?.toISOString() ?? null,
      waitingHours:
        c.status === 'IN_REVIEW' && c.submittedAt
          ? Math.floor((now.getTime() - c.submittedAt.getTime()) / 3_600_000)
          : null,
      billingStatus: c.billingStatus,
      flags: c.policyFlags ?? null,
    };
  }

  async list(
    actor: AdminAuthContext,
    q: {
      scope?: 'review' | 'all' | undefined;
      status?: AdStatus | undefined;
      billing?: BillingStatus | undefined;
      advertiserId?: string | undefined;
      q?: string | undefined;
      cursor?: string | undefined;
      limit?: number | undefined;
    },
  ) {
    const limit = clampLimit(q.limit);
    const c = decodeCursor(q.cursor, cursorSchema);
    const scope = q.scope ?? (q.status || q.billing || q.advertiserId || q.q ? 'all' : 'review');
    // What is waiting is worked oldest first; everything else is read newest first.
    const oldestFirst = scope === 'review';
    const rows = await this.prisma.adCampaign.findMany({
      where: {
        ...(scope === 'review' ? { status: 'IN_REVIEW' as const } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.billing && actor.permissions.has('ads.billing.read')
          ? { billingStatus: q.billing }
          : {}),
        ...(q.advertiserId ? { advertiserId: q.advertiserId } : {}),
        ...(q.q?.trim() ? { name: { contains: q.q.trim(), mode: 'insensitive' as const } } : {}),
        ...(c
          ? {
              AND: [
                {
                  OR: oldestFirst
                    ? [
                        { submittedAt: { gt: new Date(c.t) } },
                        { submittedAt: new Date(c.t), id: { gt: c.id } },
                      ]
                    : [
                        { createdAt: { lt: new Date(c.t) } },
                        { createdAt: new Date(c.t), id: { lt: c.id } },
                      ],
                },
              ],
            }
          : {}),
      },
      include,
      orderBy: oldestFirst
        ? [{ submittedAt: 'asc' }, { id: 'asc' }]
        : [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const now = new Date();
    return Page.fromRows(
      rows,
      limit,
      (r) => ({
        t: (oldestFirst ? (r.submittedAt ?? r.createdAt) : r.createdAt).toISOString(),
        id: r.id,
      }),
      (r) => {
        const card = this.card(r, now);
        return actor.permissions.has('ads.billing.read')
          ? card
          : { ...card, billingStatus: undefined };
      },
    );
  }

  async get(actor: AdminAuthContext, id: string) {
    const c = await this.prisma.adCampaign.findUnique({ where: { id }, include });
    if (!c) throw Errors.notFound('Campaign');
    const targeting = c.targeting as Targeting;
    const [audience, standing, boost, history] = await Promise.all([
      this.audience.count(targeting),
      this.standing(c.advertiserId),
      c.boostPostId
        ? this.targets.describe('POST', c.boostPostId)
        : c.boostReelId
          ? this.targets.describe('REEL', c.boostReelId)
          : null,
      this.prisma.auditLog.findMany({
        where: { targetType: 'ad_campaign', targetId: id },
        select: { action: true, actorLabel: true, reason: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    const canBilling = actor.permissions.has('ads.billing.read');
    return {
      ...this.card(c),
      billingStatus: canBilling ? c.billingStatus : undefined,
      dailyBudget: c.dailyBudget ? formatRupees(fromDatabase(c.dailyBudget)) : null,
      currency: c.currency,
      targeting,
      audience: { exact: audience },
      creative: { headline: c.headline, body: c.body, destinationUrl: c.destinationUrl },
      boost,
      pausedBy: c.pausedBy,
      reviewNote: c.reviewNote,
      reviewedBy: c.reviewedBy,
      reviewedAt: c.reviewedAt?.toISOString() ?? null,
      pageStatus: c.businessPage
        ? {
            status: c.businessPage.status,
            verified: c.businessPage.verificationStatus === 'APPROVED',
          }
        : null,
      billing: canBilling
        ? {
            status: c.billingStatus,
            reference: c.billingReference,
            fundedAt: c.fundedAt?.toISOString() ?? null,
          }
        : null,
      advertiserStanding: standing,
      history: history.map((h) => ({ ...h, createdAt: h.createdAt.toISOString() })),
    };
  }

  private async standing(userId: string) {
    const [user, byStatus, reports] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, status: true, createdAt: true },
      }),
      this.prisma.adCampaign.groupBy({
        by: ['status'],
        where: { advertiserId: userId },
        _count: { _all: true },
      }),
      this.prisma.report.count({ where: { targetUserId: userId } }),
    ]);
    return {
      user: user ? { ...user, createdAt: user.createdAt.toISOString() } : null,
      campaigns: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
      reportsAgainst: reports,
    };
  }

  // ------------------------------------------------------------------ deciding --

  /**
   * Runs one state change under a row lock, with the rules for it, and writes the audit entry in the
   * same transaction. `from` is the set of states it may start from.
   */
  private async change(
    actor: AdminAuthContext,
    id: string,
    o: {
      action: string;
      from: readonly AdStatus[];
      note?: string | undefined;
      outcome?: Outcome;
      apply: (
        c: Prisma.AdCampaignGetPayload<object>,
        tx: Prisma.TransactionClient,
      ) => Promise<Prisma.AdCampaignUncheckedUpdateInput>;
      meta: Meta;
    },
  ) {
    let advertiserId = '';
    let name = '';
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM ad_campaigns WHERE id = ${id}::uuid FOR UPDATE`;
      const c = await tx.adCampaign.findUnique({ where: { id } });
      if (!c) throw Errors.notFound('Campaign');
      if (!o.from.includes(c.status))
        throw Errors.conflict(
          `A campaign that is ${c.status.toLowerCase().replace(/_/g, ' ')} cannot be ${o.action}.`,
        );
      advertiserId = c.advertiserId;
      name = c.name;
      const data = await o.apply(c, tx);
      await tx.adCampaign.update({ where: { id }, data });
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: `ads.${o.action}`,
          targetType: 'ad_campaign',
          targetId: id,
          ...(o.note ? { reason: o.note } : {}),
          before: { status: c.status },
          after: { status: data.status ?? c.status },
          ...o.meta,
        },
        tx,
      );
    });
    if (o.outcome) {
      await this.notifications
        .notify({
          userId: advertiserId,
          type: 'CAMPAIGN_STATUS',
          template: 'ad_campaign_decision',
          vars: { name, outcome: o.outcome },
          severity: o.outcome === 'approved' ? 'INFO' : 'WARNING',
          data: { campaignId: id },
          dedupeKey: `ad:${id}:${o.action}:${Date.now()}`,
        })
        .catch(() => undefined);
    }
    return this.get(actor, id);
  }

  approve(actor: AdminAuthContext, id: string, note: string | undefined, meta: Meta) {
    return this.change(actor, id, {
      action: 'approve',
      from: ['IN_REVIEW'],
      ...(note ? { note } : {}),
      outcome: 'approved',
      meta,
      apply: async (c, tx) => {
        // Days may have passed since it was sent: check again that everything it relies on is still true.
        const advertiser = await tx.user.findUnique({
          where: { id: c.advertiserId },
          select: { status: true },
        });
        if (advertiser?.status !== 'ACTIVE')
          throw Errors.conflict('The advertiser’s account is not active.');
        if (c.businessPageId) {
          const page = await tx.businessPage.findUnique({
            where: { id: c.businessPageId },
            select: { status: true },
          });
          if (page?.status !== 'ACTIVE') throw Errors.conflict('Its page is not published.');
        }
        if (c.boostPostId) {
          const p = await tx.post.findUnique({
            where: { id: c.boostPostId },
            select: { moderationStatus: true, deletedAt: true },
          });
          if (!p || p.deletedAt || p.moderationStatus !== 'APPROVED')
            throw Errors.conflict('The post it promotes is no longer available.');
        }
        if (c.boostReelId) {
          const r = await tx.reel.findUnique({
            where: { id: c.boostReelId },
            select: { moderationStatus: true, deletedAt: true },
          });
          if (!r || r.deletedAt || r.moderationStatus !== 'APPROVED')
            throw Errors.conflict('The reel it promotes is no longer available.');
        }
        if (c.endsAt <= new Date()) throw Errors.conflict('Its schedule has ended.');
        return {
          status: 'APPROVED',
          reviewedById: actor.adminId,
          reviewedAt: new Date(),
          reviewNote: note?.trim() || null,
        };
      },
    });
  }

  reject(actor: AdminAuthContext, id: string, note: string, meta: Meta) {
    return this.change(actor, id, {
      action: 'reject',
      from: ['IN_REVIEW'],
      note,
      outcome: 'rejected',
      meta,
      apply: async () => ({
        status: 'REJECTED',
        reviewedById: actor.adminId,
        reviewedAt: new Date(),
        reviewNote: note.trim(),
      }),
    });
  }

  /** Stops a campaign that may break the rules, so it cannot deliver until a person has looked again. */
  flag(actor: AdminAuthContext, id: string, note: string, meta: Meta) {
    return this.change(actor, id, {
      action: 'flag',
      from: ['APPROVED', 'ACTIVE', 'PAUSED'],
      note,
      outcome: 'flagged',
      meta,
      apply: async () => ({
        status: 'FLAGGED',
        pausedBy: 'STAFF',
        reviewedById: actor.adminId,
        reviewedAt: new Date(),
        reviewNote: note.trim(),
      }),
    });
  }

  /** After looking again: it can go on. A paid campaign waits paused for its owner; an unpaid one is approved again. */
  clearFlag(actor: AdminAuthContext, id: string, note: string, meta: Meta) {
    return this.change(actor, id, {
      action: 'clear_flag',
      from: ['FLAGGED'],
      note,
      meta,
      apply: async (c) => ({
        status: c.billingStatus === 'PAID' ? 'PAUSED' : 'APPROVED',
        pausedBy: c.billingStatus === 'PAID' ? 'OWNER' : null,
        reviewedById: actor.adminId,
        reviewedAt: new Date(),
        reviewNote: null,
      }),
    });
  }

  pause(actor: AdminAuthContext, id: string, note: string, meta: Meta) {
    return this.change(actor, id, {
      action: 'pause',
      from: ['ACTIVE'],
      note,
      outcome: 'paused',
      meta,
      apply: async () => ({ status: 'PAUSED', pausedBy: 'STAFF', reviewNote: note.trim() }),
    });
  }

  resume(actor: AdminAuthContext, id: string, note: string, meta: Meta) {
    return this.change(actor, id, {
      action: 'resume',
      from: ['PAUSED'],
      note,
      meta,
      apply: async (c, tx) => {
        if (c.endsAt <= new Date()) throw Errors.conflict('Its schedule has ended.');
        if (c.billingStatus !== 'PAID') throw Errors.conflict('It has not been paid for.');
        if (c.businessPageId) {
          const page = await tx.businessPage.findUnique({
            where: { id: c.businessPageId },
            select: { status: true },
          });
          if (page?.status !== 'ACTIVE') throw Errors.conflict('Its page is not published.');
        }
        return {
          status: c.startsAt <= new Date() ? 'ACTIVE' : 'APPROVED',
          pausedBy: null,
          reviewNote: null,
        };
      },
    });
  }

  // ---------------------------------------------------------------- advertisers --

  /** People who run campaigns, with what they have run, newest first. Totals only, never their audience. */
  async advertisers(q: {
    q?: string | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
  }) {
    const limit = clampLimit(q.limit);
    const c = decodeCursor(q.cursor, advertiserCursor);
    const text = q.q?.trim().toLowerCase();
    const rows = await this.prisma.user.findMany({
      where: {
        adCampaigns: { some: {} },
        ...(text ? { username: { startsWith: text.replace(/^@/, '') } } : {}),
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
      select: {
        id: true,
        username: true,
        status: true,
        createdAt: true,
        profile: { select: { displayName: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const ids = page.map((r) => r.id);
    const [byStatus, money] = ids.length
      ? await Promise.all([
          this.prisma.adCampaign.groupBy({
            by: ['advertiserId', 'status'],
            where: { advertiserId: { in: ids } },
            _count: { _all: true },
          }),
          this.prisma.adCampaign.groupBy({
            by: ['advertiserId'],
            where: {
              advertiserId: { in: ids },
              status: { notIn: ['DRAFT', 'REJECTED', 'CANCELLED'] },
            },
            _sum: { budgetTotal: true, spent: true },
          }),
        ])
      : [[], []];
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.createdAt.toISOString(), id: r.id }),
      (r) => {
        const counts = Object.fromEntries(
          byStatus.filter((s) => s.advertiserId === r.id).map((s) => [s.status, s._count._all]),
        );
        const m = money.find((x) => x.advertiserId === r.id);
        return {
          id: r.id,
          username: r.username,
          displayName: r.profile?.displayName ?? r.username,
          status: r.status,
          campaigns: counts,
          total: Object.values(counts).reduce((a, b) => a + b, 0),
          committed: formatRupees(fromDatabase(m?._sum.budgetTotal)),
          spent: formatRupees(fromDatabase(m?._sum.spent)),
          since: r.createdAt.toISOString(),
        };
      },
    );
  }
}
