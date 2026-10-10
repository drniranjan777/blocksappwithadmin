import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../../admin/audit/audit.service.js';
import { StepUpService } from '../../auth/step-up.service.js';
import { BlindIndex, FieldCipher } from '../../common/crypto/field-cipher.js';
import { maskLast4, maskName } from '../../common/crypto/mask.js';
import { Errors, type FieldIssue } from '../../common/errors/app-error.js';
import type { AdminAuthContext } from '../../common/http/request.js';
import { uuidv7 } from '../../common/ids.js';
import { Page, clampLimit, decodeCursor } from '../../common/pagination/cursor.js';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  NameMatch,
  PayoutAccount,
  PayoutAccountStatus,
  Prisma,
} from '../../generated/prisma/client.js';
import { NotificationService } from '../../notifications/notification.service.js';
import { SecurityEventService } from '../../security/security-events.service.js';
import { cleanLine } from '../../social/shared/text.js';
import { compareNames, normaliseAccountNumber, normaliseIfsc } from '../identifiers.js';
import { KycService } from '../kyc/kyc.service.js';
import { PaymentSettings } from '../payment-settings.js';
import { BankVerificationProvider } from '../providers/providers.js';
import type { AddBankAccountDto, BankReviewDto } from './bank.dto.js';

const cursorSchema = z.object({ t: z.string(), id: z.string() });
const HOLDER = /^[\p{L}][\p{L}\p{M}\s.'-]{1,119}$/u;
/** Payouts in these states still depend on the account, so it cannot be removed. */
const OPEN_PAYOUTS = ['REQUESTED', 'PENDING_REVIEW', 'APPROVED', 'PROCESSING', 'ON_HOLD'] as const;

/**
 * A small sample of the bank directory, so a typed IFSC can show a bank name in development.
 * A real directory (the RBI IFSC list or the provider's lookup) replaces it; an unknown prefix
 * is still accepted if the code has the right shape.
 */
const BANKS: Record<string, string> = {
  HDFC: 'HDFC Bank',
  ICIC: 'ICICI Bank',
  SBIN: 'State Bank of India',
  UTIB: 'Axis Bank',
  KKBK: 'Kotak Mahindra Bank',
  PUNB: 'Punjab National Bank',
  BARB: 'Bank of Baroda',
  CNRB: 'Canara Bank',
  IDIB: 'Indian Bank',
  YESB: 'YES Bank',
  INDB: 'IndusInd Bank',
  UBIN: 'Union Bank of India',
  IDFB: 'IDFC FIRST Bank',
};
export const bankNameFor = (ifsc: string): string =>
  BANKS[ifsc.slice(0, 4)] ?? `Bank ${ifsc.slice(0, 4)}`;

interface Meta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

/**
 * Payout bank accounts.
 *
 * The rules, in the order they matter:
 *   - an account is added only by someone whose **identity is verified**, after a **step-up**;
 *   - whether it exists and whose it is comes from a **bank-verification provider**, and the
 *     name the bank holds is compared *on the server* with the verified legal name: a clear
 *     match is verified, a partial one waits for a person, a mismatch is refused;
 *   - the number is encrypted, found again by a keyed hash (so the same account cannot sit on
 *     two people's profiles, or twice on one), and shown only as its last four digits;
 *   - any change (add, make primary, remove) pauses payouts for a while and tells the owner,
 *     so a thief with a stolen session cannot add their own account and drain the balance
 *     before the owner notices.
 */
@Injectable()
export class BankAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
    private readonly blind: BlindIndex,
    private readonly provider: BankVerificationProvider,
    private readonly kyc: KycService,
    private readonly stepUp: StepUpService,
    private readonly settings: PaymentSettings,
    private readonly audit: AuditService,
    private readonly security: SecurityEventService,
    private readonly notifications: NotificationService,
  ) {}

  private view(a: PayoutAccount) {
    return {
      id: a.id,
      bankName: a.bankName,
      ifsc: a.ifsc,
      accountNumber: maskLast4(a.accountNumberLast4),
      accountType: a.accountType,
      status: a.status,
      nameMatch: a.nameMatch,
      isPrimary: a.isPrimary,
      failureCode: a.failureCode,
      createdAt: a.createdAt.toISOString(),
      verifiedAt: a.verifiedAt?.toISOString() ?? null,
    };
  }

  async list(userId: string) {
    const rows = await this.prisma.payoutAccount.findMany({
      where: { userId, removedAt: null },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map((a) => this.view(a));
  }

  /** Is this code shaped like an IFSC, and which bank does it name? (Shape, not existence.) */
  ifsc(code: string) {
    const ifsc = normaliseIfsc(code);
    if (!ifsc) throw Errors.validation([{ field: 'ifsc', reasons: ['invalid'] }]);
    return {
      ifsc,
      bankName: bankNameFor(ifsc),
      note: 'The branch is confirmed when the account is verified.',
    };
  }

  // ----------------------------------------------------------------- changes --

  /** Pauses payouts for a while after any change to where money goes, and tells the owner. */
  private async afterChange(
    userId: string,
    action: 'added' | 'changed' | 'removed',
    meta: Meta,
    db: Pick<Prisma.TransactionClient, 'creatorProfile'> = this.prisma,
  ): Promise<void> {
    const hours = (await this.settings.payoutLimits()).newAccountHoldHours;
    const until = new Date(Date.now() + hours * 3_600_000);
    await db.creatorProfile.upsert({
      where: { userId },
      create: { userId, payoutHoldUntil: until, payoutHoldReason: 'BANK_ACCOUNT_CHANGED' },
      update: { payoutHoldUntil: until, payoutHoldReason: 'BANK_ACCOUNT_CHANGED' },
    });
    await this.security
      .record({
        userId,
        type: 'PAYOUT_ACCOUNT_CHANGED',
        severity: 'WARNING',
        ip: meta.ip,
        details: { action },
        notify: { template: 'security_payout_account_changed', vars: { action } },
      })
      .catch(() => undefined);
  }

  async add(userId: string, dto: AddBankAccountDto, stepUpToken: string | undefined, meta: Meta) {
    this.kyc.assertEnabled();
    const issues: FieldIssue[] = [];
    const accountNumber = normaliseAccountNumber(dto.accountNumber);
    const ifsc = normaliseIfsc(dto.ifsc);
    const holderName = cleanLine(dto.holderName);
    // Any 9 to 18 digits is a possible account number (a 12-digit one is not an Aadhaar number here).
    if (!accountNumber) issues.push({ field: 'accountNumber', reasons: ['invalid'] });
    if (!ifsc) issues.push({ field: 'ifsc', reasons: ['invalid'] });
    if (!HOLDER.test(holderName)) issues.push({ field: 'holderName', reasons: ['invalid'] });
    if (issues.length || !accountNumber || !ifsc) throw Errors.validation(issues);

    if (!(await this.kyc.isVerified(userId))) {
      throw Errors.conflict(
        'Verify your identity before adding a bank account.',
        'VERIFICATION_REQUIRED',
      );
    }
    const legalName = await this.kyc.verifiedLegalName(userId);
    if (!legalName)
      throw Errors.conflict(
        'Verify your identity before adding a bank account.',
        'VERIFICATION_REQUIRED',
      );

    const limits = await this.settings.payoutLimits();
    const index = this.blind.of('bank_account', accountNumber);
    const [mine, theirs] = await Promise.all([
      this.prisma.payoutAccount.findMany({
        where: { userId, removedAt: null },
        select: { accountNumberIndex: true, ifsc: true },
      }),
      this.prisma.payoutAccount.findFirst({
        where: {
          accountNumberIndex: index,
          ifsc,
          userId: { not: userId },
          removedAt: null,
          status: { not: 'FAILED' },
        },
        select: { id: true },
      }),
    ]);
    if (mine.length >= limits.maxAccounts)
      throw Errors.conflict(
        'You have reached the number of bank accounts you can keep. Remove one first.',
      );
    if (mine.some((a) => a.accountNumberIndex === index && a.ifsc === ifsc)) {
      throw Errors.conflict('That account is already on your profile.');
    }
    // An account on someone else's profile: the same message, and nothing about whose.
    if (theirs) throw Errors.conflict('That account cannot be added.');

    // Only now, with everything else checked, spend the single-use token.
    await this.stepUp.consume(userId, 'ADD_BANK_ACCOUNT', stepUpToken);

    const check = await this.provider.verify({ accountNumber, ifsc, holderName });
    let status: PayoutAccountStatus = 'FAILED';
    let nameMatch: NameMatch = 'UNKNOWN';
    let failureCode: string | null = check.failureCode ?? 'VERIFICATION_FAILED';
    if (check.status === 'VERIFIED') {
      nameMatch = check.beneficiaryName
        ? compareNames(legalName, check.beneficiaryName)
        : 'UNKNOWN';
      if (nameMatch === 'MATCH') {
        status = 'VERIFIED';
        failureCode = null;
      } else if (nameMatch === 'PARTIAL') {
        status = 'PENDING_VERIFICATION'; // a person must decide
        failureCode = null;
      } else {
        failureCode = 'NAME_MISMATCH';
      }
    }

    const id = uuidv7();
    const account = await this.prisma.$transaction(async (tx) => {
      const hasPrimary =
        (await tx.payoutAccount.count({ where: { userId, removedAt: null, isPrimary: true } })) > 0;
      const created = await tx.payoutAccount.create({
        data: {
          id,
          userId,
          holderNameEnc: this.cipher.encrypt(holderName, `payout_accounts.holder_name_enc:${id}`),
          accountNumberEnc: this.cipher.encrypt(
            accountNumber,
            `payout_accounts.account_number_enc:${id}`,
          ),
          accountNumberLast4: accountNumber.slice(-4),
          accountNumberIndex: index,
          ifsc,
          bankName: bankNameFor(ifsc),
          accountType: dto.accountType ?? 'SAVINGS',
          status,
          nameMatch,
          providerRef: check.reference,
          failureCode,
          verifiedAt: status === 'VERIFIED' ? new Date() : null,
          isPrimary: status === 'VERIFIED' && !hasPrimary,
        },
      });
      await this.afterChange(userId, 'added', meta, tx);
      return created;
    });
    return this.view(account);
  }

  private async owned(userId: string, id: string): Promise<PayoutAccount> {
    const a = await this.prisma.payoutAccount.findFirst({ where: { id, userId, removedAt: null } });
    if (!a) throw Errors.notFound('Bank account');
    return a;
  }

  async makePrimary(userId: string, id: string, stepUpToken: string | undefined, meta: Meta) {
    this.kyc.assertEnabled();
    const account = await this.owned(userId, id);
    if (account.status !== 'VERIFIED')
      throw Errors.conflict('Only a verified account can be your primary account.');
    if (account.isPrimary) return this.view(account);
    await this.stepUp.consume(userId, 'CHANGE_BANK_ACCOUNT', stepUpToken);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.payoutAccount.updateMany({
        where: { userId, isPrimary: true },
        data: { isPrimary: false },
      });
      const a = await tx.payoutAccount.update({ where: { id }, data: { isPrimary: true } });
      await this.afterChange(userId, 'changed', meta, tx);
      return a;
    });
    return this.view(updated);
  }

  async remove(
    userId: string,
    id: string,
    stepUpToken: string | undefined,
    meta: Meta,
  ): Promise<void> {
    this.kyc.assertEnabled();
    const account = await this.owned(userId, id);
    const open = await this.prisma.payoutRequest.count({
      where: { payoutAccountId: id, status: { in: [...OPEN_PAYOUTS] } },
    });
    if (open > 0)
      throw Errors.conflict(
        'This account has a payout in progress. Wait for it to finish, then remove it.',
      );
    await this.stepUp.consume(userId, 'REMOVE_BANK_ACCOUNT', stepUpToken);
    await this.prisma.$transaction(async (tx) => {
      await tx.payoutAccount.update({
        where: { id },
        data: { removedAt: new Date(), isPrimary: false },
      });
      if (account.isPrimary) {
        const next = await tx.payoutAccount.findFirst({
          where: { userId, removedAt: null, status: 'VERIFIED' },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (next)
          await tx.payoutAccount.update({ where: { id: next.id }, data: { isPrimary: true } });
      }
      await this.afterChange(userId, 'removed', meta, tx);
    });
  }

  /** The account details a payout needs, decrypted for the provider call only. Never returned to a client. */
  async detailsForPayout(id: string) {
    const a = await this.prisma.payoutAccount.findUniqueOrThrow({ where: { id } });
    return {
      accountNumber: this.cipher.decrypt(
        a.accountNumberEnc,
        `payout_accounts.account_number_enc:${a.id}`,
      ),
      holderName: this.cipher.decrypt(a.holderNameEnc, `payout_accounts.holder_name_enc:${a.id}`),
      ifsc: a.ifsc,
    };
  }

  // ------------------------------------------------------------------- staff --

  async queue(q: {
    status?: PayoutAccountStatus | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
  }) {
    const limit = clampLimit(q.limit);
    const after = decodeCursor(q.cursor, cursorSchema);
    const rows = await this.prisma.payoutAccount.findMany({
      where: {
        removedAt: null,
        ...(q.status ? { status: q.status } : {}),
        ...(after
          ? {
              OR: [
                { createdAt: { lt: new Date(after.t) } },
                { createdAt: new Date(after.t), id: { lt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.createdAt.toISOString(), id: r.id }),
      (r) => ({
        ...this.view(r),
        userId: r.userId,
        holderName: maskName(
          this.cipher.decrypt(r.holderNameEnc, `payout_accounts.holder_name_enc:${r.id}`),
        ),
      }),
    );
  }

  /**
   * A person's decision on an account the bank said belongs to a *similar* name. They can approve
   * only that case, and only with a reason. A mismatch, or an account the bank could not find,
   * cannot be approved by anyone: the owner has to add an account that matches their identity.
   */
  async review(actor: AdminAuthContext, id: string, dto: BankReviewDto, meta: Meta) {
    const a = await this.prisma.payoutAccount.findUnique({ where: { id } });
    if (!a || a.removedAt) throw Errors.notFound('Bank account');
    if (a.status !== 'PENDING_VERIFICATION') {
      throw Errors.conflict(
        dto.decision === 'APPROVE'
          ? 'Only an account waiting for review can be approved.'
          : 'Only an account waiting for review can be rejected.',
      );
    }
    if (dto.decision === 'APPROVE' && a.nameMatch !== 'PARTIAL') {
      throw Errors.conflict(
        'Only an account whose name partly matches the verified identity can be approved.',
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const hasPrimary =
        (await tx.payoutAccount.count({
          where: { userId: a.userId, removedAt: null, isPrimary: true },
        })) > 0;
      const res = await tx.payoutAccount.updateMany({
        where: { id, status: 'PENDING_VERIFICATION' },
        data:
          dto.decision === 'APPROVE'
            ? {
                status: 'VERIFIED',
                verifiedAt: new Date(),
                isPrimary: !hasPrimary,
                failureCode: null,
              }
            : { status: 'FAILED', failureCode: 'REJECTED_BY_REVIEW' },
      });
      if (res.count !== 1)
        throw Errors.conflict('This account was changed by someone else. Reload and try again.');
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: `bank.${dto.decision.toLowerCase()}`,
          targetType: 'payout_account',
          targetId: id,
          reason: dto.note,
          before: { status: a.status, nameMatch: a.nameMatch },
          after: { status: dto.decision === 'APPROVE' ? 'VERIFIED' : 'FAILED' },
          ...meta,
        },
        tx,
      );
      return tx.payoutAccount.findUniqueOrThrow({ where: { id } });
    });
    await this.notifications
      .notify({
        userId: a.userId,
        type: 'KYC_STATUS',
        template: 'kyc_status',
        vars: {
          status: dto.decision === 'APPROVE' ? 'BANK_ACCOUNT_VERIFIED' : 'BANK_ACCOUNT_REJECTED',
        },
        severity: 'INFO',
        category: 'security',
        data: { payoutAccountId: id },
        dedupeKey: `bank:${id}:${dto.decision}`,
      })
      .catch(() => undefined);
    return this.view(updated);
  }
}
