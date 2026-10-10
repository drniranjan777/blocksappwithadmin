import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Errors } from '../common/errors/app-error.js';
import { uuidv7 } from '../common/ids.js';
import { PrismaService } from '../database/prisma.service.js';
import type {
  ActorType,
  LedgerAccountType,
  LedgerDirection,
  LedgerJournalType,
  Prisma,
} from '../generated/prisma/client.js';
import { type Paise, formatRupees, fromDatabase } from './money.js';

export type PlatformAccount = Exclude<LedgerAccountType, 'CREATOR_PAYABLE'>;

export type AccountRef =
  { kind: 'platform'; type: PlatformAccount } | { kind: 'creator'; userId: string };

export interface PostingLine {
  account: AccountRef;
  direction: LedgerDirection;
  /** Whole paise, always positive; the direction says which way it moves. */
  amount: Paise;
}

export interface Posting {
  type: LedgerJournalType;
  /** The same key never posts twice. Make it describe *what* is being posted (e.g. `reward:<cycle>:<creator>`). */
  idempotencyKey: string;
  memo?: string;
  reference?: { type: string; id: string };
  reversalOfId?: string;
  lines: PostingLine[];
  actor: { type: ActorType; id?: string | undefined };
}

/**
 * Which side raises each account. Together with the double-entry rule this fixes what every
 * journal means:
 *
 *   CREATOR_PAYABLE  (credit raises)  what the platform owes a creator
 *   REWARD_POOL      (debit raises)   the total of rewards granted from the pool
 *   ADJUSTMENTS      (debit raises)   the net of manual corrections
 *   PAYOUT_CLEARING  (credit raises)  money earmarked for payout and not yet settled
 *   BANK_SETTLEMENT  (credit raises)  money that has left to bank accounts
 *
 * A reward credits the creator and debits the pool; a payout moves it from the creator to
 * clearing and then to settlement. The funding of the pool itself (cash in) is outside the
 * ledger today and is stated as such wherever the figures are shown.
 */
export const NORMAL_SIDE: Record<LedgerAccountType, LedgerDirection> = {
  CREATOR_PAYABLE: 'CREDIT',
  REWARD_POOL: 'DEBIT',
  ADJUSTMENTS: 'DEBIT',
  PAYOUT_CLEARING: 'CREDIT',
  BANK_SETTLEMENT: 'CREDIT',
};

export interface PostedJournal {
  journalId: string;
  /** True when this key had already been posted and nothing new was written. */
  replayed: boolean;
}

type Tx = Prisma.TransactionClient;

/**
 * The only way money moves.
 *
 * Every movement is a **journal**: a set of entries that balance (debits equal credits),
 * written in one database transaction under a unique idempotency key. The database enforces
 * the rest on its own, whatever code calls it: entries and journals can never be changed or
 * deleted, an account's balance is changed only by its entries (under a row lock, so
 * concurrent postings queue rather than race), and a creator's balance can never go negative.
 *
 * Posting the same key again returns the first result; posting the same key with a different
 * meaning is refused, because that is a bug or an attack, not a retry.
 */
@Injectable()
export class LedgerService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Ledger');

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensurePlatformAccounts().catch((e: Error) =>
      this.logger.error(`could not create the platform ledger accounts: ${e.message}`),
    );
  }

  /** The platform's own accounts, created once. Safe to call repeatedly and concurrently. */
  async ensurePlatformAccounts(): Promise<void> {
    for (const type of [
      'REWARD_POOL',
      'ADJUSTMENTS',
      'PAYOUT_CLEARING',
      'BANK_SETTLEMENT',
    ] as const) {
      await this.ensureAccount(this.prisma, { kind: 'platform', type });
    }
  }

  /** Finds an account, creating it if need be. `ON CONFLICT DO NOTHING` so concurrent callers cannot clash. */
  private async ensureAccount(
    db: Pick<Tx, '$executeRaw' | 'ledgerAccount'>,
    ref: AccountRef,
  ): Promise<string> {
    const type: LedgerAccountType = ref.kind === 'creator' ? 'CREATOR_PAYABLE' : ref.type;
    const owner = ref.kind === 'creator' ? ref.userId : null;
    const find = () =>
      db.ledgerAccount.findFirst({ where: { type, ownerUserId: owner }, select: { id: true } });
    const existing = await find();
    if (existing) return existing.id;
    await db.$executeRaw`
      INSERT INTO ledger_accounts (id, type, owner_user_id, normal_side, updated_at)
      VALUES (${uuidv7()}::uuid, ${type}::ledger_account_type, ${owner}::uuid, ${NORMAL_SIDE[type]}::ledger_direction, now())
      ON CONFLICT DO NOTHING`;
    const created = await find();
    if (!created) throw new Error('ledger account could not be created');
    return created.id;
  }

  private assertBalanced(lines: PostingLine[]): void {
    if (lines.length < 2) throw new RangeError('a journal needs at least two entries');
    let net = 0n;
    for (const l of lines) {
      if (l.amount <= 0n) throw new RangeError('entry amounts must be positive');
      net += l.direction === 'DEBIT' ? l.amount : -l.amount;
    }
    if (net !== 0n)
      throw new RangeError(`journal does not balance (debits minus credits = ${net} paise)`);
  }

  private totalOf(lines: PostingLine[]): Paise {
    return lines.filter((l) => l.direction === 'DEBIT').reduce((sum, l) => sum + l.amount, 0n);
  }

  /**
   * Posts a journal. Pass `tx` to make it part of a larger transaction (a reward and the
   * earning row that records it, say), so they succeed or fail together.
   */
  async post(input: Posting, tx?: Tx): Promise<PostedJournal> {
    this.assertBalanced(input.lines);
    if (tx) return this.postIn(tx, input);
    return this.prisma.$transaction((t) => this.postIn(t, input));
  }

  private async postIn(tx: Tx, input: Posting): Promise<PostedJournal> {
    const existing = await tx.ledgerJournal.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { entries: { select: { direction: true, amount: true } } },
    });
    if (existing) {
      const debits = existing.entries
        .filter((e) => e.direction === 'DEBIT')
        .reduce((sum, e) => sum + fromDatabase(e.amount), 0n);
      if (
        existing.type !== input.type ||
        debits !== this.totalOf(input.lines) ||
        (existing.referenceId ?? null) !== (input.reference?.id ?? null)
      ) {
        throw Errors.conflict(
          'That idempotency key was already used for a different movement of money.',
          'IDEMPOTENCY_CONFLICT',
        );
      }
      return { journalId: existing.id, replayed: true };
    }

    const entries: Prisma.FinancialLedgerEntryCreateWithoutJournalInput[] = [];
    for (const line of input.lines) {
      const accountId = await this.ensureAccount(tx, line.account);
      entries.push({
        account: { connect: { id: accountId } },
        direction: line.direction,
        amount: formatRupees(line.amount),
      });
    }
    try {
      const journal = await tx.ledgerJournal.create({
        data: {
          type: input.type,
          idempotencyKey: input.idempotencyKey,
          memo: input.memo?.slice(0, 300) ?? null,
          referenceType: input.reference?.type ?? null,
          referenceId: input.reference?.id ?? null,
          reversalOfId: input.reversalOfId ?? null,
          createdByType: input.actor.type,
          createdById: input.actor.id ?? null,
          entries: { create: entries },
        },
        select: { id: true },
      });
      return { journalId: journal.id, replayed: false };
    } catch (error) {
      throw this.translate(error);
    }
  }

  /** Database refusals become answers a caller can act on. */
  private translate(error: unknown): unknown {
    const text = `${(error as { message?: string }).message ?? ''}`;
    if (/ledger_accounts_payable_not_overdrawn/.test(text)) {
      return Errors.conflict('That would take the balance below zero.', 'INSUFFICIENT_FUNDS');
    }
    return error;
  }

  // ------------------------------------------------------------------ reading --

  /** What the platform owes this creator right now. */
  async balanceOf(userId: string): Promise<Paise> {
    const account = await this.prisma.ledgerAccount.findFirst({
      where: { type: 'CREATOR_PAYABLE', ownerUserId: userId },
      select: { balance: true },
    });
    return fromDatabase(account?.balance);
  }

  /** One creator's entries, newest first, as they are shown to the creator. */
  async entriesOf(
    userId: string,
    page: { limit: number; after?: { t: string; id: string } | undefined },
  ) {
    const rows = await this.prisma.financialLedgerEntry.findMany({
      where: {
        account: { type: 'CREATOR_PAYABLE', ownerUserId: userId },
        ...(page.after
          ? {
              OR: [
                { createdAt: { lt: new Date(page.after.t) } },
                { createdAt: new Date(page.after.t), id: { lt: page.after.id } },
              ],
            }
          : {}),
      },
      include: {
        journal: {
          select: { id: true, type: true, memo: true, referenceType: true, referenceId: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: page.limit + 1,
    });
    return rows;
  }
}
