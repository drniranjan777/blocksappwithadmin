import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../admin/audit/audit.service.js';
import { FieldCipher } from '../common/crypto/field-cipher.js';
import { Errors, type FieldIssue } from '../common/errors/app-error.js';
import type { AdminAuthContext } from '../common/http/request.js';
import { Page, clampLimit, decodeCursor } from '../common/pagination/cursor.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma, VerificationStatus, VerificationType } from '../generated/prisma/client.js';
import { NotificationService } from '../notifications/notification.service.js';
import { isValidGstin, normaliseGstin } from './gstin.js';

const cursorSchema = z.object({ t: z.string(), id: z.string() });
const REQUESTS_PER_DAY = 5;
const DAY = 86_400_000;

interface Meta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

const BADGE: Partial<Record<VerificationType, 'IDENTITY' | 'VERIFIED_PUBLISHER'>> = {
  IDENTITY: 'IDENTITY',
  PUBLISHER: 'VERIFIED_PUBLISHER',
};

const requestInclude = {
  user: { select: { id: true, username: true, status: true } },
  businessPage: { select: { id: true, slug: true, name: true, gstinLast4: true } },
  reviewedBy: { select: { id: true, name: true } },
} satisfies Prisma.VerificationRequestInclude;
type RequestRow = Prisma.VerificationRequestGetPayload<{ include: typeof requestInclude }>;

/**
 * Verification badges: a business page, an identity, a publisher.
 *
 * Asking is the owner's; granting is staff's, and only with `business.verify`. Each badge has a
 * condition the *server* checks both when it is asked for and again when it is granted:
 *
 *   identity    the person's identity verification (KYC) is verified
 *   business    the person owns the page and it is published
 *   publisher   a note explaining the publication, reviewed by a person
 *
 * Nothing here checks anything with an outside authority. A GSTIN is checked for form and check
 * character, not against the government's register; a publisher claim is a person's judgement.
 * Both are listed as needing a verification provider and legal review (docs/security.md).
 * Taking a badge back is its own audited step, and renaming a verified page also removes it.
 */
@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly cipher: FieldCipher,
  ) {}

  // ================================================================== the person ==

  async create(
    userId: string,
    input: {
      type: VerificationType;
      businessPageId?: string | undefined;
      note?: string | undefined;
      gstin?: string | undefined;
    },
  ) {
    const issues: FieldIssue[] = [];
    const note = input.note?.trim() || null;
    if (input.type === 'PUBLISHER' && (!note || note.length < 20))
      issues.push({ field: 'note', reasons: ['explain_the_publication_in_20_characters_or_more'] });
    if (input.type !== 'BUSINESS' && (input.businessPageId || input.gstin))
      issues.push({
        field: input.businessPageId ? 'businessPageId' : 'gstin',
        reasons: ['only_for_business'],
      });
    if (input.type === 'BUSINESS' && !input.businessPageId)
      issues.push({ field: 'businessPageId', reasons: ['required'] });
    const gstin = input.gstin ? normaliseGstin(input.gstin) : null;
    if (gstin && !isValidGstin(gstin))
      issues.push({ field: 'gstin', reasons: ['not_a_valid_gstin'] });
    if (issues.length) throw Errors.validation(issues);

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { status: true, profile: { select: { badge: true } } },
    });
    if (user.status !== 'ACTIVE')
      throw Errors.forbidden('This account cannot ask for verification right now.');
    const recent = await this.prisma.verificationRequest.count({
      where: { userId, submittedAt: { gte: new Date(Date.now() - DAY) } },
    });
    if (recent >= REQUESTS_PER_DAY) throw Errors.rateLimited(3600);

    if (input.type === 'IDENTITY') {
      if (user.profile?.badge === 'IDENTITY') throw Errors.conflict('You already have this badge.');
      const kyc = await this.prisma.kycProfile.findFirst({
        where: { userId, status: 'VERIFIED' },
        select: { id: true },
      });
      if (!kyc) throw Errors.precondition('Complete your identity verification first.');
    }
    if (input.type === 'PUBLISHER' && user.profile?.badge === 'VERIFIED_PUBLISHER')
      throw Errors.conflict('You already have this badge.');

    let pageId: string | null = null;
    if (input.type === 'BUSINESS') {
      const page = await this.prisma.businessPage.findFirst({
        where: { id: input.businessPageId as string, ownerId: userId },
        select: { id: true, status: true, verificationStatus: true },
      });
      if (!page) throw Errors.notFound('Page');
      if (page.status !== 'ACTIVE')
        throw Errors.precondition('Publish the page before asking for verification.');
      if (page.verificationStatus === 'APPROVED')
        throw Errors.conflict('This page is already verified.');
      pageId = page.id;
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.verificationRequest.create({
          data: { userId, type: input.type, businessPageId: pageId, note },
          select: { id: true },
        });
        if (pageId) {
          await tx.businessPage.update({
            where: { id: pageId },
            data: {
              verificationStatus: 'PENDING',
              ...(gstin
                ? {
                    gstinEnc: this.cipher.encrypt(gstin, `business_pages.gstin_enc:${pageId}`),
                    gstinLast4: gstin.slice(-4),
                  }
                : {}),
            },
          });
        }
        return row;
      });
      return this.mineOne(userId, created.id);
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002')
        throw Errors.conflict('You already have a request of this kind waiting.');
      throw e;
    }
  }

  private mineView(r: RequestRow) {
    return {
      id: r.id,
      type: r.type,
      status: r.status,
      page: r.businessPage
        ? { id: r.businessPage.id, slug: r.businessPage.slug, name: r.businessPage.name }
        : null,
      submittedAt: r.submittedAt.toISOString(),
      decidedAt: r.reviewedAt?.toISOString() ?? null,
      // Written for the person, so it is theirs to read.
      outcomeNote: r.reviewedAt ? r.decisionNote : null,
    };
  }

  private async mineOne(userId: string, id: string) {
    const r = await this.prisma.verificationRequest.findFirst({
      where: { id, userId },
      include: requestInclude,
    });
    if (!r) throw Errors.notFound('Request');
    return this.mineView(r);
  }

  async mine(userId: string, q: { cursor?: string | undefined; limit?: number | undefined }) {
    const limit = clampLimit(q.limit);
    const c = decodeCursor(q.cursor, cursorSchema);
    const rows = await this.prisma.verificationRequest.findMany({
      where: {
        userId,
        ...(c
          ? {
              OR: [
                { submittedAt: { lt: new Date(c.t) } },
                { submittedAt: new Date(c.t), id: { lt: c.id } },
              ],
            }
          : {}),
      },
      include: requestInclude,
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.submittedAt.toISOString(), id: r.id }),
      (r) => this.mineView(r),
    );
  }

  // ======================================================================== staff ==

  private card(r: RequestRow) {
    return {
      id: r.id,
      type: r.type,
      status: r.status,
      user: r.user,
      page: r.businessPage
        ? { id: r.businessPage.id, slug: r.businessPage.slug, name: r.businessPage.name }
        : null,
      submittedAt: r.submittedAt.toISOString(),
      reviewedBy: r.reviewedBy,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
    };
  }

  async list(q: {
    status?: VerificationStatus | undefined;
    type?: VerificationType | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
  }) {
    const limit = clampLimit(q.limit);
    const c = decodeCursor(q.cursor, cursorSchema);
    const status = q.status ?? 'PENDING';
    // Waiting requests are worked oldest first; decided ones are read newest first.
    const oldestFirst = status === 'PENDING';
    const rows = await this.prisma.verificationRequest.findMany({
      where: {
        status,
        ...(q.type ? { type: q.type } : {}),
        ...(c
          ? {
              OR: oldestFirst
                ? [
                    { submittedAt: { gt: new Date(c.t) } },
                    { submittedAt: new Date(c.t), id: { gt: c.id } },
                  ]
                : [
                    { submittedAt: { lt: new Date(c.t) } },
                    { submittedAt: new Date(c.t), id: { lt: c.id } },
                  ],
            }
          : {}),
      },
      include: requestInclude,
      orderBy: oldestFirst
        ? [{ submittedAt: 'asc' }, { id: 'asc' }]
        : [{ submittedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.submittedAt.toISOString(), id: r.id }),
      (r) => this.card(r),
    );
  }

  async get(id: string) {
    const r = await this.prisma.verificationRequest.findUnique({
      where: { id },
      include: requestInclude,
    });
    if (!r) throw Errors.notFound('Request');
    const [kyc, profile, reports, before, page] = await Promise.all([
      r.type === 'IDENTITY'
        ? this.prisma.kycProfile.findFirst({
            where: { userId: r.userId },
            orderBy: { submittedAt: 'desc' },
            select: { status: true },
          })
        : null,
      this.prisma.profile.findUnique({
        where: { userId: r.userId },
        select: { badge: true, followersCount: true, postsCount: true },
      }),
      this.prisma.report.count({ where: { targetUserId: r.userId } }),
      this.prisma.verificationRequest.findMany({
        where: { userId: r.userId, id: { not: id } },
        select: { id: true, type: true, status: true, submittedAt: true },
        orderBy: { submittedAt: 'desc' },
        take: 10,
      }),
      r.businessPageId
        ? this.prisma.businessPage.findUnique({
            where: { id: r.businessPageId },
            select: {
              status: true,
              category: true,
              description: true,
              websiteUrl: true,
              contactEmail: true,
              followersCount: true,
              verificationStatus: true,
            },
          })
        : null,
    ]);
    return {
      ...this.card(r),
      note: r.note,
      decisionNote: r.decisionNote,
      evidence: {
        identity: kyc ? { status: kyc.status } : null,
        page: page
          ? {
              ...page,
              gstinLast4: r.businessPage?.gstinLast4 ?? null,
              // Said plainly so nobody takes a well-formed number for a checked one.
              gstinChecked: 'Format and check character only. Not checked against the register.',
            }
          : null,
        account: {
          reportsAgainst: reports,
          badge: profile?.badge ?? 'NONE',
          followers: profile?.followersCount ?? 0,
          posts: profile?.postsCount ?? 0,
        },
      },
      earlier: before.map((b) => ({ ...b, submittedAt: b.submittedAt.toISOString() })),
    };
  }

  async decide(
    actor: AdminAuthContext,
    id: string,
    input: { decision: 'APPROVE' | 'REJECT'; note: string },
    meta: Meta,
  ) {
    let userId = '';
    let type: VerificationType = 'BUSINESS';
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM verification_requests WHERE id = ${id}::uuid FOR UPDATE`;
      const r = await tx.verificationRequest.findUnique({ where: { id } });
      if (!r) throw Errors.notFound('Request');
      if (r.status !== 'PENDING') throw Errors.conflict('This request has already been decided.');
      userId = r.userId;
      type = r.type;
      const approve = input.decision === 'APPROVE';

      if (approve) {
        if (r.type === 'IDENTITY') {
          const kyc = await tx.kycProfile.findFirst({
            where: { userId: r.userId, status: 'VERIFIED' },
            select: { id: true },
          });
          if (!kyc)
            throw Errors.conflict(
              'Their identity verification is not verified, so the badge cannot be granted.',
            );
        }
        if (r.type === 'BUSINESS') {
          const page = r.businessPageId
            ? await tx.businessPage.findUnique({
                where: { id: r.businessPageId },
                select: { status: true },
              })
            : null;
          if (!page || page.status !== 'ACTIVE')
            throw Errors.conflict('The page is no longer published, so it cannot be verified.');
        }
      }
      await tx.verificationRequest.update({
        where: { id },
        data: {
          status: approve ? 'APPROVED' : 'REJECTED',
          reviewedById: actor.adminId,
          reviewedAt: new Date(),
          decisionNote: input.note.trim(),
        },
      });
      if (r.businessPageId) {
        await tx.businessPage.update({
          where: { id: r.businessPageId },
          data: { verificationStatus: approve ? 'APPROVED' : 'REJECTED' },
        });
      }
      const badge = BADGE[r.type];
      if (approve && badge) {
        await tx.profile.update({ where: { userId: r.userId }, data: { badge } });
      }
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: `verification.${approve ? 'approve' : 'reject'}`,
          targetType: 'verification_request',
          targetId: id,
          reason: input.note,
          before: { status: r.status },
          after: { status: approve ? 'APPROVED' : 'REJECTED', type: r.type },
          ...meta,
        },
        tx,
      );
    });
    await this.tell(userId, type, input.decision === 'APPROVE' ? 'approved' : 'rejected', id);
    return this.get(id);
  }

  /** Takes a badge back. Its own step, with its own reason, audited. */
  async revoke(actor: AdminAuthContext, id: string, reason: string, meta: Meta) {
    let userId = '';
    let type: VerificationType = 'BUSINESS';
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM verification_requests WHERE id = ${id}::uuid FOR UPDATE`;
      const r = await tx.verificationRequest.findUnique({ where: { id } });
      if (!r) throw Errors.notFound('Request');
      if (r.status !== 'APPROVED') throw Errors.conflict('Only a granted badge can be taken back.');
      userId = r.userId;
      type = r.type;
      await tx.verificationRequest.update({
        where: { id },
        data: {
          status: 'REJECTED',
          reviewedById: actor.adminId,
          reviewedAt: new Date(),
          decisionNote: `Taken back: ${reason.trim()}`.slice(0, 500),
        },
      });
      if (r.businessPageId) {
        await tx.businessPage.update({
          where: { id: r.businessPageId },
          data: { verificationStatus: 'NONE' },
        });
      }
      const badge = BADGE[r.type];
      if (badge) {
        await tx.profile.updateMany({
          where: { userId: r.userId, badge },
          data: { badge: 'NONE' },
        });
      }
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'verification.revoke',
          targetType: 'verification_request',
          targetId: id,
          reason,
          before: { status: 'APPROVED' },
          after: { status: 'REJECTED', type: r.type },
          ...meta,
        },
        tx,
      );
    });
    await this.tell(userId, type, 'taken_back', id);
    return this.get(id);
  }

  private async tell(
    userId: string,
    type: VerificationType,
    outcome: 'approved' | 'rejected' | 'taken_back',
    requestId: string,
  ): Promise<void> {
    await this.notifications
      .notify({
        userId,
        type: 'SYSTEM',
        template: 'verification_decision',
        vars: { kind: type.toLowerCase(), outcome },
        severity: 'INFO',
        category: 'social',
        data: { requestId },
        dedupeKey: `verification:${requestId}:${outcome}`,
      })
      .catch(() => undefined);
  }
}
