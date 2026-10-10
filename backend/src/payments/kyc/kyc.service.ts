import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../../admin/audit/audit.service.js';
import { BlindIndex, FieldCipher } from '../../common/crypto/field-cipher.js';
import { maskName } from '../../common/crypto/mask.js';
import { AppError, Errors, type FieldIssue } from '../../common/errors/app-error.js';
import type { AdminAuthContext } from '../../common/http/request.js';
import { uuidv7 } from '../../common/ids.js';
import { Page, clampLimit, decodeCursor } from '../../common/pagination/cursor.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { KycProfile, KycStatus, Prisma } from '../../generated/prisma/client.js';
import { CreatorProfileService } from '../../earnings/creator-profile.service.js';
import { NotificationService } from '../../notifications/notification.service.js';
import { SecurityEventService } from '../../security/security-events.service.js';
import { cleanLine } from '../../social/shared/text.js';
import { looksLikeAadhaar, normaliseGstin, normalisePan } from '../identifiers.js';
import { PaymentSettings } from '../payment-settings.js';
import { KycProvider } from '../providers/providers.js';
import {
  BUSINESS_DOCS,
  INDIVIDUAL_DOCS,
  type KycDecisionDto,
  type SubmitKycDto,
} from './kyc.dto.js';
import { KycFilesService } from './kyc-files.service.js';

const cursorSchema = z.object({ t: z.string(), id: z.string() });
const LIVE: KycStatus[] = ['PENDING', 'UNDER_REVIEW', 'ACTION_REQUIRED', 'VERIFIED'];
const NAME = /^[\p{L}][\p{L}\p{M}\s.'-]{1,119}$/u;
const DOC_NUMBER = /^[A-Za-z0-9][A-Za-z0-9/ -]{2,38}[A-Za-z0-9]$/;
const MIN_AGE_YEARS = 18;

interface Meta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

/** Everything the money features are switched off by: nothing to do until a real provider is connected. */
export function moneyDisabled(): AppError {
  return new AppError(503, 'SERVICE_UNAVAILABLE', 'This is not available yet.');
}

/**
 * Identity verification (KYC).
 *
 * What it does and does not do, so nobody assumes more:
 *   - It collects the minimum for an Indian creator payout: legal name, PAN (and date of birth
 *     for a person; business name, type and optionally GSTIN for a business) plus scans of
 *     accepted documents. Not every document is accepted for every purpose.
 *   - **Aadhaar is never accepted**: not as a document, not as a number in any field. A
 *     12-digit number shaped like one is refused outright. Any Aadhaar-based check has to go
 *     through an authorised provider's own flow and is outside this system.
 *   - Identifiers are encrypted (AES-256-GCM, bound to their row), shown only masked, and
 *     found again by a keyed hash, so duplicates are detected without decrypting anything.
 *   - A **provider** decides. It can verify a case outright, send it to a person, or reject
 *     it. Staff can only approve a case the provider sent for review, with a recorded reason;
 *     there is no way to mark a case verified by hand that the provider did not clear.
 *   - Scans sit in a separate private bucket; viewing one needs a named permission and is
 *     audited. After the retention period the scans and the stored numbers are deleted.
 */
@Injectable()
export class KycService {
  private readonly logger = new Logger('Kyc');

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
    private readonly blind: BlindIndex,
    private readonly provider: KycProvider,
    private readonly files: KycFilesService,
    private readonly settings: PaymentSettings,
    private readonly audit: AuditService,
    private readonly security: SecurityEventService,
    private readonly notifications: NotificationService,
    private readonly creators: CreatorProfileService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  enabled(): boolean {
    return this.env.moneyEnabled;
  }

  assertEnabled(): void {
    if (!this.enabled()) throw moneyDisabled();
  }

  /** What the app needs to build the form without hard-coding it. */
  config() {
    return {
      minimumAge: MIN_AGE_YEARS,
      individualDocuments: INDIVIDUAL_DOCS,
      businessDocuments: BUSINESS_DOCS,
      authorisedPersonDocuments: INDIVIDUAL_DOCS,
      aadhaar: 'NOT_ACCEPTED',
    };
  }

  // ------------------------------------------------------------------ the user --

  private view(
    p: KycProfile & {
      documents: Array<{
        type: string;
        role: string;
        status: string;
        numberLast4: string | null;
        rejectionCode: string | null;
      }>;
    },
  ) {
    return {
      id: p.id,
      subject: p.subject,
      status: p.status,
      legalName: p.legalNameMasked,
      pan: p.panLast4 ? `XXXXXX${p.panLast4}` : null,
      businessType: p.businessType,
      reasonCode: p.reasonCode,
      submittedAt: p.submittedAt.toISOString(),
      reviewedAt: p.reviewedAt?.toISOString() ?? null,
      expiresAt: p.expiresAt?.toISOString() ?? null,
      documents: p.documents.map((d) => ({
        type: d.type,
        role: d.role,
        status: d.status,
        number: d.numberLast4 ? `XXXX${d.numberLast4}` : null,
        rejectionCode: d.rejectionCode,
      })),
    };
  }

  /** The person's current case, masked. `NOT_STARTED` when they have never applied. */
  async status(userId: string) {
    const latest = await this.prisma.kycProfile.findFirst({
      where: { userId },
      include: { documents: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } } },
      orderBy: { submittedAt: 'desc' },
    });
    return latest ? this.view(latest) : { status: 'NOT_STARTED' as const };
  }

  /** Is this person's identity verified, and not lapsed? The one question the bank and payout code asks. */
  async isVerified(
    userId: string,
    db: Pick<Prisma.TransactionClient, 'kycProfile'> = this.prisma,
  ): Promise<boolean> {
    const p = await db.kycProfile.findFirst({
      where: {
        userId,
        status: 'VERIFIED',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    });
    return !!p;
  }

  /** The verified legal name, decrypted, for matching against a bank's account-holder name. Never returned to a client. */
  async verifiedLegalName(userId: string): Promise<string | null> {
    const p = await this.prisma.kycProfile.findFirst({
      where: { userId, status: 'VERIFIED' },
      orderBy: { submittedAt: 'desc' },
    });
    return p ? this.cipher.decrypt(p.legalNameEnc, `kyc_profiles.legal_name_enc:${p.id}`) : null;
  }

  async submit(userId: string, dto: SubmitKycDto, meta: Meta) {
    this.assertEnabled();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (!user) throw Errors.unauthenticated();
    if (user.status !== 'ACTIVE')
      throw Errors.forbidden('Cancel the scheduled account deletion to continue.');

    const { issues, clean } = this.validate(dto);
    if (issues.length) throw Errors.validation(issues);
    const c = clean as NonNullable<typeof clean>;

    const panIndex = this.blind.of('pan', c.pan);
    const clash = await this.prisma.kycProfile.findFirst({
      where: { panIndex, userId: { not: userId }, status: { in: LIVE } },
      select: { id: true },
    });
    // The same message whoever holds it, and nothing about who.
    if (clash)
      throw Errors.conflict(
        'These details cannot be used. Contact support if you think this is a mistake.',
        'CONFLICT',
      );

    await this.assertScans(userId, dto);

    const id = uuidv7();
    const retentionDays = await this.settings.documentRetentionDays();
    const profile = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.kycProfile.findFirst({ where: { userId, status: { in: LIVE } } });
      if (existing) {
        if (existing.status !== 'ACTION_REQUIRED') {
          throw Errors.conflict(
            existing.status === 'VERIFIED'
              ? 'Your identity is already verified.'
              : 'You already have a case in progress.',
          );
        }
        // The person was asked for more: their new submission replaces the old case.
        await tx.kycProfile.update({
          where: { id: existing.id },
          data: { status: 'REJECTED', reasonCode: 'SUPERSEDED' },
        });
      }
      return tx.kycProfile.create({
        data: {
          id,
          userId,
          subject: c.subject,
          status: 'PENDING',
          legalNameEnc: this.cipher.encrypt(c.legalName, `kyc_profiles.legal_name_enc:${id}`),
          legalNameMasked: maskName(c.legalName),
          dateOfBirthEnc: c.dateOfBirth
            ? this.cipher.encrypt(c.dateOfBirth, `kyc_profiles.date_of_birth_enc:${id}`)
            : null,
          businessNameEnc: c.businessName
            ? this.cipher.encrypt(c.businessName, `kyc_profiles.business_name_enc:${id}`)
            : null,
          businessType: c.businessType ?? null,
          panEnc: this.cipher.encrypt(c.pan, `kyc_profiles.pan_enc:${id}`),
          panLast4: c.pan.slice(-4),
          panIndex,
          retentionUntil: new Date(Date.now() + retentionDays * 86_400_000),
          documents: {
            create: c.documents.map((d) => {
              const docId = uuidv7();
              return {
                id: docId,
                type: d.type,
                role: d.role,
                numberEnc: d.number
                  ? this.cipher.encrypt(d.number, `kyc_documents.number_enc:${docId}`)
                  : null,
                numberLast4: d.number ? d.number.slice(-4) : null,
                numberIndex: d.number ? this.blind.of(`doc:${d.type}`, d.number) : null,
                fileAssetId: d.fileId,
                retentionUntil: new Date(Date.now() + retentionDays * 86_400_000),
              };
            }),
          },
        },
      });
    });

    await this.security
      .record({
        userId,
        type: 'IDENTITY_DETAILS_CHANGED',
        ip: meta.ip,
        details: { action: 'kyc_submitted', subject: c.subject },
      })
      .catch(() => undefined);
    await this.askProvider(profile.id, {
      subject: c.subject,
      legalName: c.legalName,
      dateOfBirth: c.dateOfBirth,
      pan: c.pan,
      businessName: c.businessName,
      gstin: c.gstin,
    });
    return this.status(userId);
  }

  /** Checks every field; returns what to store (cleaned) or every problem found. */
  private validate(dto: SubmitKycDto) {
    const issues: FieldIssue[] = [];
    const bad = (field: string, reason: string) => issues.push({ field, reasons: [reason] });

    // Anything that looks like an Aadhaar number is refused wherever it appears.
    const texts: Array<[string, string | undefined]> = [
      ['legalName', dto.legalName],
      ['pan', dto.pan],
      ['businessName', dto.businessName],
      ['gstin', dto.gstin],
      ...dto.documents.map((d, i): [string, string | undefined] => [
        `documents.${i}.number`,
        d.number,
      ]),
    ];
    for (const [field, text] of texts) {
      if (text && looksLikeAadhaar(text)) bad(field, 'aadhaar_not_accepted');
    }

    const legalName = cleanLine(dto.legalName);
    if (!NAME.test(legalName)) bad('legalName', 'invalid');
    const pan = normalisePan(dto.pan, dto.subject);
    if (!pan) bad('pan', dto.subject === 'INDIVIDUAL' ? 'invalid_for_individual' : 'invalid');

    let dateOfBirth: string | undefined;
    let businessName: string | undefined;
    let gstin: string | undefined;
    if (dto.subject === 'INDIVIDUAL') {
      for (const f of ['businessName', 'businessType', 'gstin'] as const)
        if (dto[f]) bad(f, 'not_for_individuals');
      const dob = dto.dateOfBirth ? new Date(`${dto.dateOfBirth}T00:00:00Z`) : null;
      if (
        !dob ||
        Number.isNaN(dob.getTime()) ||
        dob.toISOString().slice(0, 10) !== dto.dateOfBirth
      ) {
        bad('dateOfBirth', 'required');
      } else {
        const age = (Date.now() - dob.getTime()) / (365.25 * 86_400_000);
        if (age < MIN_AGE_YEARS) bad('dateOfBirth', 'under_minimum_age');
        else if (age > 110) bad('dateOfBirth', 'invalid');
        else dateOfBirth = dto.dateOfBirth;
      }
    } else {
      if (dto.dateOfBirth) bad('dateOfBirth', 'not_for_businesses');
      businessName = cleanLine(dto.businessName ?? '');
      if (businessName.length < 2) bad('businessName', 'required');
      if (!dto.businessType) bad('businessType', 'required');
      if (dto.gstin) {
        gstin = normaliseGstin(dto.gstin, pan ?? undefined) ?? undefined;
        if (!gstin) bad('gstin', 'invalid');
      }
    }

    // Documents: which are acceptable depends on who is verifying and in what role.
    const seen = new Set<string>();
    const documents = dto.documents.map((d, i) => {
      const role = d.role ?? 'PRIMARY';
      const allowed: readonly string[] =
        dto.subject === 'INDIVIDUAL'
          ? INDIVIDUAL_DOCS
          : role === 'SIGNATORY'
            ? INDIVIDUAL_DOCS
            : BUSINESS_DOCS;
      if (dto.subject === 'INDIVIDUAL' && role === 'SIGNATORY')
        bad(`documents.${i}.role`, 'not_for_individuals');
      if (!allowed.includes(d.type)) bad(`documents.${i}.type`, 'not_accepted_for_this_purpose');
      const key = `${d.type}:${role}`;
      if (seen.has(key)) bad(`documents.${i}.type`, 'duplicate');
      seen.add(key);
      let number: string | undefined;
      if (d.number) {
        const compact = d.number.trim();
        if (d.type === 'PAN' || d.type === 'BUSINESS_PAN') {
          number = normalisePan(compact, dto.subject) ?? undefined;
          if (!number || (pan && number !== pan && role === 'PRIMARY'))
            bad(`documents.${i}.number`, 'invalid');
        } else if (DOC_NUMBER.test(compact)) number = compact.toUpperCase();
        else bad(`documents.${i}.number`, 'invalid');
      }
      return { type: d.type, role, number, fileId: d.fileId };
    });
    if (dto.subject === 'INDIVIDUAL' && !documents.some((d) => d.role === 'PRIMARY'))
      bad('documents', 'identity_document_required');
    if (dto.subject === 'BUSINESS') {
      if (!documents.some((d) => d.role === 'PRIMARY'))
        bad('documents', 'registration_document_required');
      if (!documents.some((d) => d.role === 'SIGNATORY'))
        bad('documents', 'authorised_person_document_required');
    }
    if (new Set(dto.documents.map((d) => d.fileId)).size !== dto.documents.length)
      bad('documents', 'same_file_twice');

    if (issues.length || !pan) return { issues, clean: undefined };
    return {
      issues,
      clean: {
        subject: dto.subject,
        legalName,
        pan,
        dateOfBirth,
        businessName,
        businessType: dto.businessType,
        gstin,
        documents,
      },
    };
  }

  /** Every scan named must be the person's own, finished, and not already used. */
  private async assertScans(userId: string, dto: SubmitKycDto): Promise<void> {
    const ids = dto.documents.map((d) => d.fileId);
    const [found, used] = await Promise.all([
      this.prisma.mediaAsset.count({
        where: {
          id: { in: ids },
          ownerId: userId,
          purpose: 'KYC_DOCUMENT',
          status: 'READY',
          deletedAt: null,
        },
      }),
      this.prisma.kycDocument.count({ where: { fileAssetId: { in: ids } } }),
    ]);
    if (found !== ids.length || used > 0) {
      throw Errors.validation([{ field: 'documents', reasons: ['file_not_available'] }]);
    }
  }

  // ------------------------------------------------------------------ provider --

  /** Sends a case to the provider and applies the answer. A provider outage leaves it pending, to be retried. */
  private async askProvider(
    profileId: string,
    input: Parameters<KycProvider['check']>[0],
  ): Promise<void> {
    try {
      const result = await this.provider.check(input);
      if (result.outcome === 'APPROVED' && result.panVerified && result.nameMatch === 'MATCH') {
        await this.setStatus(profileId, 'VERIFIED', { providerReference: result.reference });
      } else if (result.outcome === 'REJECTED') {
        await this.setStatus(profileId, 'REJECTED', {
          providerReference: result.reference,
          reasonCode: result.reasonCode ?? 'PROVIDER_REJECTED',
        });
      } else {
        // Approved-but-not-matching and "review" both need a person: never an automatic yes.
        await this.setStatus(profileId, 'UNDER_REVIEW', {
          providerReference: result.reference,
          reasonCode: result.reasonCode ?? 'MANUAL_CHECK',
        });
      }
    } catch (error) {
      this.logger.warn(
        `identity provider unavailable for case ${profileId}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Changes a case's status, if it is still in one of the statuses expected, and returns whose
   * case it is. Takes a transaction so a decision and the change it causes commit together.
   */
  private async transition(
    db: Pick<Prisma.TransactionClient, 'kycProfile'>,
    profileId: string,
    status: KycStatus,
    extra: { providerReference?: string; reasonCode?: string | null; reviewerId?: string },
    expectFrom?: KycStatus[],
  ): Promise<string> {
    const validDays = await this.settings.kycValidDays();
    const res = await db.kycProfile.updateMany({
      where: { id: profileId, ...(expectFrom ? { status: { in: expectFrom } } : {}) },
      data: {
        status,
        ...(extra.providerReference ? { providerReference: extra.providerReference } : {}),
        reasonCode: extra.reasonCode ?? null,
        ...(status === 'VERIFIED' || status === 'REJECTED'
          ? {
              reviewedAt: new Date(),
              ...(extra.reviewerId ? { reviewedById: extra.reviewerId } : {}),
            }
          : {}),
        ...(status === 'VERIFIED'
          ? { expiresAt: new Date(Date.now() + validDays * 86_400_000) }
          : {}),
      },
    });
    if (res.count !== 1)
      throw Errors.conflict('This case was changed by someone else. Reload and try again.');
    const p = await db.kycProfile.findUniqueOrThrow({
      where: { id: profileId },
      select: { userId: true },
    });
    return p.userId;
  }

  /** What follows a change of status: the audit record (for automatic changes), the notice, and the creator's standing. */
  private async announce(
    profileId: string,
    userId: string,
    status: KycStatus,
    extra: { reasonCode?: string | null; reviewerId?: string },
  ): Promise<void> {
    if (!extra.reviewerId) {
      await this.audit.record({
        actorType: 'SYSTEM',
        actorLabel: 'kyc-provider',
        action: `kyc.${status.toLowerCase()}`,
        targetType: 'kyc_profile',
        targetId: profileId,
        after: { status, reasonCode: extra.reasonCode ?? null },
      });
    }
    await this.notifications
      .notify({
        userId,
        type: 'KYC_STATUS',
        template: 'kyc_status',
        vars: { status },
        severity: 'INFO',
        category: 'security',
        data: { kycId: profileId, status },
        dedupeKey: `kyc:${profileId}:${status}`,
      })
      .catch(() => undefined);
    // Verified (or no longer verified) changes whether rewards can be paid out.
    await this.creators.refreshOne(userId).catch(() => undefined);
  }

  /** The automatic path: provider answers and expiry. */
  private async setStatus(
    profileId: string,
    status: KycStatus,
    extra: { providerReference?: string; reasonCode?: string | null } = {},
    expectFrom?: KycStatus[],
  ): Promise<void> {
    const userId = await this.transition(this.prisma, profileId, status, extra, expectFrom);
    await this.announce(profileId, userId, status, extra);
  }

  /** Background: cases the provider could not be reached for are tried again. */
  async recheckPending(limit = 50): Promise<number> {
    const cases = await this.prisma.kycProfile.findMany({
      where: { status: 'PENDING', submittedAt: { lt: new Date(Date.now() - 60_000) } },
      take: limit,
      orderBy: { submittedAt: 'asc' },
    });
    for (const p of cases) {
      const legalName = this.cipher.decrypt(p.legalNameEnc, `kyc_profiles.legal_name_enc:${p.id}`);
      const pan = this.cipher.decrypt(p.panEnc as string, `kyc_profiles.pan_enc:${p.id}`);
      await this.askProvider(p.id, { subject: p.subject, legalName, pan });
    }
    return cases.length;
  }

  /** Background: a verification lapses when its time is up. */
  async expireLapsed(): Promise<number> {
    const due = await this.prisma.kycProfile.findMany({
      where: { status: 'VERIFIED', expiresAt: { lte: new Date() } },
      select: { id: true },
      take: 200,
    });
    for (const p of due)
      await this.setStatus(p.id, 'EXPIRED', {}, ['VERIFIED']).catch(() => undefined);
    return due.length;
  }

  /** Background: scans and stored numbers are deleted when their retention ends. */
  async purgeExpiredDocuments(limit = 100): Promise<number> {
    const docs = await this.prisma.kycDocument.findMany({
      where: { deletedAt: null, retentionUntil: { lte: new Date() } },
      take: limit,
    });
    for (const d of docs) {
      for (const assetId of [d.fileAssetId, d.backFileAssetId])
        if (assetId) await this.files.remove(assetId);
      await this.prisma.kycDocument.update({
        where: { id: d.id },
        data: {
          numberEnc: null,
          numberIndex: null,
          fileAssetId: null,
          backFileAssetId: null,
          deletedAt: new Date(),
        },
      });
    }
    return docs.length;
  }

  // ------------------------------------------------------------------- staff --

  async queue(q: {
    status?: KycStatus | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
  }) {
    const limit = clampLimit(q.limit);
    const after = decodeCursor(q.cursor, cursorSchema);
    const rows = await this.prisma.kycProfile.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(after
          ? {
              OR: [
                { submittedAt: { lt: new Date(after.t) } },
                { submittedAt: new Date(after.t), id: { lt: after.id } },
              ],
            }
          : {}),
      },
      include: { _count: { select: { documents: true } } },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.submittedAt.toISOString(), id: r.id }),
      (r) => ({
        id: r.id,
        userId: r.userId,
        subject: r.subject,
        status: r.status,
        legalName: r.legalNameMasked,
        pan: r.panLast4 ? `XXXXXX${r.panLast4}` : null,
        reasonCode: r.reasonCode,
        documents: r._count.documents,
        submittedAt: r.submittedAt.toISOString(),
      }),
    );
  }

  async caseFor(id: string) {
    const p = await this.prisma.kycProfile.findUnique({
      where: { id },
      include: {
        documents: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
        reviews: { include: { admin: { select: { name: true } } }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!p) throw Errors.notFound('KYC case');
    return {
      ...this.view(p),
      userId: p.userId,
      providerReference: p.providerReference,
      documents: p.documents.map((d) => ({
        id: d.id,
        type: d.type,
        role: d.role,
        status: d.status,
        number: d.numberLast4 ? `XXXX${d.numberLast4}` : null,
        rejectionCode: d.rejectionCode,
        hasScan: !!d.fileAssetId,
      })),
      reviews: p.reviews.map((r) => ({
        decision: r.decision,
        reasonCode: r.reasonCode,
        note: r.note,
        by: r.admin.name,
        at: r.createdAt.toISOString(),
      })),
    };
  }

  /** A two-minute link to one scan. Every view is recorded on the sensitive trail. */
  async documentUrl(actor: AdminAuthContext, caseId: string, documentId: string, meta: Meta) {
    const doc = await this.prisma.kycDocument.findFirst({
      where: { id: documentId, kycProfileId: caseId, deletedAt: null },
      select: { id: true, fileAssetId: true, kycProfile: { select: { userId: true } } },
    });
    if (!doc?.fileAssetId) throw Errors.notFound('Document');
    const url = await this.files.viewUrl(doc.fileAssetId);
    await this.audit.record({
      actorType: 'ADMIN',
      actorId: actor.adminId,
      actorLabel: actor.name,
      action: 'kyc.document_viewed',
      targetType: 'kyc_document',
      targetId: doc.id,
      sensitive: true,
      ...meta,
    });
    return { url, expiresInSeconds: 120 };
  }

  /**
   * A person's decision on a case the provider sent for review.
   *
   * Only `UNDER_REVIEW` can be approved, so a case the provider rejected, or never cleared
   * for review, cannot be waved through; rejecting needs a reason code; every decision is
   * recorded twice, as a review row and in the audit trail, in the same transaction as the change.
   */
  async decide(actor: AdminAuthContext, caseId: string, dto: KycDecisionDto, meta: Meta) {
    const p = await this.prisma.kycProfile.findUnique({ where: { id: caseId } });
    if (!p) throw Errors.notFound('KYC case');
    const from: Record<KycDecisionDto['decision'], KycStatus[]> = {
      APPROVE: ['UNDER_REVIEW'],
      REJECT: ['UNDER_REVIEW', 'ACTION_REQUIRED', 'PENDING'],
      REQUEST_INFO: ['UNDER_REVIEW'],
    };
    if (!from[dto.decision].includes(p.status)) {
      throw Errors.conflict(
        dto.decision === 'APPROVE'
          ? 'Only a case the identity provider sent for review can be approved.'
          : `A case that is ${p.status.toLowerCase().replace(/_/g, ' ')} cannot be ${dto.decision.toLowerCase().replace(/_/g, ' ')}ed.`,
      );
    }
    if (dto.decision === 'REJECT' && !dto.reasonCode)
      throw Errors.validation([{ field: 'reasonCode', reasons: ['required'] }]);

    const target: KycStatus =
      dto.decision === 'APPROVE'
        ? 'VERIFIED'
        : dto.decision === 'REJECT'
          ? 'REJECTED'
          : 'ACTION_REQUIRED';
    const reasonCode =
      dto.reasonCode ?? (dto.decision === 'REQUEST_INFO' ? 'MORE_INFORMATION_NEEDED' : null);
    const userId = await this.prisma.$transaction(async (tx) => {
      // The status moves first, only from the expected one: of two reviewers deciding at once, one wins.
      const owner = await this.transition(
        tx,
        caseId,
        target,
        { reasonCode, reviewerId: actor.adminId },
        from[dto.decision],
      );
      await tx.kycReview.create({
        data: {
          kycProfileId: caseId,
          adminId: actor.adminId,
          decision: dto.decision,
          reasonCode: dto.reasonCode ?? null,
          note: dto.note,
        },
      });
      await tx.kycDocument.updateMany({
        where: { kycProfileId: caseId, status: 'RECEIVED' },
        data:
          dto.decision === 'APPROVE'
            ? { status: 'ACCEPTED' }
            : dto.decision === 'REJECT'
              ? { status: 'REJECTED', rejectionCode: dto.reasonCode ?? null }
              : {},
      });
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: `kyc.${dto.decision.toLowerCase()}`,
          targetType: 'kyc_profile',
          targetId: caseId,
          reason: dto.note,
          before: { status: p.status },
          after: { status: target, reasonCode },
          ...meta,
        },
        tx,
      );
      return owner;
    });
    await this.announce(caseId, userId, target, { reasonCode, reviewerId: actor.adminId });
    return this.caseFor(caseId);
  }
}
