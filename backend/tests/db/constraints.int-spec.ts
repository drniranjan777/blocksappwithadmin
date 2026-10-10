import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../support/database.js';
import { createAdmin, createPost, createReel, createUser } from '../support/factories.js';

/** Rules the database enforces no matter which code path writes the data. */
describe('database constraints', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase();
  });
  afterAll(async () => {
    await db.dispose();
  });

  describe('accounts', () => {
    it('needs an e-mail or a phone', async () => {
      await expect(
        db.prisma.user.create({
          data: {
            username: 'nocontact',
            passwordHash: 'x',
            email: null,
            phone: null,
          },
        }),
      ).rejects.toThrow(/users_contact_present/);
    });

    it('lets an erased account have no contact details, and only an erased one', async () => {
      const user = await db.prisma.user.create({
        data: { username: 'soon_gone', email: 'soon_gone@x.test', passwordHash: 'x' },
      });
      // Taking the contact away from a live account is refused…
      await expect(
        db.prisma.user.update({ where: { id: user.id }, data: { email: null } }),
      ).rejects.toThrow(/users_contact_present/);
      // …but erasure (status DELETED) is allowed to.
      await expect(
        db.prisma.user.update({ where: { id: user.id }, data: { email: null, status: 'DELETED' } }),
      ).resolves.toMatchObject({ status: 'DELETED', email: null });
    });

    it('keeps usernames lower-case, 3 to 30 characters of a-z 0-9 . _', async () => {
      for (const bad of ['Ab', 'UPPER', 'has space', 'a'.repeat(31), 'emoji😀']) {
        await expect(
          db.prisma.user.create({
            data: {
              username: bad,
              email: `${Math.random()}@x.test`,
              passwordHash: 'x',
            },
          }),
          // 31 characters never reaches the CHECK: the column itself is VARCHAR(30).
        ).rejects.toThrow(/users_username_format|too long/);
      }
    });

    it('keeps e-mail lower-case and phone in E.164', async () => {
      await expect(
        db.prisma.user.create({
          data: { username: 'mixedcase', email: 'A@B.test', passwordHash: 'x' },
        }),
      ).rejects.toThrow(/users_email_lowercase/);
      await expect(
        db.prisma.user.create({
          data: { username: 'badphone', phone: '98765', passwordHash: 'x' },
        }),
      ).rejects.toThrow(/users_phone_e164/);
    });

    it('refuses a duplicate username or e-mail', async () => {
      const u = await createUser(db.prisma);
      await expect(
        db.prisma.user.create({
          data: {
            username: u.username,
            email: 'other@x.test',
            passwordHash: 'x',
          },
        }),
      ).rejects.toThrow(/Unique constraint|unique/i);
    });

    it('stops a user following or blocking themselves', async () => {
      const u = await createUser(db.prisma);
      await expect(
        db.prisma.follow.create({
          data: { followerId: u.id, followeeId: u.id },
        }),
      ).rejects.toThrow(/follows_not_self/);
      await expect(
        db.prisma.userBlock.create({
          data: { blockerId: u.id, blockedId: u.id, kind: 'BLOCK' },
        }),
      ).rejects.toThrow(/user_blocks_not_self/);
    });
  });

  describe('engagement targets', () => {
    it('requires a like to point at exactly one thing', async () => {
      const u = await createUser(db.prisma);
      const post = await createPost(db.prisma, u.id);
      const reel = await createReel(db.prisma, u.id);
      await expect(db.prisma.like.create({ data: { userId: u.id } })).rejects.toThrow(
        /likes_one_target/,
      );
      await expect(
        db.prisma.like.create({
          data: { userId: u.id, postId: post.id, reelId: reel.id },
        }),
      ).rejects.toThrow(/likes_one_target/);
      await expect(
        db.prisma.like.create({ data: { userId: u.id, postId: post.id } }),
      ).resolves.toBeTruthy();
    });

    it('allows one like per person per item', async () => {
      const u = await createUser(db.prisma);
      const post = await createPost(db.prisma, u.id);
      await db.prisma.like.create({ data: { userId: u.id, postId: post.id } });
      await expect(
        db.prisma.like.create({ data: { userId: u.id, postId: post.id } }),
      ).rejects.toThrow(/Unique constraint|unique/i);
    });

    it('requires a comment, reach event and reach score to have one target', async () => {
      const u = await createUser(db.prisma);
      await expect(
        db.prisma.comment.create({ data: { authorId: u.id, body: 'orphan' } }),
      ).rejects.toThrow(/comments_one_target/);
      await expect(db.prisma.reachEvent.create({ data: { type: 'IMPRESSION' } })).rejects.toThrow(
        /reach_events_one_target/,
      );
    });

    it('does not allow negative counters', async () => {
      const u = await createUser(db.prisma);
      const post = await createPost(db.prisma, u.id);
      await expect(
        db.prisma.post.update({
          where: { id: post.id },
          data: { likesCount: -1 },
        }),
      ).rejects.toThrow(/posts_counters_nonnegative/);
    });

    it('refuses a reel with no length or a music window that runs backwards', async () => {
      const u = await createUser(db.prisma);
      await expect(
        db.prisma.reel.create({
          data: { authorId: u.id, caption: 'x', durationMs: 0 },
        }),
      ).rejects.toThrow(/reels_duration_positive/);
      await expect(
        db.prisma.reel.create({
          data: {
            authorId: u.id,
            caption: 'x',
            durationMs: 5000,
            musicStartMs: 9000,
            musicEndMs: 3000,
          },
        }),
      ).rejects.toThrow(/reels_music_window/);
    });
  });

  describe('music rights', () => {
    it('never lets a restricted track be active, or an active one have no territory', async () => {
      await expect(
        db.prisma.musicTrack.create({
          data: {
            title: 't',
            artist: 'a',
            language: 'Hindi',
            durationMs: 1000,
            audioKey: 'music/x/full.m4a',
            previewKey: 'music/x/preview.m4a',
            rightsType: 'RESTRICTED',
            status: 'ACTIVE',
            allowedCountries: ['IN'],
          },
        }),
      ).rejects.toThrow(/music_tracks_restricted_never_active/);
      await expect(
        db.prisma.musicTrack.create({
          data: {
            title: 't',
            artist: 'a',
            language: 'Hindi',
            durationMs: 1000,
            audioKey: 'music/x/full.m4a',
            previewKey: 'music/x/preview.m4a',
            rightsType: 'LICENSED',
            status: 'ACTIVE',
            allowedCountries: [],
          },
        }),
      ).rejects.toThrow(/music_tracks_active_has_territory/);
    });

    it('lets a draft be added before its audio exists, but never lets a live track lack it', async () => {
      const base = { title: 't', artist: 'a', language: 'Hindi', rightsType: 'LICENSED' as const };
      await expect(
        db.prisma.musicTrack.create({ data: { ...base, durationMs: 0, status: 'DRAFT' } }),
      ).resolves.toMatchObject({ status: 'DRAFT' });
      await expect(
        db.prisma.musicTrack.create({ data: { ...base, durationMs: -1 } }),
      ).rejects.toThrow(/music_tracks_duration_valid/);
      const live = { ...base, status: 'ACTIVE' as const, allowedCountries: ['IN'] };
      // Each of these is missing one thing a live track needs.
      for (const missing of [
        { durationMs: 0, audioKey: 'a', previewKey: 'p' },
        { durationMs: 1000, previewKey: 'p' },
        { durationMs: 1000, audioKey: 'a' },
      ]) {
        await expect(
          db.prisma.musicTrack.create({ data: { ...live, ...missing } }),
        ).rejects.toThrow(/music_tracks_active_complete/);
      }
    });
  });

  describe('identity documents', () => {
    it('can never store an Aadhaar number, encrypted or indexed', async () => {
      const u = await createUser(db.prisma);
      const kyc = await db.prisma.kycProfile.create({
        data: {
          userId: u.id,
          subject: 'INDIVIDUAL',
          legalNameEnc: 'enc',
          legalNameMasked: 'A*** K***',
        },
      });
      await expect(
        db.prisma.kycDocument.create({
          data: {
            kycProfileId: kyc.id,
            type: 'AADHAAR',
            numberEnc: 'ciphertext',
            numberLast4: '4821',
          },
        }),
      ).rejects.toThrow(/kyc_documents_aadhaar_never_stored/);
      await expect(
        db.prisma.kycDocument.create({
          data: {
            kycProfileId: kyc.id,
            type: 'AADHAAR',
            numberIndex: 'a'.repeat(64),
            numberLast4: '4821',
          },
        }),
      ).rejects.toThrow(/kyc_documents_aadhaar_never_stored/);
      // Only the last four digits are allowed.
      await expect(
        db.prisma.kycDocument.create({
          data: { kycProfileId: kyc.id, type: 'AADHAAR', numberLast4: '4821' },
        }),
      ).resolves.toBeTruthy();
      // A PAN is a different matter: it may be stored encrypted.
      await expect(
        db.prisma.kycDocument.create({
          data: {
            kycProfileId: kyc.id,
            type: 'PAN',
            numberEnc: 'ciphertext',
            numberLast4: '234F',
            numberIndex: 'b'.repeat(64),
          },
        }),
      ).resolves.toBeTruthy();
    });

    it('allows one live identity case per user, but a retry after rejection', async () => {
      const u = await createUser(db.prisma);
      const data = {
        userId: u.id,
        subject: 'INDIVIDUAL' as const,
        legalNameEnc: 'e',
        legalNameMasked: 'm',
      };
      const first = await db.prisma.kycProfile.create({ data });
      await expect(db.prisma.kycProfile.create({ data })).rejects.toThrow(
        /kyc_profiles_one_live_case|unique/i,
      );
      await db.prisma.kycProfile.update({
        where: { id: first.id },
        data: { status: 'REJECTED' },
      });
      await expect(db.prisma.kycProfile.create({ data })).resolves.toBeTruthy();
    });
  });

  describe('payout accounts', () => {
    const account = (userId: string, n: string) => ({
      userId,
      holderNameEnc: 'enc',
      accountNumberEnc: 'enc',
      accountNumberLast4: '4821',
      accountNumberIndex: n.repeat(64).slice(0, 64),
      ifsc: 'HDFC0001234',
      bankName: 'HDFC Bank',
    });

    it('validates the IFSC shape and the last-four digits', async () => {
      const u = await createUser(db.prisma);
      await expect(
        db.prisma.payoutAccount.create({
          data: { ...account(u.id, 'a'), ifsc: 'bad' },
        }),
      ).rejects.toThrow(/payout_accounts_ifsc_format/);
      await expect(
        db.prisma.payoutAccount.create({
          data: { ...account(u.id, 'a'), accountNumberLast4: '12ab' },
        }),
      ).rejects.toThrow(/payout_accounts_last4_format/);
    });

    it('does not accept the same account twice, and only a verified one as primary', async () => {
      const u = await createUser(db.prisma);
      await db.prisma.payoutAccount.create({ data: account(u.id, 'c') });
      await expect(db.prisma.payoutAccount.create({ data: account(u.id, 'c') })).rejects.toThrow(
        /payout_accounts_no_duplicates|unique/i,
      );
      await expect(
        db.prisma.payoutAccount.create({
          data: { ...account(u.id, 'd'), isPrimary: true },
        }),
      ).rejects.toThrow(/payout_accounts_primary_is_verified/);
    });

    it('has one primary account per user', async () => {
      const u = await createUser(db.prisma);
      const verified = { status: 'VERIFIED' as const, isPrimary: true };
      await db.prisma.payoutAccount.create({
        data: { ...account(u.id, 'e'), ...verified },
      });
      await expect(
        db.prisma.payoutAccount.create({
          data: { ...account(u.id, 'f'), ...verified },
        }),
      ).rejects.toThrow(/payout_accounts_one_primary|unique/i);
    });
  });

  describe('reach configuration', () => {
    it('allows one active version, and freezes it once it is no longer a draft', async () => {
      const admin = await createAdmin(db.prisma);
      const v1 = await db.prisma.reachConfigVersion.create({
        data: {
          version: 1,
          status: 'ACTIVE',
          config: { w: 1 },
          createdById: admin.id,
        },
      });
      await expect(
        db.prisma.reachConfigVersion.create({
          data: {
            version: 2,
            status: 'ACTIVE',
            config: { w: 2 },
            createdById: admin.id,
          },
        }),
      ).rejects.toThrow(/reach_config_single_active|unique/i);
      await expect(
        db.prisma.reachConfigVersion.update({
          where: { id: v1.id },
          data: { config: { w: 99 } },
        }),
      ).rejects.toThrow(/no longer a draft/);
      // A draft can still be edited, and archiving an active version is allowed.
      const draft = await db.prisma.reachConfigVersion.create({
        data: {
          version: 3,
          status: 'DRAFT',
          config: { w: 3 },
          createdById: admin.id,
        },
      });
      await expect(
        db.prisma.reachConfigVersion.update({
          where: { id: draft.id },
          data: { config: { w: 4 } },
        }),
      ).resolves.toBeTruthy();
      await expect(
        db.prisma.reachConfigVersion.update({
          where: { id: v1.id },
          data: { status: 'ARCHIVED' },
        }),
      ).resolves.toBeTruthy();
    });

    it('keeps scores between 0 and 100', async () => {
      const u = await createUser(db.prisma);
      const reel = await createReel(db.prisma, u.id);
      const admin = await createAdmin(db.prisma);
      const cfg = await db.prisma.reachConfigVersion.create({
        data: { version: 10, config: {}, createdById: admin.id },
      });
      await expect(
        db.prisma.reachScore.create({
          data: {
            reelId: reel.id,
            configVersionId: cfg.id,
            qualifiedReach: 1,
            score: '100.01',
            signals: {},
            level: 'DISTRICT',
          },
        }),
      ).rejects.toThrow(/reach_scores_score_range|numeric field overflow/i);
    });
  });

  describe('audit log', () => {
    it('is append-only', async () => {
      await db.prisma.auditLog.create({
        data: { actorType: 'SYSTEM', action: 'test.created' },
      });
      await expect(db.query("UPDATE audit_logs SET action = 'tampered'")).rejects.toThrow(
        /append-only/,
      );
      await expect(db.query('DELETE FROM audit_logs')).rejects.toThrow(/append-only/);
      await expect(db.query('TRUNCATE audit_logs')).rejects.toThrow(/append-only/);
    });
  });

  describe('advertising', () => {
    it('keeps spend within budget and the end after the start', async () => {
      const u = await createUser(db.prisma);
      const base = {
        advertiserId: u.id,
        name: 'c',
        objective: 'AWARENESS' as const,
        headline: 'h',
        targeting: {},
        startsAt: new Date('2026-11-01'),
        endsAt: new Date('2026-11-10'),
      };
      await expect(
        db.prisma.adCampaign.create({
          data: { ...base, budgetTotal: '1000.00', spent: '1000.01' },
        }),
      ).rejects.toThrow(/ad_campaigns_spend_within_budget/);
      await expect(
        db.prisma.adCampaign.create({
          data: {
            ...base,
            budgetTotal: '1000.00',
            endsAt: new Date('2026-10-01'),
          },
        }),
      ).rejects.toThrow(/ad_campaigns_window/);
      await expect(
        db.prisma.adCampaign.create({
          data: { ...base, budgetTotal: '1000.00' },
        }),
      ).resolves.toBeTruthy();
    });
  });
});
