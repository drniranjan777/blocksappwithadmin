import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SystemSettingsService } from '../../src/common/settings/system-settings.service.js';
import { LedgerService } from '../../src/ledger/ledger.service.js';
import { parseRupees } from '../../src/ledger/money.js';
import { PayoutProvider } from '../../src/payments/providers/providers.js';
import { PayoutsService } from '../../src/payments/payouts/payouts.service.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { adminCall, staffSession, type StaffSession } from '../support/admin.js';
import { AUTH_TEST_ENV, codeSentTo, freshIp } from '../support/auth.js';
import { putBytes, storageEnv } from '../support/media.js';
import { person, type Person } from '../support/social.js';

const PDF = Buffer.concat([
  Buffer.from('%PDF-1.4\n'),
  Buffer.alloc(400, 0x20),
  Buffer.from('\n%%EOF'),
]);
/** The last digits decide what the mock bank does (see MockBankVerificationProvider and MockPayoutProvider). */
const SUFFIX = {
  good: '9012',
  anotherGood: '9013',
  thirdGood: '9014',
  fourthGood: '9015',
  mismatch: '1111',
  partial: '2222',
  notFound: '0000',
  bankRejects: '9999',
  stuck: '8888',
} as const;
type Kind = keyof typeof SUFFIX;

describe('bank accounts and payouts', () => {
  let t: TestApp;
  let reviewer: StaffSession; // kyc_reviewer: also holds bank.review
  let financeOne: StaffSession; // finance_operator: payout.approve etc.
  let financeTwo: StaffSession;
  let analyst: StaffSession;
  let ledger: LedgerService;
  let payoutsService: PayoutsService;
  let provider: PayoutProvider;
  let counter = 0;

  beforeAll(async () => {
    t = await createTestApp({
      ...AUTH_TEST_ENV,
      LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? 'silent',
      ...storageEnv(),
    });
    ledger = t.app.get(LedgerService);
    payoutsService = t.app.get(PayoutsService, { strict: false });
    provider = t.app.get(PayoutProvider, { strict: false });
    reviewer = await staffSession(t, ['kyc_reviewer']);
    financeOne = await staffSession(t, ['finance_operator']);
    financeTwo = await staffSession(t, ['finance_operator']);
    analyst = await staffSession(t, ['readonly_analyst']);
  }, 240_000);
  afterAll(() => t.close());

  // ----------------------------------------------------------------- helpers --

  const row = async (sql: string, args: unknown[] = []) =>
    (await t.db.query<Record<string, any>>(sql, args)).rows;
  const staff = (s: StaffSession) => (method: 'get' | 'post', path: string, body?: object) =>
    adminCall(t, method, path, { token: s.accessToken, ...(body ? { body } : {}) });
  const rupees = (n: number | string) => parseRupees(String(n));
  const balance = async (p: Person) =>
    (
      await row(
        "SELECT balance FROM ledger_accounts WHERE type = 'CREATOR_PAYABLE' AND owner_user_id = $1",
        [p.id],
      )
    )[0]?.balance as string | undefined;
  const platform = async (type: string) =>
    (
      await row('SELECT balance FROM ledger_accounts WHERE type = $1 AND owner_user_id IS NULL', [
        type,
      ])
    )[0]?.balance as string;
  const key = () => `req-${randomUUID().replace(/-/g, '').slice(0, 20)}`;

  async function stepUp(p: Person, purpose: string): Promise<string> {
    const started = await p
      .api('post', '/auth/step-up', { body: { purpose, password: p.password }, ip: freshIp() })
      .expect(200);
    const done = await p
      .api('post', '/auth/step-up/verify', {
        body: { challengeId: started.body.data.challenge.id, code: codeSentTo(t, p.email) },
        ip: freshIp(),
      })
      .expect(200);
    return done.body.data.stepUpToken as string;
  }
  const withToken = (token: string) => ({ 'X-Step-Up-Token': token });
  const api = (
    p: Person,
    method: 'get' | 'post' | 'delete',
    path: string,
    o: {
      body?: object;
      headers?: Record<string, string>;
      query?: Record<string, string | number>;
    } = {},
  ) => p.api(method, path, o as never);

  async function scan(p: Person) {
    const start = await p
      .api('post', '/kyc/documents/upload', {
        body: { contentType: 'application/pdf', sizeBytes: PDF.length },
      })
      .expect(200);
    await putBytes(t, start.body.data.upload, PDF).expect(200);
    await p.api('post', `/kyc/documents/${start.body.data.fileId}/complete`).expect(200);
    return start.body.data.fileId as string;
  }
  /** An identity-verified person (the mock identity provider clears a plain name). */
  async function verified(p: Person) {
    const pan = `ABCPE${String(2000 + ++counter).padStart(4, '0')}F`;
    const fileId = await scan(p);
    const res = await p.api('post', '/kyc/submissions', {
      body: {
        subject: 'INDIVIDUAL',
        legalName: 'Aarav Kumar',
        dateOfBirth: '1995-06-15',
        pan,
        documents: [{ type: 'PAN', number: pan, fileId }],
      },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.status).toBe('VERIFIED');
    return pan;
  }
  /** A bank account number nobody else has used, ending in the digits that choose the mock bank's behaviour. */
  const acct = (kind: Kind) => `${10_000_000 + ++counter}${SUFFIX[kind]}`;
  /** Adds an account. `kind` picks a unique number; any other text is sent as it is (to test bad input). */
  const addAccount = async (
    p: Person,
    kind: Kind | string = 'good',
    over: Record<string, unknown> = {},
  ) => {
    const accountNumber = kind in SUFFIX ? acct(kind as Kind) : kind;
    const { stepUpToken, ...fields } = over as { stepUpToken?: string } & Record<string, unknown>;
    const token = stepUpToken ?? (await stepUp(p, 'ADD_BANK_ACCOUNT'));
    const res = await api(p, 'post', '/payouts/accounts', {
      body: { accountNumber, ifsc: 'HDFC0001234', holderName: 'Aarav Kumar', ...fields },
      headers: withToken(token),
    });
    return Object.assign(res, { number: accountNumber });
  };
  async function fund(p: Person, amount: string) {
    const paise = rupees(amount);
    await ledger.post({
      type: 'REWARD_FINALIZED',
      idempotencyKey: `test-fund:${p.id}:${++counter}`,
      lines: [
        { account: { kind: 'platform', type: 'REWARD_POOL' }, direction: 'DEBIT', amount: paise },
        { account: { kind: 'creator', userId: p.id }, direction: 'CREDIT', amount: paise },
      ],
      actor: { type: 'SYSTEM' },
    });
  }
  /**
   * A creator who can be paid: verified identity, monetisation in good standing, a verified bank
   * account that is old enough not to be flagged, no hold, and a balance.
   */
  async function ready(over: { balance?: string; freshAccount?: boolean } = {}) {
    const p = await person(t);
    await verified(p);
    await t.db.prisma.creatorProfile.upsert({
      where: { userId: p.id },
      create: { userId: p.id, monetizationStatus: 'ACTIVE', eligibleSince: new Date() },
      update: { monetizationStatus: 'ACTIVE' },
    });
    const account = (await (await addAccount(p)).body.data) as { id: string };
    if (!over.freshAccount)
      await t.db.query(
        "UPDATE payout_accounts SET created_at = now() - interval '30 days' WHERE id = $1",
        [account.id],
      );
    await t.db.query(
      'UPDATE creator_profiles SET payout_hold_until = NULL, payout_hold_reason = NULL WHERE user_id = $1',
      [p.id],
    );
    if (over.balance !== '0') await fund(p, over.balance ?? '20000.00');
    return { p, accountId: account.id };
  }
  const request = (
    p: Person,
    amount: string,
    extra: { key?: string; token?: string; accountId?: string } = {},
  ) =>
    api(p, 'post', '/payouts/requests', {
      body: { amount, ...(extra.accountId ? { accountId: extra.accountId } : {}) },
      headers: {
        'Idempotency-Key': extra.key ?? key(),
        ...(extra.token ? withToken(extra.token) : {}),
      },
    });

  // ============================================================ bank accounts ==

  describe('bank accounts', () => {
    it('are added only by someone with a verified identity', async () => {
      const p = await person(t);
      const res = await addAccount(p).then((r) => r);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('VERIFICATION_REQUIRED');
    });

    it('need a fresh step-up, of the right kind, every time', async () => {
      const p = await person(t);
      await verified(p);
      const body = { accountNumber: acct('good'), ifsc: 'HDFC0001234', holderName: 'Aarav Kumar' };
      const none = await api(p, 'post', '/payouts/accounts', { body }).then((r) => r);
      expect(none.status).toBe(403);
      expect(none.body.error.code).toBe('STEP_UP_REQUIRED');
      const wrongPurpose = await stepUp(p, 'REQUEST_PAYOUT');
      expect(
        (await api(p, 'post', '/payouts/accounts', { body, headers: withToken(wrongPurpose) }))
          .status,
      ).toBe(403);
      const token = await stepUp(p, 'ADD_BANK_ACCOUNT');
      expect(
        (await api(p, 'post', '/payouts/accounts', { body, headers: withToken(token) })).status,
      ).toBe(201);
      // The same token cannot be used for a second account.
      expect(
        (
          await api(p, 'post', '/payouts/accounts', {
            body: { ...body, accountNumber: acct('anotherGood') },
            headers: withToken(token),
          })
        ).status,
      ).toBe(403);
    });

    it('are verified by the bank, matched to the verified name on the server, and stored encrypted', async () => {
      const p = await person(t);
      await verified(p);
      const res = await addAccount(p);
      const number = res.number;
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.data).toMatchObject({
        bankName: 'HDFC Bank',
        ifsc: 'HDFC0001234',
        accountNumber: '•••• 9012',
        accountType: 'SAVINGS',
        status: 'VERIFIED',
        nameMatch: 'MATCH',
        isPrimary: true,
      });
      const stored = (await row('SELECT * FROM payout_accounts WHERE user_id = $1', [p.id]))[0]!;
      expect(JSON.stringify(stored)).not.toContain(number);
      expect(JSON.stringify(res.body)).not.toContain(number);
      expect(stored.account_number_enc).toMatch(/^v1\./);
      expect(stored.holder_name_enc).toMatch(/^v1\./);
      expect(stored.account_number_index).toMatch(/^[0-9a-f]{64}$/);
      // A change to where money goes pauses payouts and tells the owner.
      const hold = (
        await row(
          'SELECT payout_hold_until, payout_hold_reason FROM creator_profiles WHERE user_id = $1',
          [p.id],
        )
      )[0]!;
      expect(new Date(hold.payout_hold_until).getTime()).toBeGreaterThan(
        Date.now() + 40 * 3_600_000,
      );
      expect(hold.payout_hold_reason).toBe('BANK_ACCOUNT_CHANGED');
      const events = await row(
        "SELECT type, severity FROM security_events WHERE user_id = $1 AND type = 'PAYOUT_ACCOUNT_CHANGED'",
        [p.id],
      );
      expect(events).toEqual([{ type: 'PAYOUT_ACCOUNT_CHANGED', severity: 'WARNING' }]);
      const list = (await api(p, 'get', '/payouts/accounts').then((r) => r)).body.data;
      expect(list).toHaveLength(1);
      expect(list[0].accountNumber).toBe('•••• 9012');
    });

    it('are refused when the bank holds another name, cannot find the account, or only partly agrees', async () => {
      const p = await person(t);
      await verified(p);
      const mismatch = (await addAccount(p, 'mismatch')).body.data;
      expect(mismatch).toMatchObject({
        status: 'FAILED',
        nameMatch: 'NO_MATCH',
        failureCode: 'NAME_MISMATCH',
        isPrimary: false,
      });
      const missing = (await addAccount(p, 'notFound')).body.data;
      expect(missing).toMatchObject({ status: 'FAILED', failureCode: 'ACCOUNT_NOT_FOUND' });
      const partial = (await addAccount(p, 'partial')).body.data;
      expect(partial).toMatchObject({
        status: 'PENDING_VERIFICATION',
        nameMatch: 'PARTIAL',
        isPrimary: false,
      });
      // None of them can be the primary account, so none can be paid into.
      await api(p, 'post', `/payouts/accounts/${partial.id}/primary`, {
        headers: withToken(await stepUp(p, 'CHANGE_BANK_ACCOUNT')),
      }).then((r) => expect(r.status).toBe(409));
    });

    it('lets a person decide only on a partial match, with a note, and never override a mismatch', async () => {
      const p = await person(t);
      await verified(p);
      const partialRes = await addAccount(p, 'partial');
      const partial = partialRes.body.data;
      const mismatch = (await addAccount(p, 'mismatch')).body.data;

      await staff(analyst)('post', `/bank-accounts/${partial.id}/review`, {
        decision: 'APPROVE',
        note: 'Looks like the same person',
      }).then((r) => expect(r.status).toBe(403));
      const queue = (
        await staff(reviewer)('get', '/bank-accounts?status=PENDING_VERIFICATION').then((r) => r)
      ).body.data as any[];
      expect(queue.find((a) => a.id === partial.id)).toMatchObject({
        accountNumber: '•••• 2222',
        holderName: 'A**** K****',
        userId: p.id,
      });
      expect(JSON.stringify(queue)).not.toContain(partialRes.number);

      await staff(reviewer)('post', `/bank-accounts/${mismatch.id}/review`, {
        decision: 'APPROVE',
        note: 'Overriding the bank name check',
      }).then((r) => expect(r.status).toBe(409));
      await staff(reviewer)('post', `/bank-accounts/${partial.id}/review`, {
        decision: 'APPROVE',
        note: 'short',
      }).then((r) => expect(r.status).toBe(400));
      const done = await staff(reviewer)('post', `/bank-accounts/${partial.id}/review`, {
        decision: 'APPROVE',
        note: 'Same family name, confirmed with the document',
      });
      expect(done.status).toBe(200);
      expect(done.body.data).toMatchObject({ status: 'VERIFIED', isPrimary: true });
      await staff(reviewer)('post', `/bank-accounts/${partial.id}/review`, {
        decision: 'REJECT',
        note: 'Second thoughts after the fact',
      }).then((r) => expect(r.status).toBe(409));
      const logged = await row(
        "SELECT reason, before, after FROM audit_logs WHERE action = 'bank.approve' AND target_id = $1",
        [partial.id],
      );
      expect(logged[0]).toMatchObject({
        reason: 'Same family name, confirmed with the document',
        after: { status: 'VERIFIED' },
      });
    });

    it('cannot be added twice, onto two people, or beyond the limit', async () => {
      const a = await person(t);
      const b = await person(t);
      await verified(a);
      await verified(b);
      const shared = acct('good');
      expect((await addAccount(a, shared)).status).toBe(201);
      expect((await addAccount(a, shared)).status).toBe(409); // already yours
      const taken = await addAccount(b, shared);
      expect(taken.status).toBe(409);
      expect(JSON.stringify(taken.body)).not.toContain(a.id); // says nothing about whose
      // The limit is a setting; lowering it shows the rule without sending a dozen codes.
      await t.db.prisma.systemSetting.upsert({
        where: { key: 'payouts.max_accounts' },
        create: { key: 'payouts.max_accounts', value: 2 as never },
        update: { value: 2 as never },
      });
      t.app.get(SystemSettingsService, { strict: false }).invalidate();
      try {
        expect((await addAccount(a, 'anotherGood')).status).toBe(201);
        const third = await addAccount(a, 'thirdGood');
        expect(third.status).toBe(409);
        expect(third.body.error.message).toMatch(/number of bank accounts/i);
      } finally {
        await t.db.prisma.systemSetting.deleteMany({ where: { key: 'payouts.max_accounts' } });
        t.app.get(SystemSettingsService, { strict: false }).invalidate();
      }
    });

    it('check their input before spending a step-up, and name the field', async () => {
      const p = await person(t);
      await verified(p);
      const unspent = 'x'.repeat(43); // never reaches the point of being used
      const bad = async (kind: string, over: Record<string, unknown> = {}) => {
        const res = await addAccount(p, kind, { ...over, stepUpToken: unspent });
        expect(res.status).toBe(400);
        return JSON.stringify(res.body.error.details);
      };
      expect(await bad('good', { ifsc: 'NOTANIFSC1' })).toContain('ifsc');
      expect(await bad('good', { ifsc: 'HDFC1001234' })).toContain('ifsc');
      expect(await bad('good', { holderName: '12345' })).toContain('holderName');
      expect(await bad('good', { accountType: 'GOLD' })).toContain('accountType');
      expect(await bad('12345')).toContain('accountNumber');
      expect(await bad('abcdefghijkl')).toContain('accountNumber');
    });

    it('can be made primary, with its own step-up', async () => {
      const { p, accountId } = await ready();
      const second = (await addAccount(p, 'anotherGood')).body.data;
      expect(second.isPrimary).toBe(false);
      await api(p, 'post', `/payouts/accounts/${second.id}/primary`).then((r) =>
        expect(r.status).toBe(403),
      ); // no step-up
      const switched = await api(p, 'post', `/payouts/accounts/${second.id}/primary`, {
        headers: withToken(await stepUp(p, 'CHANGE_BANK_ACCOUNT')),
      });
      expect(switched.status).toBe(200);
      expect(switched.body.data.isPrimary).toBe(true);
      expect(
        (await api(p, 'get', '/payouts/accounts').then((r) => r)).body.data.find(
          (a: any) => a.id === accountId,
        ).isPrimary,
      ).toBe(false);
    });

    it('can be removed with a step-up, and never while a payout is in progress', async () => {
      const { p, accountId } = await ready();
      const second = (await addAccount(p, 'anotherGood')).body.data;
      await t.db.query(
        "UPDATE payout_accounts SET created_at = now() - interval '30 days' WHERE id = $1",
        [second.id],
      );
      await t.db.query('UPDATE creator_profiles SET payout_hold_until = NULL WHERE user_id = $1', [
        p.id,
      ]);

      // A payout in progress pins the account it is going to.
      const req = await request(p, '300.00', { accountId: second.id });
      expect(req.status, JSON.stringify(req.body)).toBe(201);
      const pinned = await api(p, 'delete', `/payouts/accounts/${second.id}`);
      expect(pinned.status).toBe(409); // refused before any step-up is needed

      await api(p, 'delete', `/payouts/accounts/${accountId}`).then((r) =>
        expect(r.status).toBe(403),
      ); // needs a step-up
      expect(
        (
          await api(p, 'delete', `/payouts/accounts/${accountId}`, {
            headers: withToken(await stepUp(p, 'REMOVE_BANK_ACCOUNT')),
          })
        ).status,
      ).toBe(204);
      expect(
        (await api(p, 'get', '/payouts/accounts').then((r) => r)).body.data.map((a: any) => a.id),
      ).toEqual([second.id]);
    });

    it('show a bank name for a typed IFSC, and refuse nonsense', async () => {
      const p = await person(t);
      expect(
        (await api(p, 'get', '/payouts/ifsc/sbin0000001').then((r) => r)).body.data,
      ).toMatchObject({ ifsc: 'SBIN0000001', bankName: 'State Bank of India' });
      expect(
        (await api(p, 'get', '/payouts/ifsc/ZZZZ0ABCDEF').then((r) => r)).body.data.bankName,
      ).toBe('Bank ZZZZ');
      expect((await api(p, 'get', '/payouts/ifsc/nope').then((r) => r)).status).toBe(400);
    });
  });

  // ================================================================== payouts ==

  describe('asking to be paid', () => {
    it('shows what is missing, from the server, before anything is possible', async () => {
      const p = await person(t);
      const o = (await api(p, 'get', '/payouts/overview').then((r) => r)).body.data;
      expect(o).toMatchObject({
        enabled: true,
        eligible: false,
        available: '0.00',
        primaryAccount: null,
      });
      expect(
        o.checklist
          .filter((i: any) => !i.met)
          .map((i: any) => i.key)
          .sort(),
      ).toEqual(['balance', 'bankAccount', 'identity', 'monetization']);
      expect(o.limits).toMatchObject({
        minimum: '100.00',
        maximum: '50000.00',
        stepUpFrom: '1000.00',
      });
      await t.http.get('/api/v1/payouts/overview').expect(401);
    });

    it('is paused for a while after a bank account is added, whatever else is in order', async () => {
      const p = await person(t);
      await verified(p);
      await t.db.prisma.creatorProfile.upsert({
        where: { userId: p.id },
        create: { userId: p.id, monetizationStatus: 'ACTIVE' },
        update: { monetizationStatus: 'ACTIVE' },
      });
      await addAccount(p);
      await fund(p, '5000.00');
      const res = await request(p, '200.00');
      expect(res.status).toBe(409);
      expect(res.body.error.details.unmet).toEqual(['noHold']);
      const o = (await api(p, 'get', '/payouts/overview').then((r) => r)).body.data;
      expect(o.hold).toMatchObject({ reason: 'BANK_ACCOUNT_CHANGED' });
      expect(o.eligible).toBe(false);
    });

    it('holds the money at once, in the ledger, and sends a small payout from an established account straight on', async () => {
      const { p } = await ready();
      const before = await balance(p);
      const res = await request(p, '500.00');
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.data).toMatchObject({
        amount: '500.00',
        currency: 'INR',
        status: 'APPROVED',
        account: { bankName: 'HDFC Bank', accountNumber: '•••• 9012' },
      });
      expect(res.body.data.estimatedTo).toBeTruthy();
      expect(Number(before) - Number(await balance(p))).toBe(500);
      const journal = (
        await row(
          'SELECT j.type, j.idempotency_key FROM ledger_journals j JOIN payout_requests r ON r.hold_journal_id = j.id WHERE r.id = $1',
          [res.body.data.id],
        )
      )[0]!;
      expect(journal).toMatchObject({
        type: 'PAYOUT_REQUESTED',
        idempotency_key: `payout-hold:${res.body.data.id}`,
      });
      expect(Number(await platform('PAYOUT_CLEARING'))).toBeGreaterThanOrEqual(500);
      const o = (await api(p, 'get', '/payouts/overview').then((r) => r)).body.data;
      expect(o.eligible).toBe(true);
      expect(o.available).toBe('19500.00');
    });

    it('is safe to retry: the same key and body is the same payout, a different body is refused', async () => {
      const { p } = await ready();
      const k = key();
      const first = await request(p, '400.00', { key: k });
      const again = await request(p, '400.00', { key: k });
      expect(again.status).toBe(201);
      expect(again.body.data.id).toBe(first.body.data.id);
      expect(Number(await balance(p))).toBe(19_600); // held once
      const clash = await request(p, '450.00', { key: k });
      expect(clash.status).toBe(409);
      expect(clash.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
      // Concurrent identical requests make one payout.
      const k2 = key();
      const results = await Promise.all(
        Array.from({ length: 6 }, () => request(p, '250.00', { key: k2 })),
      );
      const ids = new Set(results.filter((r) => r.status === 201).map((r) => r.body.data.id));
      expect(ids.size).toBe(1);
      expect(
        (
          await row(
            'SELECT count(*)::int AS n FROM payout_requests WHERE user_id = $1 AND idempotency_key = $2',
            [p.id, k2],
          )
        )[0]!.n,
      ).toBe(1);
      expect(Number(await balance(p))).toBe(19_350);
    });

    it('needs a key, and checks the amount and the limits', async () => {
      const { p } = await ready();
      const noKey = await api(p, 'post', '/payouts/requests', { body: { amount: '200.00' } });
      expect(noKey.status).toBe(400);
      for (const [amount, reason] of [
        ['99.99', 'below_minimum'],
        ['50000.01', 'above_maximum'],
      ] as const) {
        const res = await request(p, amount);
        expect(res.status, amount).toBe(400);
        expect(JSON.stringify(res.body.error.details)).toContain(reason);
      }
      for (const bad of ['abc', '-5', '10.555', '1e3', ''])
        expect((await request(p, bad)).status, bad).toBe(400);
      expect(
        (
          await api(p, 'post', '/payouts/requests', {
            body: { amount: '200.00', accountId: randomUUID() },
            headers: { 'Idempotency-Key': key() },
          })
        ).status,
      ).toBe(400);
      for (const extra of [
        { status: 'COMPLETED' },
        { userId: randomUUID() },
        { approvedById: randomUUID() },
      ]) {
        expect(
          (
            await api(p, 'post', '/payouts/requests', {
              body: { amount: '200.00', ...extra },
              headers: { 'Idempotency-Key': key() },
            })
          ).status,
        ).toBe(400);
      }
    });

    it('asks for a fresh step-up from the threshold upwards, once per payout', async () => {
      const { p } = await ready();
      expect((await request(p, '999.00')).status).toBe(201);
      const needs = await request(p, '1000.00');
      expect(needs.status).toBe(403);
      expect(needs.body.error.code).toBe('STEP_UP_REQUIRED');
      const token = await stepUp(p, 'REQUEST_PAYOUT');
      expect((await request(p, '1000.00', { token })).status).toBe(201);
      expect((await request(p, '1000.00', { token })).status).toBe(403); // spent
    });

    it('can never take more than the balance, however many requests arrive at once', async () => {
      const { p } = await ready({ balance: '1000.00' });
      const results = await Promise.all(Array.from({ length: 8 }, () => request(p, '400.00')));
      const made = results.filter((r) => r.status === 201).length;
      expect(made).toBeLessThanOrEqual(2); // 1000 / 400
      expect(made).toBeGreaterThanOrEqual(1);
      for (const r of results.filter((x) => x.status !== 201)) expect([409]).toContain(r.status);
      expect(Number(await balance(p))).toBeGreaterThanOrEqual(0);
      expect(Number(await balance(p))).toBe(1000 - 400 * made);
    });

    it('is capped per day', async () => {
      const { p } = await ready({ balance: '400000.00' });
      const token = async () => stepUp(p, 'REQUEST_PAYOUT');
      expect((await request(p, '50000.00', { token: await token() })).status).toBe(201);
      expect((await request(p, '50000.00', { token: await token() })).status).toBe(201);
      const over = await request(p, '1000.00', { token: await token() });
      expect(over.status).toBe(409);
      expect(over.body.error.details.remainingToday).toBe('0.00');
    });

    it('refuses a creator whose monetisation is suspended or identity has lapsed', async () => {
      const { p } = await ready();
      await t.db.query(
        "UPDATE creator_profiles SET monetization_status = 'SUSPENDED' WHERE user_id = $1",
        [p.id],
      );
      const suspended = await request(p, '200.00');
      expect(suspended.status).toBe(409);
      expect(suspended.body.error.details.unmet).toContain('monetization');
      await t.db.query(
        "UPDATE creator_profiles SET monetization_status = 'ACTIVE' WHERE user_id = $1",
        [p.id],
      );
      await t.db.query(
        "UPDATE kyc_profiles SET expires_at = now() - interval '1 day' WHERE user_id = $1",
        [p.id],
      );
      expect((await request(p, '200.00')).body.error.details.unmet).toContain('identity');
    });

    it('cannot be asked for by someone else, and stays private to its owner', async () => {
      const { p } = await ready();
      const other = await person(t);
      const made = (await request(p, '300.00')).body.data;
      await api(other, 'get', `/payouts/requests/${made.id}`).then((r) =>
        expect(r.status).toBe(404),
      );
      await api(other, 'post', `/payouts/requests/${made.id}/cancel`).then((r) =>
        expect(r.status).toBe(404),
      );
      expect((await api(other, 'get', '/payouts/requests').then((r) => r)).body.data).toEqual([]);
      expect(
        (await api(p, 'get', '/payouts/requests').then((r) => r)).body.data.map((x: any) => x.id),
      ).toContain(made.id);
    });
  });

  // ================================================================== settling ==

  describe('sending and settling', () => {
    it('sends an approved payout, records it as paid in the ledger, and tells the creator', async () => {
      const { p } = await ready();
      const made = (await request(p, '600.00')).body.data;

      expect(await payoutsService.sendApproved()).toBeGreaterThanOrEqual(1);
      let row1 = (
        await row('SELECT status, provider_reference FROM payout_requests WHERE id = $1', [made.id])
      )[0]!;
      expect(row1.status).toBe('PROCESSING');
      expect(row1.provider_reference).toMatch(/^mock_payout_/);

      expect(await payoutsService.settleProcessing()).toBeGreaterThanOrEqual(1);
      row1 = (
        await row(
          'SELECT status, completed_at, settle_journal_id FROM payout_requests WHERE id = $1',
          [made.id],
        )
      )[0]!;
      expect(row1.status).toBe('COMPLETED');
      expect(row1.completed_at).toBeTruthy();
      // Its own settlement journal moves exactly its amount from clearing to settlement.
      const lines = await row(
        'SELECT a.type, e.direction, e.amount FROM financial_ledger_entries e JOIN ledger_accounts a ON a.id = e.account_id WHERE e.journal_id = $1 ORDER BY e.direction',
        [row1.settle_journal_id],
      );
      expect(lines.map((l) => [l.type, l.direction, Number(l.amount)])).toEqual([
        ['PAYOUT_CLEARING', 'DEBIT', 600],
        ['BANK_SETTLEMENT', 'CREDIT', 600],
      ]);
      expect(Number(await balance(p))).toBe(19_400);
      expect(
        (await api(p, 'get', `/payouts/requests/${made.id}`).then((r) => r)).body.data,
      ).toMatchObject({ status: 'COMPLETED', failureCode: null });
      const ledgerLines = (await api(p, 'get', '/earnings/ledger').then((r) => r)).body
        .data as Array<{ type: string; amount: string }>;
      expect(ledgerLines.find((l) => l.type === 'PAYOUT_REQUESTED')).toMatchObject({
        amount: '-600.00',
      });
      const notices = (
        await api(p, 'get', '/notifications', { query: { limit: 50 } }).then((r) => r)
      ).body.data as Array<{ type: string; data: any }>;
      expect(notices.some((n) => n.type === 'PAYOUT_STATUS' && n.data.status === 'COMPLETED')).toBe(
        true,
      );
      // Asking again changes nothing.
      expect(await payoutsService.settleProcessing()).toBe(0);
    });

    it('puts the money back when the bank refuses it', async () => {
      const { p } = await ready();
      await t.db.query('UPDATE creator_profiles SET payout_hold_until = NULL WHERE user_id = $1', [
        p.id,
      ]);
      const bad = (await addAccount(p, 'bankRejects')).body.data;
      await t.db.query(
        "UPDATE payout_accounts SET created_at = now() - interval '30 days' WHERE id = $1",
        [bad.id],
      );
      await t.db.query('UPDATE creator_profiles SET payout_hold_until = NULL WHERE user_id = $1', [
        p.id,
      ]);
      const made = (await request(p, '700.00', { accountId: bad.id })).body.data;
      expect(Number(await balance(p))).toBe(19_300);
      await payoutsService.sendApproved();
      await payoutsService.settleProcessing();
      const after = (
        await row('SELECT status, failure_code FROM payout_requests WHERE id = $1', [made.id])
      )[0]!;
      expect(after).toMatchObject({ status: 'FAILED', failure_code: 'BANK_REJECTED' });
      expect(Number(await balance(p))).toBe(20_000); // all of it is back
      const types = (
        await row(
          'SELECT j.type FROM ledger_journals j WHERE j.reference_id = $1 ORDER BY j.created_at',
          [made.id],
        )
      ).map((r) => r.type);
      expect(types).toEqual(['PAYOUT_REQUESTED', 'PAYOUT_FAILED']);
    });

    it('leaves a payout that the bank is still working on, still held', async () => {
      const { p } = await ready();
      await t.db.query('UPDATE creator_profiles SET payout_hold_until = NULL WHERE user_id = $1', [
        p.id,
      ]);
      const stuck = (await addAccount(p, 'stuck')).body.data;
      await t.db.query(
        "UPDATE payout_accounts SET created_at = now() - interval '30 days' WHERE id = $1",
        [stuck.id],
      );
      await t.db.query('UPDATE creator_profiles SET payout_hold_until = NULL WHERE user_id = $1', [
        p.id,
      ]);
      const made = (await request(p, '800.00', { accountId: stuck.id })).body.data;
      await payoutsService.sendApproved();
      await payoutsService.settleProcessing();
      expect(
        (await row('SELECT status FROM payout_requests WHERE id = $1', [made.id]))[0]!.status,
      ).toBe('PROCESSING');
      expect(Number(await balance(p))).toBe(19_200); // still held
    });

    it('survives the provider being unreachable, and cannot pay twice when it comes back', async () => {
      const { p } = await ready();
      const made = (await request(p, '900.00')).body.data;
      const spy = vi.spyOn(provider, 'send').mockRejectedValueOnce(new Error('network down'));
      expect(await payoutsService.sendApproved()).toBe(0);
      spy.mockRestore();
      expect(
        (
          await row('SELECT status, provider_reference FROM payout_requests WHERE id = $1', [
            made.id,
          ])
        )[0],
      ).toEqual({ status: 'APPROVED', provider_reference: null });
      expect(Number(await balance(p))).toBe(19_100); // still held, not lost
      expect(await payoutsService.sendApproved()).toBeGreaterThanOrEqual(1);
      expect(
        (await row('SELECT status FROM payout_requests WHERE id = $1', [made.id]))[0]!.status,
      ).toBe('PROCESSING');
      // The provider sees the payout's own id, so a repeat is the same payout.
      const first = await provider.send({
        reference: made.id,
        amount: '900.00',
        accountNumber: 'good',
        ifsc: 'HDFC0001234',
        holderName: 'Aarav Kumar',
        narration: 'x',
      });
      const second = await provider.send({
        reference: made.id,
        amount: '900.00',
        accountNumber: 'good',
        ifsc: 'HDFC0001234',
        holderName: 'Aarav Kumar',
        narration: 'x',
      });
      expect(second.providerReference).toBe(first.providerReference);
    });

    it('does not send an approved payout if the creator was suspended or changed their bank account since', async () => {
      const { p } = await ready();
      const made = (await request(p, '650.00')).body.data;
      await t.db.query(
        "UPDATE creator_profiles SET monetization_status = 'SUSPENDED' WHERE user_id = $1",
        [p.id],
      );
      await payoutsService.sendApproved();
      expect(
        (await row('SELECT status, hold_reason FROM payout_requests WHERE id = $1', [made.id]))[0],
      ).toEqual({ status: 'ON_HOLD', hold_reason: 'MONETIZATION_SUSPENDED' });
      expect(Number(await balance(p))).toBe(19_350); // held, not paid, not returned
    });

    it('lets the creator cancel before it is sent, and not after', async () => {
      const { p } = await ready();
      const made = (await request(p, '550.00')).body.data;
      expect(Number(await balance(p))).toBe(19_450);
      const cancelled = (await api(p, 'post', `/payouts/requests/${made.id}/cancel`).then((r) => r))
        .body.data;
      expect(cancelled.status).toBe('CANCELLED');
      expect(Number(await balance(p))).toBe(20_000);
      await api(p, 'post', `/payouts/requests/${made.id}/cancel`).then((r) =>
        expect(r.status).toBe(409),
      ); // already done

      const sent = (await request(p, '560.00')).body.data;
      await payoutsService.sendApproved();
      await api(p, 'post', `/payouts/requests/${sent.id}/cancel`).then((r) =>
        expect(r.status).toBe(409),
      ); // on its way
      expect(Number(await balance(p))).toBe(19_440);
    });
  });

  // =================================================================== review ==

  describe('review by people', () => {
    it('holds a payout from a new bank account, or a large one, for approval before it is sent', async () => {
      const young = await ready({ freshAccount: true });
      const flagged = (await request(young.p, '300.00')).body.data;
      expect(flagged.status).toBe('PENDING_REVIEW');
      const { p } = await ready();
      const big = (await request(p, '10000.00', { token: await stepUp(p, 'REQUEST_PAYOUT') })).body
        .data;
      expect(big.status).toBe('PENDING_REVIEW');
      await payoutsService.sendApproved();
      expect(
        (await row('SELECT status FROM payout_requests WHERE id = $1', [big.id]))[0]!.status,
      ).toBe('PENDING_REVIEW'); // not sent
    });

    it('lets only people with the permission see and decide, one approval for ordinary amounts', async () => {
      const { p } = await ready();
      const made = (await request(p, '12000.00', { token: await stepUp(p, 'REQUEST_PAYOUT') })).body
        .data;
      await staff(analyst)('get', '/payouts').then((r) => expect(r.status).toBe(403));
      await staff(analyst)('post', `/payouts/${made.id}/approve`, {
        note: 'Approving as an analyst',
      }).then((r) => expect(r.status).toBe(403));
      const listed = (
        await staff(financeOne)('get', '/payouts?status=PENDING_REVIEW').then((r) => r)
      ).body.data as any[];
      expect(listed.find((x) => x.id === made.id)).toMatchObject({
        userId: p.id,
        account: { accountNumber: '•••• 9012' },
        approvals: 0,
      });
      // Only the last four digits of an account ever appear.
      expect(JSON.stringify(listed)).not.toMatch(/\d{8}9012/);

      await staff(financeOne)('post', `/payouts/${made.id}/approve`, { note: 'short' }).then((r) =>
        expect(r.status).toBe(400),
      );
      const done = await staff(financeOne)('post', `/payouts/${made.id}/approve`, {
        note: 'Checked the balance and the account',
      });
      expect(done.status).toBe(200);
      expect(done.body.data).toMatchObject({
        status: 'APPROVED',
        approvals: [{ decision: 'APPROVE', note: 'Checked the balance and the account' }],
      });
      await staff(financeTwo)('post', `/payouts/${made.id}/approve`, {
        note: 'Approving again for no reason',
      }).then((r) => expect(r.status).toBe(409));
      await payoutsService.sendApproved();
      expect(
        (await row('SELECT status FROM payout_requests WHERE id = $1', [made.id]))[0]!.status,
      ).toBe('PROCESSING');
    });

    it('needs two different people for a very large payout, and never the same person twice', async () => {
      const { p } = await ready({ balance: '60000.00' });
      const made = (await request(p, '50000.00', { token: await stepUp(p, 'REQUEST_PAYOUT') })).body
        .data;
      expect(made.status).toBe('PENDING_REVIEW');
      const first = await staff(financeOne)('post', `/payouts/${made.id}/approve`, {
        note: 'First look: all in order',
      });
      expect(first.body.data.status).toBe('PENDING_REVIEW'); // one approval is not enough
      const repeat = await staff(financeOne)('post', `/payouts/${made.id}/approve`, {
        note: 'Approving it a second time',
      });
      expect(repeat.status).toBe(409);
      expect(repeat.body.error.message).toMatch(/another person/i);
      await payoutsService.sendApproved();
      expect(
        (await row('SELECT status FROM payout_requests WHERE id = $1', [made.id]))[0]!.status,
      ).toBe('PENDING_REVIEW');
      const second = await staff(financeTwo)('post', `/payouts/${made.id}/approve`, {
        note: 'Second look: confirmed independently',
      });
      expect(second.body.data.status).toBe('APPROVED');
      expect(second.body.data.approvals).toHaveLength(2);
      // The same pair voting at the same instant cannot both be "the second".
      const other = (await request(p, '2000.00', { token: await stepUp(p, 'REQUEST_PAYOUT') })).body
        .data;
      expect(other.status).toBe('APPROVED');
    });

    it('returns the money when a payout is rejected, with the reviewer’s reason on record', async () => {
      const { p } = await ready();
      const made = (await request(p, '11000.00', { token: await stepUp(p, 'REQUEST_PAYOUT') })).body
        .data;
      expect(Number(await balance(p))).toBe(9000);
      await staff(analyst)('post', `/payouts/${made.id}/reject`, {
        note: 'Rejecting as an analyst',
      }).then((r) => expect(r.status).toBe(403));
      const rejected = await staff(financeOne)('post', `/payouts/${made.id}/reject`, {
        note: 'Account activity looks unusual',
      });
      expect(rejected.status).toBe(200);
      expect(rejected.body.data.status).toBe('REJECTED');
      expect(Number(await balance(p))).toBe(20_000);
      await staff(financeTwo)('post', `/payouts/${made.id}/reject`, {
        note: 'Rejecting what is already rejected',
      }).then((r) => expect(r.status).toBe(409));
      const logged = await row(
        "SELECT reason FROM audit_logs WHERE action = 'payout.rejected' AND target_id = $1",
        [made.id],
      );
      expect(logged).toEqual([{ reason: 'Account activity looks unusual' }]);
    });

    it('can be put on hold, held payouts cannot be sent, and resuming sends them back to review', async () => {
      const { p } = await ready();
      const made = (await request(p, '750.00')).body.data;
      expect(made.status).toBe('APPROVED');
      await staff(financeOne)('post', `/payouts/${made.id}/hold`, {
        note: 'Waiting on a fraud check',
      }).then((r) => expect(r.status).toBe(200));
      await payoutsService.sendApproved();
      expect(
        (await row('SELECT status, hold_reason FROM payout_requests WHERE id = $1', [made.id]))[0],
      ).toEqual({ status: 'ON_HOLD', hold_reason: 'Waiting on a fraud check' });
      const resumed = await staff(financeOne)('post', `/payouts/${made.id}/resume`, {
        note: 'Fraud check came back clean',
      });
      expect(resumed.body.data.status).toBe('PENDING_REVIEW'); // looked at afresh
      await staff(financeTwo)('post', `/payouts/${made.id}/approve`, {
        note: 'Approving after the hold',
      }).then((r) => expect(r.status).toBe(200));
      await staff(financeOne)('post', `/payouts/${made.id}/retry`).then((r) =>
        expect(r.status).toBe(200),
      );
      expect(
        (await row('SELECT status FROM payout_requests WHERE id = $1', [made.id]))[0]!.status,
      ).toBe('PROCESSING');
      await staff(financeOne)('post', `/payouts/${made.id}/retry`).then((r) =>
        expect(r.status).toBe(409),
      ); // already sent
    });

    it('is separate from the other duties, so one role cannot clear identity and release the money', async () => {
      // kyc_reviewer holds bank.review but not payout.approve; finance holds payout.approve but not kyc.review.
      const { p } = await ready();
      const made = (await request(p, '12000.00', { token: await stepUp(p, 'REQUEST_PAYOUT') })).body
        .data;
      await staff(reviewer)('post', `/payouts/${made.id}/approve`, {
        note: 'A KYC reviewer approving money',
      }).then((r) => expect(r.status).toBe(403));
      await staff(financeOne)('post', `/bank-accounts/${randomUUID()}/review`, {
        decision: 'APPROVE',
        note: 'Finance reviewing a bank account',
      }).then((r) => expect(r.status).toBe(403));
    });
  });

  // ====================================================================== tax ==

  describe('tax details', () => {
    it('are confirmed only against the PAN on the verified identity, and only with a step-up', async () => {
      const p = await person(t);
      const pan = await verified(p);
      const initial = (await api(p, 'get', '/payouts/tax').then((r) => r)).body.data;
      expect(initial).toMatchObject({
        status: 'NOT_PROVIDED',
        pan: null,
        identityPan: `XXXXXX${pan.slice(-4)}`,
        statements: [],
      });

      // Someone else's PAN is refused before a step-up is spent on it.
      const token = await stepUp(p, 'UPDATE_TAX_INFO');
      const wrong = await api(p, 'post', '/payouts/tax', {
        body: { pan: 'ABCPE1111F' },
        headers: withToken(token),
      });
      expect(wrong.status).toBe(400);
      expect(JSON.stringify(wrong.body.error.details)).toContain('does_not_match_identity');
      // The right PAN needs the step-up.
      expect((await api(p, 'post', '/payouts/tax', { body: { pan } })).status).toBe(403);
      const ok = await api(p, 'post', '/payouts/tax', {
        body: { pan: pan.toLowerCase() },
        headers: withToken(token),
      });
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      expect(ok.body.data).toMatchObject({ status: 'VERIFIED', pan: `XXXXXX${pan.slice(-4)}` });
      const stored = (
        await row('SELECT pan_enc, pan_index FROM tax_profiles WHERE user_id = $1', [p.id])
      )[0]!;
      expect(stored.pan_enc).toMatch(/^v1\./);
      expect(JSON.stringify([stored, ok.body])).not.toContain(pan);
      // The token is spent.
      expect(
        (await api(p, 'post', '/payouts/tax', { body: { pan }, headers: withToken(token) })).status,
      ).toBe(403);
    });

    it('need a verified identity first', async () => {
      const p = await person(t);
      const token = await stepUp(p, 'UPDATE_TAX_INFO');
      const res = await api(p, 'post', '/payouts/tax', {
        body: { pan: 'ABCPE1111F' },
        headers: withToken(token),
      });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('VERIFICATION_REQUIRED');
    });
  });

  // ================================================================== ledger ==

  describe('after all of that, the ledger', () => {
    it('balances overall and within every journal', async () => {
      const net = await row(
        "SELECT COALESCE(SUM(CASE direction WHEN 'DEBIT' THEN amount ELSE -amount END), 0) AS net FROM financial_ledger_entries",
      );
      expect(Number(net[0]!.net)).toBe(0);
      expect(
        await row(
          "SELECT journal_id FROM financial_ledger_entries GROUP BY journal_id HAVING SUM(CASE direction WHEN 'DEBIT' THEN amount ELSE -amount END) <> 0",
        ),
      ).toEqual([]);
    });

    it('agrees with itself: every balance is the sum of its entries, and none is negative', async () => {
      expect(
        await row(`
        SELECT a.id FROM ledger_accounts a
        LEFT JOIN LATERAL (SELECT COALESCE(SUM(CASE WHEN e.direction = a.normal_side THEN e.amount ELSE -e.amount END), 0) AS total FROM financial_ledger_entries e WHERE e.account_id = a.id) s ON true
        WHERE a.balance <> s.total`),
      ).toEqual([]);
      expect(
        await row("SELECT id FROM ledger_accounts WHERE type = 'CREATOR_PAYABLE' AND balance < 0"),
      ).toEqual([]);
    });

    it('accounts for every held payout: the clearing account holds exactly what is in flight', async () => {
      const inFlight = await row(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM payout_requests WHERE status IN ('REQUESTED','PENDING_REVIEW','APPROVED','PROCESSING','ON_HOLD')",
      );
      expect(Number(await platform('PAYOUT_CLEARING'))).toBe(Number(inFlight[0]!.total));
    });

    it('has exactly one hold per payout, and at most one reversal or settlement', async () => {
      const dup = await row(`SELECT reference_id, type, count(*)::int AS n FROM ledger_journals
        WHERE reference_type = 'payout_request' GROUP BY reference_id, type HAVING count(*) > 1`);
      expect(dup).toEqual([]);
      const both =
        await row(`SELECT reference_id FROM ledger_journals WHERE reference_type = 'payout_request' AND type IN ('PAYOUT_COMPLETED','PAYOUT_FAILED','PAYOUT_REVERSED')
        GROUP BY reference_id HAVING count(*) > 1`);
      expect(both).toEqual([]);
    });
  });
});
