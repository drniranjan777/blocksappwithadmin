import { Injectable } from '@nestjs/common';
import { StepUpService } from '../../auth/step-up.service.js';
import { BlindIndex, FieldCipher } from '../../common/crypto/field-cipher.js';
import { Errors } from '../../common/errors/app-error.js';
import { PrismaService } from '../../database/prisma.service.js';
import { normalisePan } from '../identifiers.js';
import { KycService } from '../kyc/kyc.service.js';

/**
 * The PAN that payouts are reported under. BLOCKS collects it for the payout provider and
 * the tax authority's reporting; it does not calculate or deduct tax. It must be the PAN on the
 * person's verified identity, so a payout can never be reported against someone else's PAN.
 */
@Injectable()
export class TaxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
    private readonly blind: BlindIndex,
    private readonly stepUp: StepUpService,
    private readonly kyc: KycService,
  ) {}

  async get(userId: string) {
    const [tax, kyc] = await Promise.all([
      this.prisma.taxProfile.findUnique({ where: { userId } }),
      this.prisma.kycProfile.findFirst({
        where: { userId, status: 'VERIFIED' },
        orderBy: { submittedAt: 'desc' },
        select: { panLast4: true },
      }),
    ]);
    return {
      status: tax?.status ?? 'NOT_PROVIDED',
      pan: tax?.panLast4 ? `XXXXXX${tax.panLast4}` : null,
      // The PAN on the verified identity, so the app can offer to confirm it.
      identityPan: kyc?.panLast4 ? `XXXXXX${kyc.panLast4}` : null,
      verifiedAt: tax?.verifiedAt?.toISOString() ?? null,
      // Statements and certificates come from the payout provider once one is connected.
      statements: [] as unknown[],
    };
  }

  async set(userId: string, rawPan: string, stepUpToken: string | undefined) {
    this.kyc.assertEnabled();
    const identity = await this.prisma.kycProfile.findFirst({
      where: { userId, status: 'VERIFIED' },
      orderBy: { submittedAt: 'desc' },
    });
    if (!identity) throw Errors.conflict('Verify your identity first.', 'VERIFICATION_REQUIRED');
    const pan = normalisePan(rawPan, identity.subject);
    if (!pan) throw Errors.validation([{ field: 'pan', reasons: ['invalid'] }]);
    // Same PAN as the verified identity, checked by the keyed hash so nothing is decrypted to compare.
    if (this.blind.of('pan', pan) !== identity.panIndex) {
      throw Errors.validation([{ field: 'pan', reasons: ['does_not_match_identity'] }]);
    }
    await this.stepUp.consume(userId, 'UPDATE_TAX_INFO', stepUpToken);
    await this.prisma.taxProfile.upsert({
      where: { userId },
      create: {
        userId,
        status: 'VERIFIED',
        panEnc: this.cipher.encrypt(pan, `tax_profiles.pan_enc:${userId}`),
        panLast4: pan.slice(-4),
        panIndex: this.blind.of('pan', pan),
        verifiedAt: new Date(),
      },
      update: {
        status: 'VERIFIED',
        panEnc: this.cipher.encrypt(pan, `tax_profiles.pan_enc:${userId}`),
        panLast4: pan.slice(-4),
        panIndex: this.blind.of('pan', pan),
        verifiedAt: new Date(),
      },
    });
    return this.get(userId);
  }
}
