import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../support/database.js';
import { createUser } from '../support/factories.js';

/**
 * The ledger is the one place money lives, so its guarantees are enforced by
 * the database itself and proven here against a real PostgreSQL.
 */
describe('ledger (database level)', () => {
  let db: TestDatabase;
  let poolId: string;
  let payableId: string;
  let userId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    userId = (await createUser(db.prisma)).id;
    poolId = (
      await db.prisma.ledgerAccount.create({
        data: { type: 'REWARD_POOL', normalSide: 'DEBIT' },
      })
    ).id;
    payableId = (
      await db.prisma.ledgerAccount.create({
        data: {
          type: 'CREATOR_PAYABLE',
          normalSide: 'CREDIT',
          ownerUserId: userId,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await db.dispose();
  });

  let sequence = 0;
  const key = (): string => `test-${++sequence}-${Math.random().toString(36).slice(2)}`;

  /** Posts a two-line journal: money moves from `from` to `to`. */
  const post = (
    amount: string,
    lines: { account: string; direction: 'DEBIT' | 'CREDIT' }[],
    idempotencyKey = key(),
  ) =>
    db.prisma.$transaction(async (tx) => {
      const journal = await tx.ledgerJournal.create({
        data: { type: 'ADJUSTMENT', idempotencyKey },
      });
      for (const line of lines) {
        await tx.financialLedgerEntry.create({
          data: {
            journalId: journal.id,
            accountId: line.account,
            direction: line.direction,
            amount,
          },
        });
      }
      return journal;
    });

  const balanceOf = async (id: string): Promise<string> =>
    String((await db.prisma.ledgerAccount.findUniqueOrThrow({ where: { id } })).balance);

  it('starts every account at zero, whatever the insert says', async () => {
    const r = await db.query<{ balance: string }>(
      `INSERT INTO ledger_accounts (id, type, normal_side, balance, updated_at)
       VALUES (gen_random_uuid(), 'ADJUSTMENTS', 'DEBIT', 999.99, now()) RETURNING balance`,
    );
    expect(r.rows[0]?.balance).toBe('0.00');
  });

  it('credits a creator and records the balance after each entry', async () => {
    await post('500.00', [
      { account: poolId, direction: 'DEBIT' },
      { account: payableId, direction: 'CREDIT' },
    ]);
    expect(await balanceOf(payableId)).toBe('500');
    expect(await balanceOf(poolId)).toBe('500');

    const last = await db.prisma.financialLedgerEntry.findFirstOrThrow({
      where: { accountId: payableId },
      orderBy: { createdAt: 'desc' },
    });
    expect(String(last.balanceAfter)).toBe('500');
  });

  it('refuses a journal whose debits and credits differ, at commit', async () => {
    const before = await balanceOf(payableId);
    await expect(
      db.prisma.$transaction(async (tx) => {
        const journal = await tx.ledgerJournal.create({
          data: { type: 'ADJUSTMENT', idempotencyKey: key() },
        });
        // A credit with no matching debit: money from nowhere.
        await tx.financialLedgerEntry.create({
          data: {
            journalId: journal.id,
            accountId: payableId,
            direction: 'CREDIT',
            amount: '250.00',
          },
        });
      }),
    ).rejects.toThrow(/does not balance/);
    expect(await balanceOf(payableId)).toBe(before);
  });

  it('never lets a creator be overdrawn', async () => {
    const before = await balanceOf(payableId);
    await expect(
      post('600.00', [
        { account: payableId, direction: 'DEBIT' },
        { account: poolId, direction: 'CREDIT' },
      ]),
    ).rejects.toThrow(/not_overdrawn|check constraint|violates/i);
    expect(await balanceOf(payableId)).toBe(before);
  });

  it('refuses to post the same idempotency key twice', async () => {
    const k = key();
    await post(
      '1.00',
      [
        { account: poolId, direction: 'DEBIT' },
        { account: payableId, direction: 'CREDIT' },
      ],
      k,
    );
    await expect(
      post(
        '1.00',
        [
          { account: poolId, direction: 'DEBIT' },
          { account: payableId, direction: 'CREDIT' },
        ],
        k,
      ),
    ).rejects.toThrow(/idempotency|unique/i);
  });

  it('makes entries and journals impossible to change or delete', async () => {
    await expect(db.query('UPDATE financial_ledger_entries SET amount = 1')).rejects.toThrow(
      /append-only/,
    );
    await expect(db.query('DELETE FROM financial_ledger_entries')).rejects.toThrow(/append-only/);
    await expect(db.query('TRUNCATE financial_ledger_entries CASCADE')).rejects.toThrow(
      /append-only/,
    );
    await expect(db.query("UPDATE ledger_journals SET memo = 'x'")).rejects.toThrow(/append-only/);
    await expect(db.query('DELETE FROM ledger_journals')).rejects.toThrow(/append-only/);
  });

  it('refuses to edit a balance directly', async () => {
    await expect(
      db.query('UPDATE ledger_accounts SET balance = 1000000 WHERE id = $1', [payableId]),
    ).rejects.toThrow(/only through ledger entries/);
    // The pool is already debit-normal; flipping the creator's account is the change.
    await expect(
      db.query("UPDATE ledger_accounts SET normal_side = 'DEBIT' WHERE id = $1", [payableId]),
    ).rejects.toThrow(/only through ledger entries/);
  });

  it('keeps every account equal to the sum of its entries', async () => {
    for (const id of [poolId, payableId]) {
      const account = await db.prisma.ledgerAccount.findUniqueOrThrow({
        where: { id },
      });
      const entries = await db.prisma.financialLedgerEntry.findMany({
        where: { accountId: id },
      });
      const sum = entries.reduce(
        (acc, e) => (e.direction === account.normalSide ? acc.plus(e.amount) : acc.minus(e.amount)),
        entries[0]!.amount.minus(entries[0]!.amount),
      );
      expect(sum.toString()).toBe(account.balance.toString());
    }
  });

  it('holds up under concurrent withdrawals: only what is there can leave', async () => {
    // A fresh creator with exactly 1,000.00 and 25 simultaneous 100.00 payouts.
    const creator = await createUser(db.prisma);
    const account = await db.prisma.ledgerAccount.create({
      data: {
        type: 'CREATOR_PAYABLE',
        normalSide: 'CREDIT',
        ownerUserId: creator.id,
      },
    });
    await post('1000.00', [
      { account: poolId, direction: 'DEBIT' },
      { account: account.id, direction: 'CREDIT' },
    ]);
    const clearing = await db.prisma.ledgerAccount.upsert({
      where: { id: '00000000-0000-0000-0000-000000000000' },
      update: {},
      create: { type: 'PAYOUT_CLEARING', normalSide: 'CREDIT' },
    });

    const attempts = await Promise.allSettled(
      Array.from({ length: 25 }, () =>
        post('100.00', [
          { account: account.id, direction: 'DEBIT' },
          { account: clearing.id, direction: 'CREDIT' },
        ]),
      ),
    );
    const ok = attempts.filter((a) => a.status === 'fulfilled').length;
    expect(ok).toBe(10);
    expect(await balanceOf(account.id)).toBe('0');
  });
});
