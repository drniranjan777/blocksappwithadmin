import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { StepUpService } from '../../src/auth/step-up.service.js';
import { ObjectStorage } from '../../src/media/storage/object-storage.js';
import { KYC_BUCKET } from '../../src/media/storage/storage.module.js';
import { KycService } from '../../src/payments/kyc/kyc.service.js';
import { createTestApp, type TestApp } from '../support/app.js';
import { adminCall, staffSession, type StaffSession } from '../support/admin.js';
import { AUTH_TEST_ENV, codeSentTo, freshIp } from '../support/auth.js';
import { pathOf, putBytes, storageEnv } from '../support/media.js';
import { person, type Person } from '../support/social.js';

const PDF = Buffer.concat([
  Buffer.from('%PDF-1.4\n'),
  Buffer.alloc(400, 0x20),
  Buffer.from('\n%%EOF'),
]);
const AADHAAR = '2345 6789 0123';

describe('step-up and identity verification', () => {
  let t: TestApp;
  let reviewer: StaffSession; // kyc_reviewer: reads, views documents, decides
  let auditor: StaffSession; // reads only
  let stepUp: StepUpService;
  let kyc: KycService;
  let counter = 0;

  beforeAll(async () => {
    t = await createTestApp({
      ...AUTH_TEST_ENV,
      LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? 'silent',
      ...storageEnv(),
    });
    stepUp = t.app.get(StepUpService, { strict: false });
    kyc = t.app.get(KycService, { strict: false });
    reviewer = await staffSession(t, ['kyc_reviewer']);
    auditor = await staffSession(t, ['auditor']);
  }, 240_000);
  afterAll(() => t.close());

  const row = async (sql: string, args: unknown[] = []) =>
    (await t.db.query<Record<string, any>>(sql, args)).rows;
  const staff = (s: StaffSession) => (method: 'get' | 'post', path: string, body?: object) =>
    adminCall(t, method, path, { token: s.accessToken, ...(body ? { body } : {}) });
  /** A PAN for a person (`P` in the fourth place), different every time and never with 0000 in it. */
  const pan = () => `ABCPE${String(1000 + ++counter).padStart(4, '0')}F`;

  async function scan(p: Person, bytes: Buffer = PDF, contentType = 'application/pdf') {
    const start = await p
      .api('post', '/kyc/documents/upload', { body: { contentType, sizeBytes: bytes.length } })
      .expect(200);
    await putBytes(t, start.body.data.upload, bytes).expect(200);
    await p.api('post', `/kyc/documents/${start.body.data.fileId}/complete`).expect(200);
    return start.body.data.fileId as string;
  }
  /** Asserts the status of a response that has already been awaited, and passes it on. */
  const status = (code: number) => (res: { status: number; body: unknown }) => {
    expect(res.status, JSON.stringify(res.body)).toBe(code);
    return res as { status: number; body: any };
  };
  const body = (fileId: string, over: Record<string, unknown> = {}, number = pan()) => ({
    subject: 'INDIVIDUAL',
    legalName: 'Aarav Kumar',
    dateOfBirth: '1995-06-15',
    pan: number,
    documents: [{ type: 'PAN', number, fileId }],
    ...over,
  });
  const submit = async (p: Person, over: Record<string, unknown> = {}, number = pan()) =>
    p.api('post', '/kyc/submissions', { body: body(await scan(p), over, number) });

  // ----------------------------------------------------------------- step-up --

  describe('step-up before sensitive actions', () => {
    const begin = (p: Person, purpose = 'ADD_BANK_ACCOUNT', password = p.password) =>
      p.api('post', '/auth/step-up', { body: { purpose, password } });
    const confirm = async (p: Person, purpose = 'ADD_BANK_ACCOUNT') => {
      const started = (await begin(p, purpose).expect(200)).body.data;
      const done = await p
        .api('post', '/auth/step-up/verify', {
          body: { challengeId: started.challenge.id, code: codeSentTo(t, p.email) },
        })
        .expect(200);
      return done.body.data as { stepUpToken: string; purpose: string; expiresAt: string };
    };

    it('needs the password and a code sent to the account’s own contact', async () => {
      const p = await person(t);
      await begin(p, 'ADD_BANK_ACCOUNT', 'not-the-password').expect(401);
      const started = (await begin(p).expect(200)).body.data;
      expect(started).toMatchObject({
        purpose: 'ADD_BANK_ACCOUNT',
        challenge: { channel: 'EMAIL', destinationMasked: expect.stringContaining('***') },
      });
      // A wrong code is refused with the attempts that are left.
      const wrong = await p.api('post', '/auth/step-up/verify', {
        body: { challengeId: started.challenge.id, code: '000000' },
      });
      expect(wrong.status).toBe(400);
      expect(wrong.body.error.code).toBe('OTP_INVALID');
      const ok = await p
        .api('post', '/auth/step-up/verify', {
          body: { challengeId: started.challenge.id, code: codeSentTo(t, p.email) },
        })
        .expect(200);
      expect(ok.body.data).toMatchObject({ purpose: 'ADD_BANK_ACCOUNT' });
      expect(ok.body.data.stepUpToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
      // The token is stored only as a hash.
      const stored = await row('SELECT token_hash FROM step_up_tokens WHERE user_id = $1', [p.id]);
      expect(stored).toHaveLength(1);
      expect(stored[0]!.token_hash).not.toBe(ok.body.data.stepUpToken);
      expect(stored[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces a token that works once, for its purpose, for its person', async () => {
      const p = await person(t);
      const other = await person(t);
      const { stepUpToken } = await confirm(p);
      await expect(stepUp.consume(other.id, 'ADD_BANK_ACCOUNT', stepUpToken)).rejects.toMatchObject(
        { code: 'STEP_UP_REQUIRED' },
      ); // someone else's
      await expect(stepUp.consume(p.id, 'REQUEST_PAYOUT', stepUpToken)).rejects.toMatchObject({
        code: 'STEP_UP_REQUIRED',
      }); // another purpose
      await expect(stepUp.consume(p.id, 'ADD_BANK_ACCOUNT', undefined)).rejects.toMatchObject({
        code: 'STEP_UP_REQUIRED',
      });
      await expect(stepUp.consume(p.id, 'ADD_BANK_ACCOUNT', 'x'.repeat(43))).rejects.toMatchObject({
        code: 'STEP_UP_REQUIRED',
      });
      await expect(stepUp.consume(p.id, 'ADD_BANK_ACCOUNT', stepUpToken)).resolves.toBeUndefined();
      await expect(stepUp.consume(p.id, 'ADD_BANK_ACCOUNT', stepUpToken)).rejects.toMatchObject({
        code: 'STEP_UP_REQUIRED',
      }); // spent
    });

    it('lets exactly one of several simultaneous uses succeed', async () => {
      const p = await person(t);
      const { stepUpToken } = await confirm(p, 'REQUEST_PAYOUT');
      const results = await Promise.allSettled(
        Array.from({ length: 6 }, () => stepUp.consume(p.id, 'REQUEST_PAYOUT', stepUpToken)),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    });

    it('expires after five minutes', async () => {
      const p = await person(t);
      const { stepUpToken } = await confirm(p, 'UPDATE_TAX_INFO');
      await t.db.query(
        "UPDATE step_up_tokens SET expires_at = now() - interval '1 second' WHERE user_id = $1",
        [p.id],
      );
      await expect(stepUp.consume(p.id, 'UPDATE_TAX_INFO', stepUpToken)).rejects.toMatchObject({
        code: 'STEP_UP_REQUIRED',
      });
    });

    it('cannot be completed with someone else’s challenge, or without signing in, or for an unknown purpose', async () => {
      const a = await person(t);
      const b = await person(t);
      const started = (await begin(a).expect(200)).body.data;
      const stolen = await b.api('post', '/auth/step-up/verify', {
        body: { challengeId: started.challenge.id, code: codeSentTo(t, a.email) },
      });
      expect(stolen.status).toBe(400);
      await begin(a, 'DELETE_EVERYTHING').expect(400);
      await t.http
        .post('/api/v1/auth/step-up')
        .send({ purpose: 'ADD_BANK_ACCOUNT', password: 'x' })
        .expect(401);
      await t.http
        .post('/api/v1/auth/step-up/verify')
        .send({ challengeId: started.challenge.id, code: '123456' })
        .expect(401);
    });

    it('counts wrong passwords against the account, so a stolen session cannot guess', async () => {
      const p = await person(t);
      let last = 0;
      for (let i = 0; i < 8; i++) {
        last = (await begin(p, 'ADD_BANK_ACCOUNT', `wrong-${i}`)).status;
        if (last === 423) break;
      }
      expect(last).toBe(423); // locked
      // Even the right password is paused for a while.
      expect((await begin(p)).status).toBe(423);
    });
  });

  // --------------------------------------------------------------- documents --

  describe('document scans', () => {
    it('are stored in a private bucket after their real type is checked', async () => {
      const p = await person(t);
      const fileId = await scan(p);
      const asset = (
        await row(
          'SELECT bucket, storage_key, status, detected_mime, purpose FROM media_assets WHERE id = $1',
          [fileId],
        )
      )[0]!;
      expect(asset).toMatchObject({
        status: 'READY',
        detected_mime: 'application/pdf',
        purpose: 'KYC_DOCUMENT',
      });
      expect(asset.storage_key).toBe(`kyc/${p.id}/${fileId}`);
      expect(asset.bucket).toBe(t.app.get<string>(KYC_BUCKET, { strict: false }));
      // There is no route that serves it.
      await t.http.get(`/api/v1/media/f/${asset.storage_key}?e=9999999999&s=AAAA`).expect(404);
    });

    it('refuse a file that is not what it says, the wrong type, or too big', async () => {
      const p = await person(t);
      const html = Buffer.from('<html><script>alert(1)</script></html>'.repeat(8));
      const start = await p
        .api('post', '/kyc/documents/upload', {
          body: { contentType: 'application/pdf', sizeBytes: html.length },
        })
        .expect(200);
      await putBytes(t, start.body.data.upload, html).expect(200);
      await p.api('post', `/kyc/documents/${start.body.data.fileId}/complete`).expect(400);
      const storage = t.app.get(ObjectStorage, { strict: false });
      expect(
        await storage.head(
          t.app.get<string>(KYC_BUCKET, { strict: false }),
          `kyc/${p.id}/${start.body.data.fileId}`,
        ),
      ).toBeNull();
      await p
        .api('post', '/kyc/documents/upload', {
          body: { contentType: 'image/gif', sizeBytes: 100 },
        })
        .expect(415);
      await p
        .api('post', '/kyc/documents/upload', {
          body: { contentType: 'application/pdf', sizeBytes: 9 * 1024 * 1024 },
        })
        .expect(413);
      await p
        .api('post', '/kyc/documents/upload', {
          body: { contentType: 'application/pdf', sizeBytes: 0 },
        })
        .expect(400);
    });

    it('belong to the person who uploaded them', async () => {
      const a = await person(t);
      const b = await person(t);
      const start = await a
        .api('post', '/kyc/documents/upload', {
          body: { contentType: 'application/pdf', sizeBytes: PDF.length },
        })
        .expect(200);
      await b.api('post', `/kyc/documents/${start.body.data.fileId}/complete`).expect(404);
    });
  });

  // ------------------------------------------------------------------ submitting --

  describe('submitting details', () => {
    it('shows nothing until you apply, and what is accepted for whom', async () => {
      const p = await person(t);
      expect((await p.api('get', '/kyc').expect(200)).body.data).toEqual({ status: 'NOT_STARTED' });
      const cfg = (await p.api('get', '/kyc/config').expect(200)).body.data;
      expect(cfg.aadhaar).toBe('NOT_ACCEPTED');
      expect(cfg.individualDocuments).not.toContain('AADHAAR');
      expect(cfg.businessDocuments).toContain('GST_CERTIFICATE');
      await t.http.get('/api/v1/kyc').expect(401);
    });

    it('verifies a clear case automatically, keeps the details encrypted, and shows them masked', async () => {
      const p = await person(t);
      const number = pan();
      const res = await submit(p, {}, number).then(status(201));
      expect(res.body.data).toMatchObject({
        status: 'VERIFIED',
        subject: 'INDIVIDUAL',
        legalName: 'A**** K****',
        pan: `XXXXXX${number.slice(-4)}`,
        documents: [{ type: 'PAN', role: 'PRIMARY', number: `XXXX${number.slice(-4)}` }],
      });
      expect(res.body.data.expiresAt).toBeTruthy();
      // Nothing readable is stored, and nothing readable comes back.
      const stored = (await row('SELECT * FROM kyc_profiles WHERE user_id = $1', [p.id]))[0]!;
      const docs = await row('SELECT * FROM kyc_documents WHERE kyc_profile_id = $1', [stored.id]);
      const everything = JSON.stringify([stored, docs, res.body]);
      expect(everything).not.toContain(number);
      expect(everything).not.toContain('Aarav');
      expect(everything).not.toContain('1995-06-15');
      expect(stored.pan_enc).toMatch(/^v1\./);
      expect(stored.legal_name_enc).toMatch(/^v1\./);
      expect(stored.pan_index).toMatch(/^[0-9a-f]{64}$/);
      expect(docs[0]!.number_enc).toMatch(/^v1\./);
      // It can be read back only by the server, for matching a bank's account-holder name.
      expect(await kyc.verifiedLegalName(p.id)).toBe('Aarav Kumar');
      expect(await kyc.isVerified(p.id)).toBe(true);
    });

    it('sends a doubtful case to a person and a failed one back with a reason', async () => {
      const doubtful = await person(t);
      const review = (await submit(doubtful, { legalName: 'Pat Review' }).then(status(201))).body
        .data;
      expect(review).toMatchObject({ status: 'UNDER_REVIEW', reasonCode: 'MANUAL_CHECK' });

      const failed = await person(t);
      const rejected = (await submit(failed, {}, 'ABCPE0000F').then(status(201))).body.data;
      expect(rejected).toMatchObject({ status: 'REJECTED', reasonCode: 'PAN_NOT_FOUND' });
      // A rejected case does not block trying again.
      const again = (await submit(failed).then(status(201))).body.data;
      expect(again.status).toBe('VERIFIED');
    });

    it('refuses Aadhaar in every place it could appear, and does not store it', async () => {
      const p = await person(t);
      const f = await scan(p);
      const base = body(f);
      for (const [label, over] of [
        ['document number', { documents: [{ type: 'PAN', number: AADHAAR, fileId: f }] }],
        ['legal name', { legalName: `Aarav ${AADHAAR}` }],
        ['PAN field', { pan: AADHAAR.replace(/ /g, '') }],
      ] as const) {
        const res = await p.api('post', '/kyc/submissions', { body: { ...base, ...over } });
        expect(res.status, label).toBe(400);
        expect(JSON.stringify(res.body)).not.toContain(AADHAAR);
      }
      const asDocument = await p.api('post', '/kyc/submissions', {
        body: { ...base, documents: [{ type: 'AADHAAR', fileId: f }] },
      });
      expect(asDocument.status).toBe(400);
      expect(await row('SELECT 1 FROM kyc_profiles WHERE user_id = $1', [p.id])).toHaveLength(0);
      expect(
        (await row("SELECT count(*)::int AS n FROM kyc_documents WHERE type = 'AADHAAR'"))[0]!.n,
      ).toBe(0);
    });

    it('checks every field and says which are wrong', async () => {
      const p = await person(t);
      const f = await scan(p);
      const bad = async (over: Record<string, unknown>) => {
        // Each attempt from a different address: the hourly limit on submissions is per address.
        const res = await p
          .api('post', '/kyc/submissions', { body: { ...body(f), ...over }, ip: freshIp() })
          .expect(400);
        return (res.body.error.details as Array<{ field: string }>).map((d) => d.field);
      };
      expect(await bad({ pan: 'NOTAPAN' })).toContain('pan');
      expect(await bad({ pan: 'ABCCE1234F', documents: [{ type: 'PAN', fileId: f }] })).toContain(
        'pan',
      ); // a company PAN for a person
      expect(await bad({ legalName: 'A1' })).toContain('legalName');
      expect(await bad({ legalName: 'X' })).toContain('legalName');
      expect(await bad({ dateOfBirth: undefined })).toContain('dateOfBirth');
      expect(await bad({ dateOfBirth: '2015-01-01' })).toContain('dateOfBirth'); // under 18
      expect(await bad({ dateOfBirth: '1995-02-30' })).toContain('dateOfBirth');
      expect(await bad({ businessName: 'Acme' })).toContain('businessName'); // not for individuals
      expect(await bad({ documents: [] })).toContain('documents');
      expect(await bad({ documents: [{ type: 'GST_CERTIFICATE', fileId: f }] })).toContain(
        'documents.0.type',
      ); // not accepted for a person
      expect(await bad({ documents: [{ type: 'PAN', fileId: f, role: 'SIGNATORY' }] })).toContain(
        'documents.0.role',
      );
      expect(
        await bad({ documents: [{ type: 'PAN', number: 'ABCPE9999Z', fileId: f }] }),
      ).toContain('documents.0.number'); // not this PAN
      expect(
        await bad({ documents: [{ type: 'PAN', fileId: '00000000-0000-4000-8000-000000000000' }] }),
      ).toContain('documents');
    });

    it('refuses fields only the server may set', async () => {
      const p = await person(t);
      const f = await scan(p);
      for (const extra of [
        { status: 'VERIFIED' },
        { verified: true },
        { reviewedById: 'x' },
        { providerReference: 'abc' },
        { expiresAt: '2099-01-01' },
      ]) {
        await p.api('post', '/kyc/submissions', { body: { ...body(f), ...extra } }).expect(400);
      }
    });

    it('will not take a scan twice, or someone else’s, or one that is not finished', async () => {
      const a = await person(t);
      const b = await person(t);
      const f = await scan(a);
      await a.api('post', '/kyc/submissions', { body: body(f) }).expect(201);
      const reuse = await b.api('post', '/kyc/submissions', { body: body(f) }).expect(400);
      expect(JSON.stringify(reuse.body.error.details)).toContain('file_not_available');
      const pending = (
        await b
          .api('post', '/kyc/documents/upload', {
            body: { contentType: 'application/pdf', sizeBytes: PDF.length },
          })
          .expect(200)
      ).body.data.fileId;
      await b.api('post', '/kyc/submissions', { body: body(pending) }).expect(400);
    });

    it('detects one PAN used on two accounts, and a second application while verified', async () => {
      const a = await person(t);
      const b = await person(t);
      const number = pan();
      await submit(a, {}, number).then(status(201));
      const clash = await submit(b, {}, number).then(status(409));
      expect(JSON.stringify(clash.body)).not.toContain(a.id); // says nothing about who
      const again = await submit(a).then(status(409));
      expect(again.body.error.message).toMatch(/already verified/i);
    });

    it('takes a business with its registration document and an authorised person', async () => {
      const p = await person(t);
      const number = 'ABCCE1234F';
      const [reg, signatory] = [await scan(p), await scan(p)];
      const business = (extra: Record<string, unknown> = {}) => ({
        subject: 'BUSINESS',
        legalName: 'Acme Studios Private Limited',
        pan: number,
        businessName: 'Acme Studios',
        businessType: 'PRIVATE_LIMITED',
        documents: [
          { type: 'INCORPORATION', fileId: reg },
          { type: 'PAN', role: 'SIGNATORY', number: 'ABCPE5678F', fileId: signatory },
        ],
        ...extra,
      });
      await p
        .api('post', '/kyc/submissions', { body: business({ dateOfBirth: '1990-01-01' }) })
        .expect(400);
      await p
        .api('post', '/kyc/submissions', { body: business({ businessType: undefined }) })
        .expect(400);
      await p
        .api('post', '/kyc/submissions', { body: business({ gstin: '27AAPFU0939F1ZW' }) })
        .expect(400); // wrong check character
      await p
        .api('post', '/kyc/submissions', {
          body: business({ documents: [{ type: 'INCORPORATION', fileId: reg }] }),
        })
        .expect(400); // no authorised person
      const ok = await p.api('post', '/kyc/submissions', { body: business() }).expect(201);
      expect(ok.body.data).toMatchObject({
        subject: 'BUSINESS',
        businessType: 'PRIVATE_LIMITED',
        status: 'VERIFIED',
      });
      expect(ok.body.data.documents.map((d: any) => d.role).sort()).toEqual([
        'PRIMARY',
        'SIGNATORY',
      ]);
    });
  });

  // ---------------------------------------------------------------- staff review --

  describe('staff review', () => {
    let reviewCase: { id: string; person: Person };
    let verifiedCase: { id: string };

    it('lists cases with every identifier masked', async () => {
      const p = await person(t);
      const res = (await submit(p, { legalName: 'Pat Review' }).then(status(201))).body.data;
      reviewCase = { id: res.id, person: p };
      const v = await person(t);
      verifiedCase = { id: (await submit(v).then(status(201))).body.data.id };

      const list = (await staff(auditor)('get', '/kyc/cases').expect(200)).body.data as any[];
      expect(list.find((c) => c.id === reviewCase.id)).toMatchObject({
        status: 'UNDER_REVIEW',
        legalName: 'P** R*****',
        documents: 1,
      });
      expect(JSON.stringify(list)).not.toMatch(/Pat Review|ABCPE\d{4}F/);
      const filtered = (await staff(reviewer)('get', '/kyc/cases', undefined).expect(200)).body
        .data as any[];
      expect(filtered.length).toBeGreaterThanOrEqual(2);
      const detail = (await staff(auditor)('get', `/kyc/cases/${reviewCase.id}`).expect(200)).body
        .data;
      expect(detail).toMatchObject({ status: 'UNDER_REVIEW', userId: p.id, reviews: [] });
      expect(detail.documents[0]).toMatchObject({ type: 'PAN', hasScan: true });
      expect(JSON.stringify(detail)).not.toMatch(/ABCPE\d{4}F/);
    });

    it('lets only reviewers view a scan, and records every look', async () => {
      const detail = (await staff(auditor)('get', `/kyc/cases/${reviewCase.id}`).expect(200)).body
        .data;
      const docId = detail.documents[0].id;
      await staff(auditor)('get', `/kyc/cases/${reviewCase.id}/documents/${docId}/file`).expect(
        403,
      );
      const link = (
        await staff(reviewer)('get', `/kyc/cases/${reviewCase.id}/documents/${docId}/file`).expect(
          200,
        )
      ).body.data;
      expect(link.expiresInSeconds).toBe(120);
      const served = await t.http.get(pathOf(link.url)).expect(200);
      expect(Number(served.headers['content-length'])).toBeGreaterThan(0);
      const looks = await row(
        "SELECT sensitive, actor_label FROM audit_logs WHERE action = 'kyc.document_viewed' AND target_id = $1",
        [docId],
      );
      expect(looks).toEqual([{ sensitive: true, actor_label: expect.any(String) }]);
      await staff(reviewer)('get', `/kyc/cases/${verifiedCase.id}/documents/${docId}/file`).expect(
        404,
      ); // a document of another case
    });

    it('can approve only what the provider sent for review, with a note', async () => {
      await staff(auditor)('post', `/kyc/cases/${reviewCase.id}/decision`, {
        decision: 'APPROVE',
        note: 'Looks fine to me',
      }).expect(403);
      await staff(reviewer)('post', `/kyc/cases/${reviewCase.id}/decision`, {
        decision: 'APPROVE',
        note: 'short',
      }).expect(400);
      // A case that is already verified cannot be "approved" again, and a rejected one cannot be waved through.
      await staff(reviewer)('post', `/kyc/cases/${verifiedCase.id}/decision`, {
        decision: 'APPROVE',
        note: 'Approving again for no reason',
      }).expect(409);
      const failed = await person(t);
      const rejectedId = (await submit(failed, {}, 'ABCPE0000F').then(status(201))).body.data.id;
      const refused = await staff(reviewer)('post', `/kyc/cases/${rejectedId}/decision`, {
        decision: 'APPROVE',
        note: 'Overriding the provider check',
      }).expect(409);
      expect(refused.body.error.message).toMatch(/sent for review/i);
      expect(
        (await row('SELECT status FROM kyc_profiles WHERE id = $1', [rejectedId]))[0]!.status,
      ).toBe('REJECTED');

      const done = (
        await staff(reviewer)('post', `/kyc/cases/${reviewCase.id}/decision`, {
          decision: 'APPROVE',
          note: 'Documents match the PAN holder',
        }).expect(200)
      ).body.data;
      expect(done).toMatchObject({ status: 'VERIFIED' });
      expect(done.reviews[0]).toMatchObject({
        decision: 'APPROVE',
        note: 'Documents match the PAN holder',
      });
      expect(done.documents[0].status).toBe('ACCEPTED');
      expect((await reviewCase.person.api('get', '/kyc').expect(200)).body.data.status).toBe(
        'VERIFIED',
      );
      const logged = await row(
        "SELECT reason, before, after FROM audit_logs WHERE action = 'kyc.approve' AND target_id = $1",
        [reviewCase.id],
      );
      expect(logged[0]).toMatchObject({
        reason: 'Documents match the PAN holder',
        before: { status: 'UNDER_REVIEW' },
        after: { status: 'VERIFIED' },
      });
      // And a second decision on the same case, now decided, is refused.
      await staff(reviewer)('post', `/kyc/cases/${reviewCase.id}/decision`, {
        decision: 'REJECT',
        reasonCode: 'SUSPECTED_FRAUD',
        note: 'Changed my mind later',
      }).expect(409);
    });

    it('rejects with a reason code, or asks for more, and the person can try again', async () => {
      const a = await person(t);
      const caseA = (await submit(a, { legalName: 'Sam Review' }).then(status(201))).body.data.id;
      await staff(reviewer)('post', `/kyc/cases/${caseA}/decision`, {
        decision: 'REJECT',
        note: 'The document is unreadable',
      }).expect(400); // no reason code
      await staff(reviewer)('post', `/kyc/cases/${caseA}/decision`, {
        decision: 'REJECT',
        reasonCode: 'MADE_UP',
        note: 'The document is unreadable',
      }).expect(400);
      const info = (
        await staff(reviewer)('post', `/kyc/cases/${caseA}/decision`, {
          decision: 'REQUEST_INFO',
          note: 'Please send a clearer scan',
        }).expect(200)
      ).body.data;
      expect(info).toMatchObject({
        status: 'ACTION_REQUIRED',
        reasonCode: 'MORE_INFORMATION_NEEDED',
      });
      // The person sends a new application, which replaces the one that needed more.
      const resent = (await submit(a, { legalName: 'Sam Kumar' }).then(status(201))).body.data;
      expect(resent.status).toBe('VERIFIED');
      expect(resent.id).not.toBe(caseA);
      expect(
        (await row('SELECT status, reason_code FROM kyc_profiles WHERE id = $1', [caseA]))[0],
      ).toEqual({ status: 'REJECTED', reason_code: 'SUPERSEDED' });

      const b = await person(t);
      const caseB = (await submit(b, { legalName: 'Kim Review' }).then(status(201))).body.data.id;
      const rejected = (
        await staff(reviewer)('post', `/kyc/cases/${caseB}/decision`, {
          decision: 'REJECT',
          reasonCode: 'DETAILS_MISMATCH',
          note: 'Name does not match the PAN holder',
        }).expect(200)
      ).body.data;
      expect(rejected).toMatchObject({ status: 'REJECTED', reasonCode: 'DETAILS_MISMATCH' });
      expect((await b.api('get', '/kyc').expect(200)).body.data).toMatchObject({
        status: 'REJECTED',
        reasonCode: 'DETAILS_MISMATCH',
      });
    });

    it('tells the person when their status changes', async () => {
      const notices = (
        await reviewCase.person.api('get', '/notifications', { query: { limit: 50 } }).expect(200)
      ).body.data as Array<{ type: string; data: any }>;
      expect(notices.some((n) => n.type === 'KYC_STATUS' && n.data.status === 'VERIFIED')).toBe(
        true,
      );
    });
  });

  // ----------------------------------------------------------- retention, expiry --

  describe('keeping and deleting', () => {
    it('lapses a verification when its time is up', async () => {
      const p = await person(t);
      await submit(p).then(status(201));
      expect(await kyc.isVerified(p.id)).toBe(true);
      await t.db.query(
        "UPDATE kyc_profiles SET expires_at = now() - interval '1 day' WHERE user_id = $1",
        [p.id],
      );
      expect(await kyc.isVerified(p.id)).toBe(false); // already, before any job notices
      expect(await kyc.expireLapsed()).toBeGreaterThanOrEqual(1);
      expect((await p.api('get', '/kyc').expect(200)).body.data.status).toBe('EXPIRED');
      // An expired person can apply again.
      expect((await submit(p).then(status(201))).body.data.status).toBe('VERIFIED');
    });

    it('deletes scans and stored numbers when retention ends', async () => {
      const p = await person(t);
      await submit(p).then(status(201));
      const doc = (
        await row(
          'SELECT d.id, d.file_asset_id, a.storage_key, a.bucket FROM kyc_documents d JOIN kyc_profiles k ON k.id = d.kyc_profile_id JOIN media_assets a ON a.id = d.file_asset_id WHERE k.user_id = $1',
          [p.id],
        )
      )[0]!;
      const storage = t.app.get(ObjectStorage, { strict: false });
      expect(await storage.head(doc.bucket, doc.storage_key)).not.toBeNull();
      await t.db.query(
        "UPDATE kyc_documents SET retention_until = now() - interval '1 day' WHERE id = $1",
        [doc.id],
      );
      expect(await kyc.purgeExpiredDocuments()).toBeGreaterThanOrEqual(1);
      expect(await storage.head(doc.bucket, doc.storage_key)).toBeNull();
      const after = (
        await row(
          'SELECT number_enc, number_index, file_asset_id, deleted_at FROM kyc_documents WHERE id = $1',
          [doc.id],
        )
      )[0]!;
      expect(after).toMatchObject({ number_enc: null, number_index: null, file_asset_id: null });
      expect(after.deleted_at).toBeTruthy();
      expect(
        (await row('SELECT status FROM media_assets WHERE id = $1', [doc.file_asset_id]))[0]!
          .status,
      ).toBe('DELETED');
    });
  });
});

describe('money features switched off', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({
      ...AUTH_TEST_ENV,
      LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? 'silent',
      ...storageEnv(),
      MONEY_FEATURES_ENABLED: 'false',
    });
  }, 240_000);
  afterAll(() => t.close());

  it('refuses to take identity documents or details, but still answers questions', async () => {
    const p = await person(t);
    expect((await p.api('get', '/kyc').expect(200)).body.data).toEqual({ status: 'NOT_STARTED' });
    const refused = await p
      .api('post', '/kyc/documents/upload', {
        body: { contentType: 'application/pdf', sizeBytes: 100 },
      })
      .expect(503);
    expect(refused.body.error.code).toBe('SERVICE_UNAVAILABLE');
    await p.api('post', '/kyc/submissions', { body: { subject: 'INDIVIDUAL' } }).expect(400); // validated before anything else
    expect(await t.db.query('SELECT 1 FROM kyc_profiles')).toMatchObject({ rowCount: 0 });
  });
});
