import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../../admin/audit/audit.service.js';
import { StepUpService } from '../../auth/step-up.service.js';
import { maskLast4 } from '../../common/crypto/mask.js';
import { Errors } from '../../common/errors/app-error.js';
import type { AdminAuthContext } from '../../common/http/request.js';
import { uuidv7 } from '../../common/ids.js';
import { Page, clampLimit, decodeCursor } from '../../common/pagination/cursor.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { PayoutRequest, PayoutStatus, Prisma } from '../../generated/prisma/client.js';
import { LedgerService } from '../../ledger/ledger.service.js';
import { type Paise, formatRupees, fromDatabase, parseRupees } from '../../ledger/money.js';
import { NotificationService } from '../../notifications/notification.service.js';
import { BankAccountsService } from '../bank/bank.service.js';
import { KycService } from '../kyc/kyc.service.js';
import { PaymentSettings } from '../payment-settings.js';
import { PayoutProvider } from '../providers/providers.js';

const cursorSchema = z.object({ t: z.string(), id: z.string() });
const KEY_FORMAT = /^[A-Za-z0-9_-]{8,100}$/;
/** An account younger than this sends even a small payout to a person first. */
const NEW_ACCOUNT_DAYS = 7;
/** Statuses in which the money is spoken for and the creator can still change their mind. */
const CANCELLABLE: PayoutStatus[] = ['REQUESTED', 'PENDING_REVIEW', 'APPROVED', 'ON_HOLD'];
/** Statuses that count against the day's limit. */
const COUNTS_TOWARDS_LIMIT: PayoutStatus[] = [
  'REQUESTED',
  'PENDING_REVIEW',
  'APPROVED',
  'PROCESSING',
  'COMPLETED',
  'ON_HOLD',
];

interface Meta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface ChecklistItem {
  key: 'identity' | 'bankAccount' | 'monetization' | 'noHold' | 'accountStanding' | 'balance';
  met: boolean;
}

/**
 * Payout requests: from "I want my money" to money in a bank account.
 *
 *   request    The server re-checks everything (identity, a verified bank account in the person's own
 *              name, monetisation in good standing, no hold, enough balance, the limits), asks for a
 *              fresh step-up above a threshold, and in the same transaction **moves the amount out
 *              of the creator's balance into clearing** with a ledger journal. The money is spoken
 *              for the moment it is requested, so it cannot be requested twice.
 *   review     Large payouts, and any from a new account, wait for a person; very large ones for
 *              two different people.
 *   send       A worker sends approved payouts through the payout provider (the same payout id is
 *              the provider's idempotency reference, so a retry cannot pay twice).
 *   settle     When the provider reports the outcome, the ledger records it: paid out, or the hold
 *              reversed and the money back with the creator.
 *
 * A client can ask; it can never approve, mark paid, or choose a state.
 */
@Injectable()
export class PayoutsService {
  private readonly logger = new Logger('Payouts');

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly kyc: KycService,
    private readonly bank: BankAccountsService,
    private readonly stepUp: StepUpService,
    private readonly settings: PaymentSettings,
    private readonly audit: AuditService,
    private readonly provider: PayoutProvider,
    private readonly notifications: NotificationService,
  ) {}

  // ------------------------------------------------------------------- views --

  private async view(
    p: PayoutRequest & { payoutAccount: { bankName: string; accountNumberLast4: string } },
  ) {
    return {
      id: p.id,
      amount: formatRupees(fromDatabase(p.amount)),
      currency: p.currency,
      status: p.status,
      account: {
        bankName: p.payoutAccount.bankName,
        accountNumber: maskLast4(p.payoutAccount.accountNumberLast4),
      },
      requestedAt: p.requestedAt.toISOString(),
      // An estimate, not a promise: banks and rails differ.
      estimatedFrom: p.estimatedFrom?.toISOString() ?? null,
      estimatedTo: p.estimatedTo?.toISOString() ?? null,
      completedAt: p.completedAt?.toISOString() ?? null,
      failureCode: p.failureCode,
      onHold: p.status === 'ON_HOLD',
    };
  }

  // -------------------------------------------------------------- eligibility --

  /** Every condition, each met or not. Only the server decides; the app just shows the list. */
  async checklist(
    userId: string,
  ): Promise<{ items: ChecklistItem[]; balance: Paise; holdUntil: Date | null }> {
    const [user, profile, primary, balance, identity, limits] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { status: true } }),
      this.prisma.creatorProfile.findUnique({ where: { userId } }),
      this.prisma.payoutAccount.findFirst({
        where: { userId, removedAt: null, isPrimary: true, status: 'VERIFIED' },
      }),
      this.ledger.balanceOf(userId),
      this.kyc.isVerified(userId),
      this.settings.payoutLimits(),
    ]);
    const holdActive = !!profile?.payoutHoldUntil && profile.payoutHoldUntil > new Date();
    const items: ChecklistItem[] = [
      { key: 'identity', met: identity },
      { key: 'bankAccount', met: !!primary },
      {
        key: 'monetization',
        met: profile?.monetizationStatus === 'ELIGIBLE' || profile?.monetizationStatus === 'ACTIVE',
      },
      { key: 'noHold', met: !holdActive },
      { key: 'accountStanding', met: user?.status === 'ACTIVE' },
      { key: 'balance', met: balance >= limits.min },
    ];
    return { items, balance, holdUntil: holdActive ? (profile?.payoutHoldUntil ?? null) : null };
  }

  async overview(userId: string) {
    const [check, limits, primary, today] = await Promise.all([
      this.checklist(userId),
      this.settings.payoutLimits(),
      this.prisma.payoutAccount.findFirst({
        where: { userId, removedAt: null, isPrimary: true },
        select: { id: true, bankName: true, accountNumberLast4: true, status: true },
      }),
      this.dailyTotal(userId),
    ]);
    return {
      enabled: this.kyc.enabled(),
      eligible: this.kyc.enabled() && check.items.every((i) => i.met),
      checklist: check.items,
      currency: 'INR',
      available: formatRupees(check.balance),
      hold: check.holdUntil
        ? { until: check.holdUntil.toISOString(), reason: 'BANK_ACCOUNT_CHANGED' }
        : null,
      limits: {
        minimum: formatRupees(limits.min),
        maximum: formatRupees(limits.max),
        remainingToday: formatRupees(limits.dailyLimit > today ? limits.dailyLimit - today : 0n),
        stepUpFrom: formatRupees(limits.stepUp),
      },
      primaryAccount: primary
        ? {
            id: primary.id,
            bankName: primary.bankName,
            accountNumber: maskLast4(primary.accountNumberLast4),
            status: primary.status,
          }
        : null,
    };
  }

  private async dailyTotal(
    userId: string,
    db: Pick<Prisma.TransactionClient, 'payoutRequest'> = this.prisma,
  ): Promise<Paise> {
    const sum = await db.payoutRequest.aggregate({
      where: {
        userId,
        status: { in: COUNTS_TOWARDS_LIMIT },
        requestedAt: { gt: new Date(Date.now() - 24 * 3_600_000) },
      },
      _sum: { amount: true },
    });
    return fromDatabase(sum._sum.amount);
  }

  // ----------------------------------------------------------------- request --

  async request(
    userId: string,
    input: { amount: string; accountId?: string | undefined },
    idempotencyKey: string | undefined,
    stepUpToken: string | undefined,
    meta: Meta,
  ) {
    this.kyc.assertEnabled();
    if (!idempotencyKey || !KEY_FORMAT.test(idempotencyKey)) {
      throw Errors.validation([
        { field: 'Idempotency-Key', reasons: [idempotencyKey ? 'invalid_format' : 'required'] },
      ]);
    }
    let amount: Paise;
    try {
      amount = parseRupees(input.amount);
    } catch {
      throw Errors.validation([{ field: 'amount', reasons: ['invalid_amount'] }]);
    }

    // A repeat of the same request returns the first answer; a different request on the same key is refused.
    const existing = await this.prisma.payoutRequest.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      include: { payoutAccount: { select: { bankName: true, accountNumberLast4: true } } },
    });
    if (existing) {
      if (
        fromDatabase(existing.amount) !== amount ||
        (input.accountId && input.accountId !== existing.payoutAccountId)
      ) {
        throw Errors.conflict(
          'That Idempotency-Key was already used for a different payout.',
          'IDEMPOTENCY_CONFLICT',
        );
      }
      return this.view(existing);
    }

    const limits = await this.settings.payoutLimits();
    if (amount < limits.min || amount > limits.max) {
      throw Errors.validation([
        { field: 'amount', reasons: [amount < limits.min ? 'below_minimum' : 'above_maximum'] },
      ]);
    }
    const check = await this.checklist(userId);
    const unmet = check.items.filter((i) => !i.met).map((i) => i.key);
    if (unmet.length)
      throw Errors.conflict('You cannot request a payout yet.', 'CONFLICT', { unmet });
    if (amount > check.balance)
      throw Errors.conflict('That is more than your available balance.', 'INSUFFICIENT_FUNDS');

    const account = await this.prisma.payoutAccount.findFirst({
      where: input.accountId
        ? { id: input.accountId, userId, removedAt: null, status: 'VERIFIED' }
        : { userId, removedAt: null, isPrimary: true, status: 'VERIFIED' },
    });
    if (!account) throw Errors.validation([{ field: 'accountId', reasons: ['not_available'] }]);

    const today = await this.dailyTotal(userId);
    if (today + amount > limits.dailyLimit) {
      throw Errors.conflict('That would go over your daily payout limit.', 'CONFLICT', {
        remainingToday: formatRupees(limits.dailyLimit > today ? limits.dailyLimit - today : 0n),
      });
    }

    // Large payouts need a fresh confirmation that it is really the owner.
    if (amount >= limits.stepUp) await this.stepUp.consume(userId, 'REQUEST_PAYOUT', stepUpToken);

    const newAccount = Date.now() - account.createdAt.getTime() < NEW_ACCOUNT_DAYS * 86_400_000;
    const large = amount >= limits.review;
    const needsReview = large || newAccount;
    const id = uuidv7();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.payoutRequest.create({
          data: {
            id,
            userId,
            payoutAccountId: account.id,
            amount: formatRupees(amount),
            idempotencyKey,
            status: 'REQUESTED',
            riskFlags: needsReview ? { large, newAccount } : undefined,
            estimatedFrom: new Date(Date.now() + 86_400_000),
            estimatedTo: new Date(Date.now() + 3 * 86_400_000),
          },
        });
        // The amount leaves the creator's balance now. If it is more than they have, the database
        // refuses (a creator's balance can never go negative), and nothing is created.
        const hold = await this.ledger.post(
          {
            type: 'PAYOUT_REQUESTED',
            idempotencyKey: `payout-hold:${id}`,
            memo: 'Payout requested',
            reference: { type: 'payout_request', id },
            lines: [
              { account: { kind: 'creator', userId }, direction: 'DEBIT', amount },
              {
                account: { kind: 'platform', type: 'PAYOUT_CLEARING' },
                direction: 'CREDIT',
                amount,
              },
            ],
            actor: { type: 'USER', id: userId },
          },
          tx,
        );
        await tx.payoutRequest.update({
          where: { id },
          data: {
            holdJournalId: hold.journalId,
            status: needsReview ? 'PENDING_REVIEW' : 'APPROVED',
            ...(needsReview ? {} : { approvedAt: new Date() }),
          },
        });
        await this.audit.record(
          {
            actorType: 'USER',
            actorId: userId,
            action: 'payout.requested',
            targetType: 'payout_request',
            targetId: id,
            after: {
              amount: formatRupees(amount),
              status: needsReview ? 'PENDING_REVIEW' : 'APPROVED',
              accountLast4: account.accountNumberLast4,
            },
            ...meta,
          },
          tx,
        );
      });
    } catch (error) {
      // Two identical requests at the same instant: the second finds the first.
      if ((error as { code?: string }).code === 'P2002') {
        const first = await this.prisma.payoutRequest.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey } },
          include: { payoutAccount: { select: { bankName: true, accountNumberLast4: true } } },
        });
        if (first) return this.view(first);
      }
      throw error;
    }
    return this.get(userId, id);
  }

  async get(userId: string, id: string) {
    const p = await this.prisma.payoutRequest.findFirst({
      where: { id, userId },
      include: { payoutAccount: { select: { bankName: true, accountNumberLast4: true } } },
    });
    if (!p) throw Errors.notFound('Payout');
    return this.view(p);
  }

  async list(userId: string, q: { cursor?: string | undefined; limit?: number | undefined }) {
    const limit = clampLimit(q.limit);
    const after = decodeCursor(q.cursor, cursorSchema);
    const rows = await this.prisma.payoutRequest.findMany({
      where: {
        userId,
        ...(after
          ? {
              OR: [
                { requestedAt: { lt: new Date(after.t) } },
                { requestedAt: new Date(after.t), id: { lt: after.id } },
              ],
            }
          : {}),
      },
      include: { payoutAccount: { select: { bankName: true, accountNumberLast4: true } } },
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const views = await Promise.all(rows.slice(0, limit).map((r) => this.view(r)));
    const byId = new Map(views.map((v) => [v.id, v]));
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.requestedAt.toISOString(), id: r.id }),
      (r) => byId.get(r.id) as (typeof views)[number],
    );
  }

  /** The creator changes their mind before it has been sent: the money goes back. */
  async cancel(userId: string, id: string, meta: Meta) {
    const p = await this.prisma.payoutRequest.findFirst({ where: { id, userId } });
    if (!p) throw Errors.notFound('Payout');
    await this.releaseHold(
      p.id,
      CANCELLABLE,
      'CANCELLED',
      'PAYOUT_REVERSED',
      { type: 'USER', id: userId },
      'payout.cancelled',
      undefined,
      meta,
    );
    return this.get(userId, id);
  }

  /**
   * Puts the held amount back and ends the payout, in one transaction, only if it is still in
   * one of the `from` states. The state change comes first and is guarded, so of a cancel and a
   * send arriving together exactly one wins.
   */
  private async releaseHold(
    id: string,
    from: PayoutStatus[],
    to: PayoutStatus,
    journalType: 'PAYOUT_REVERSED' | 'PAYOUT_FAILED',
    actor: { type: 'USER' | 'ADMIN' | 'SYSTEM'; id?: string | undefined },
    auditAction: string,
    detail?: { failureCode?: string | undefined; note?: string | undefined },
    meta: Meta = {},
    actorLabel?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payoutRequest.updateMany({
        where: { id, status: { in: from } },
        data: { status: to, ...(detail?.failureCode ? { failureCode: detail.failureCode } : {}) },
      });
      if (claimed.count !== 1) throw Errors.conflict('This payout can no longer be changed.');
      const p = await tx.payoutRequest.findUniqueOrThrow({ where: { id } });
      const amount = fromDatabase(p.amount);
      await this.ledger.post(
        {
          type: journalType,
          idempotencyKey: `payout-reverse:${id}`,
          memo: `Payout ${to.toLowerCase()}`,
          reference: { type: 'payout_request', id },
          reversalOfId: p.holdJournalId ?? undefined,
          lines: [
            { account: { kind: 'platform', type: 'PAYOUT_CLEARING' }, direction: 'DEBIT', amount },
            { account: { kind: 'creator', userId: p.userId }, direction: 'CREDIT', amount },
          ],
          actor: { type: actor.type, id: actor.id },
        },
        tx,
      );
      await this.audit.record(
        {
          actorType: actor.type,
          actorId: actor.id,
          actorLabel,
          action: auditAction,
          targetType: 'payout_request',
          targetId: id,
          reason: detail?.note,
          before: { status: p.status },
          after: { status: to, amount: formatRupees(amount) },
          ...meta,
        },
        tx,
      );
    });
    await this.tell(id, to);
  }

  private async tell(id: string, status: PayoutStatus): Promise<void> {
    const p = await this.prisma.payoutRequest.findUnique({
      where: { id },
      select: { userId: true, amount: true },
    });
    if (!p) return;
    await this.notifications
      .notify({
        userId: p.userId,
        type: 'PAYOUT_STATUS',
        template: 'payout_status',
        vars: { amount: formatRupees(fromDatabase(p.amount)), status },
        severity: 'INFO',
        category: 'security',
        data: { payoutId: id, status },
        dedupeKey: `payout:${id}:${status}`,
      })
      .catch(() => undefined);
  }

  // ------------------------------------------------------------- staff review --

  async queue(q: {
    status?: string | undefined;
    userId?: string | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
  }) {
    const limit = clampLimit(q.limit);
    const after = decodeCursor(q.cursor, cursorSchema);
    const rows = await this.prisma.payoutRequest.findMany({
      where: {
        ...(q.status ? { status: q.status as PayoutStatus } : {}),
        ...(q.userId ? { userId: q.userId } : {}),
        ...(after
          ? {
              OR: [
                { requestedAt: { lt: new Date(after.t) } },
                { requestedAt: new Date(after.t), id: { lt: after.id } },
              ],
            }
          : {}),
      },
      include: {
        payoutAccount: { select: { bankName: true, accountNumberLast4: true } },
        _count: { select: { approvals: true } },
      },
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const views = new Map<string, Awaited<ReturnType<PayoutsService['view']>>>();
    for (const r of rows.slice(0, limit)) views.set(r.id, await this.view(r));
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.requestedAt.toISOString(), id: r.id }),
      (r) => ({
        ...(views.get(r.id) as NonNullable<ReturnType<typeof views.get>>),
        userId: r.userId,
        riskFlags: r.riskFlags,
        approvals: r._count.approvals,
        holdReason: r.holdReason,
      }),
    );
  }

  async detail(id: string) {
    const p = await this.prisma.payoutRequest.findUnique({
      where: { id },
      include: {
        payoutAccount: { select: { bankName: true, accountNumberLast4: true } },
        approvals: {
          include: { admin: { select: { name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!p) throw Errors.notFound('Payout');
    return {
      ...(await this.view(p)),
      userId: p.userId,
      riskFlags: p.riskFlags,
      holdReason: p.holdReason,
      providerReference: p.providerReference,
      approvals: p.approvals.map((a) => ({
        decision: a.decision,
        note: a.note,
        by: a.admin.name,
        at: a.createdAt.toISOString(),
      })),
    };
  }

  /**
   * One approval, with a note. A payout at or above the dual-approval amount needs a second,
   * *different* person; the database stops one person voting twice. When enough have approved,
   * it becomes eligible to be sent.
   */
  async approve(actor: AdminAuthContext, id: string, note: string, meta: Meta) {
    const limits = await this.settings.payoutLimits();
    await this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<
        { status: string; amount: string }[]
      >`SELECT status::text AS status, amount::text AS amount FROM payout_requests WHERE id = ${id}::uuid FOR UPDATE`;
      if (!row) throw Errors.notFound('Payout');
      if (row.status !== 'PENDING_REVIEW')
        throw Errors.conflict('Only a payout waiting for review can be approved.');
      const amount = fromDatabase(row.amount);
      const required = amount >= limits.dualApproval ? 2 : 1;
      const voted = await tx.payoutApproval.findUnique({
        where: { payoutRequestId_adminId: { payoutRequestId: id, adminId: actor.adminId } },
      });
      if (voted)
        throw Errors.conflict(
          'You have already given your decision on this payout. Another person must give the next.',
        );
      await tx.payoutApproval.create({
        data: { payoutRequestId: id, adminId: actor.adminId, decision: 'APPROVE', note },
      });
      const approvals = await tx.payoutApproval.count({
        where: { payoutRequestId: id, decision: 'APPROVE' },
      });
      const done = approvals >= required;
      if (done) {
        await tx.payoutRequest.update({
          where: { id },
          data: { status: 'APPROVED', approvedById: actor.adminId, approvedAt: new Date() },
        });
      }
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'payout.approved',
          targetType: 'payout_request',
          targetId: id,
          reason: note,
          after: { approvals, required, status: done ? 'APPROVED' : 'PENDING_REVIEW' },
          ...meta,
        },
        tx,
      );
    });
    return this.detail(id);
  }

  async reject(actor: AdminAuthContext, id: string, note: string, meta: Meta) {
    const exists = await this.prisma.payoutRequest.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw Errors.notFound('Payout');
    await this.prisma.payoutApproval
      .create({ data: { payoutRequestId: id, adminId: actor.adminId, decision: 'REJECT', note } })
      .catch(() => undefined); // one decision per person; a repeat is not an error
    await this.releaseHold(
      id,
      ['PENDING_REVIEW', 'APPROVED', 'ON_HOLD'],
      'REJECTED',
      'PAYOUT_REVERSED',
      { type: 'ADMIN', id: actor.adminId },
      'payout.rejected',
      { note },
      meta,
      actor.name,
    );
    return this.detail(id);
  }

  async hold(actor: AdminAuthContext, id: string, note: string, meta: Meta) {
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.payoutRequest.updateMany({
        where: { id, status: { in: ['PENDING_REVIEW', 'APPROVED'] } },
        data: { status: 'ON_HOLD', holdReason: note.slice(0, 200) },
      });
      if (res.count !== 1)
        throw Errors.conflict('Only a payout waiting for review or approved can be put on hold.');
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'payout.held',
          targetType: 'payout_request',
          targetId: id,
          reason: note,
          after: { status: 'ON_HOLD' },
          ...meta,
        },
        tx,
      );
    });
    return this.detail(id);
  }

  /** Takes a payout off hold. It goes back to review, and earlier approvals no longer stand: it is looked at afresh. */
  async resume(actor: AdminAuthContext, id: string, note: string, meta: Meta) {
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.payoutRequest.updateMany({
        where: { id, status: 'ON_HOLD' },
        data: { status: 'PENDING_REVIEW', holdReason: null, approvedAt: null, approvedById: null },
      });
      if (res.count !== 1) throw Errors.conflict('Only a payout on hold can be resumed.');
      await tx.payoutApproval.deleteMany({ where: { payoutRequestId: id, decision: 'APPROVE' } });
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'payout.resumed',
          targetType: 'payout_request',
          targetId: id,
          reason: note,
          after: { status: 'PENDING_REVIEW' },
          ...meta,
        },
        tx,
      );
    });
    return this.detail(id);
  }

  /** Tries to send an approved payout now (it was approved but the send failed, or has not run yet). */
  async retry(actor: AdminAuthContext, id: string, meta: Meta) {
    const p = await this.prisma.payoutRequest.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!p) throw Errors.notFound('Payout');
    if (p.status !== 'APPROVED')
      throw Errors.conflict('Only an approved payout that has not been sent can be retried.');
    await this.audit.record({
      actorType: 'ADMIN',
      actorId: actor.adminId,
      actorLabel: actor.name,
      action: 'payout.retried',
      targetType: 'payout_request',
      targetId: id,
      ...meta,
    });
    await this.send(id);
    return this.detail(id);
  }

  // ------------------------------------------------------------------ workers --

  /** Sends approved payouts. Safe to run on every instance: each payout is claimed with a guarded state change. */
  async sendApproved(limit = 25): Promise<number> {
    const due = await this.prisma.payoutRequest.findMany({
      where: { status: 'APPROVED' },
      orderBy: { requestedAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    let sent = 0;
    for (const { id } of due) if (await this.send(id)) sent++;
    return sent;
  }

  private async send(id: string): Promise<boolean> {
    const p = await this.prisma.payoutRequest.findUnique({ where: { id } });
    if (!p || p.status !== 'APPROVED') return false;

    // Standing is checked again at the last moment: a bank change or a suspension since approval pauses it for a person.
    const [identity, profile] = await Promise.all([
      this.kyc.isVerified(p.userId),
      this.prisma.creatorProfile.findUnique({ where: { userId: p.userId } }),
    ]);
    const onHold = !!profile?.payoutHoldUntil && profile.payoutHoldUntil > new Date();
    if (!identity || onHold || profile?.monetizationStatus === 'SUSPENDED') {
      await this.prisma.payoutRequest.updateMany({
        where: { id, status: 'APPROVED' },
        data: {
          status: 'ON_HOLD',
          holdReason: !identity
            ? 'IDENTITY_NOT_VERIFIED'
            : profile?.monetizationStatus === 'SUSPENDED'
              ? 'MONETIZATION_SUSPENDED'
              : 'BANK_ACCOUNT_CHANGED',
        },
      });
      return false;
    }
    const claimed = await this.prisma.payoutRequest.updateMany({
      where: { id, status: 'APPROVED' },
      data: { status: 'PROCESSING', processingAt: new Date() },
    });
    if (claimed.count !== 1) return false;
    try {
      const account = await this.bank.detailsForPayout(p.payoutAccountId);
      const result = await this.provider.send({
        reference: p.id,
        amount: formatRupees(fromDatabase(p.amount)),
        accountNumber: account.accountNumber,
        ifsc: account.ifsc,
        holderName: account.holderName,
        narration: 'BLOCKS creator reward',
      });
      await this.prisma.payoutRequest.update({
        where: { id },
        data: { providerReference: result.providerReference },
      });
      if (result.status === 'FAILED') await this.fail(id, result.failureCode ?? 'PROVIDER_FAILED');
      return true;
    } catch (error) {
      // The provider could not be reached: back to approved, to be tried again. The provider treats
      // a repeat of the same reference as the same payout, so trying again cannot pay twice.
      this.logger.warn(`could not send payout ${id}: ${(error as Error).message}`);
      await this.prisma.payoutRequest.updateMany({
        where: { id, status: 'PROCESSING', providerReference: null },
        data: { status: 'APPROVED' },
      });
      return false;
    }
  }

  /** Asks the provider how sent payouts ended up and records it in the ledger. */
  async settleProcessing(limit = 50): Promise<number> {
    const rows = await this.prisma.payoutRequest.findMany({
      where: { status: 'PROCESSING', providerReference: { not: null } },
      orderBy: { processingAt: 'asc' },
      take: limit,
    });
    let settled = 0;
    for (const p of rows) {
      try {
        const result = await this.provider.status(p.providerReference as string);
        if (result.status === 'COMPLETED') {
          await this.complete(p.id);
          settled++;
        } else if (result.status === 'FAILED') {
          await this.fail(p.id, result.failureCode ?? 'PROVIDER_FAILED');
          settled++;
        }
      } catch (error) {
        this.logger.warn(`could not check payout ${p.id}: ${(error as Error).message}`);
      }
    }
    return settled;
  }

  /** Money reached the bank: clearing is settled. Once only (guarded state change, unique journal key). */
  private async complete(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payoutRequest.updateMany({
        where: { id, status: 'PROCESSING' },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      if (claimed.count !== 1) return;
      const p = await tx.payoutRequest.findUniqueOrThrow({ where: { id } });
      const amount = fromDatabase(p.amount);
      const settle = await this.ledger.post(
        {
          type: 'PAYOUT_COMPLETED',
          idempotencyKey: `payout-settle:${id}`,
          memo: 'Payout settled',
          reference: { type: 'payout_request', id },
          lines: [
            { account: { kind: 'platform', type: 'PAYOUT_CLEARING' }, direction: 'DEBIT', amount },
            { account: { kind: 'platform', type: 'BANK_SETTLEMENT' }, direction: 'CREDIT', amount },
          ],
          actor: { type: 'SYSTEM' },
        },
        tx,
      );
      await tx.payoutRequest.update({ where: { id }, data: { settleJournalId: settle.journalId } });
      await this.audit.record(
        {
          actorType: 'SYSTEM',
          actorLabel: 'payout-rail',
          action: 'payout.completed',
          targetType: 'payout_request',
          targetId: id,
          after: { amount: formatRupees(amount) },
        },
        tx,
      );
    });
    await this.tell(id, 'COMPLETED');
  }

  /** The bank refused it: the held amount goes back to the creator. */
  private async fail(id: string, failureCode: string): Promise<void> {
    await this.releaseHold(
      id,
      ['PROCESSING'],
      'FAILED',
      'PAYOUT_FAILED',
      { type: 'SYSTEM' },
      'payout.failed',
      { failureCode },
      {},
      'payout-rail',
    ).catch((e) => {
      if ((e as { code?: string }).code !== 'CONFLICT') throw e;
    });
  }
}
