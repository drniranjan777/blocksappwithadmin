import { Injectable } from '@nestjs/common';
import { generateSecret, generateURI, verifySync } from 'otplib';
import { FieldCipher } from '../common/crypto/field-cipher.js';
import {
  normalizeBackupCode,
  randomBackupCode,
  safeEqual,
  sha256Hex,
} from '../common/crypto/tokens.js';
import { Errors } from '../common/errors/app-error.js';
import { PrismaService } from '../database/prisma.service.js';
import type { TwoFactorMethod } from '../generated/prisma/client.js';

export const BACKUP_CODE_COUNT = 10;
const ISSUER = 'BLOCKS';
/** Accept a code from the previous or next 30-second step: phones' clocks drift. */
const TOLERANCE_SECONDS = 30;

type Subject = 'user' | 'admin';

/** The conditions `updateIf` understands; valid for both users and staff. */
interface ClaimWhere {
  id: string;
  OR?: Array<{ twoFactorLastStep: null } | { twoFactorLastStep: { lt: number } }>;
  twoFactorBackupHashes?: { has: string };
}

/**
 * Two-factor authentication: authenticator-app codes (TOTP, RFC 6238) and
 * one-time backup codes. Used for both app users and staff.
 *
 *  - The shared secret is encrypted at rest, bound to the account it belongs to.
 *  - A code can be used **once**: the time step of each accepted code is saved
 *    and anything at or before it is refused, which defeats a phisher who
 *    relays a code in real time.
 *  - Backup codes are random, shown once, stored only as hashes, and each works
 *    once.
 *  - Setting up is two steps: the secret is saved as *pending*, and only a
 *    correct code from the authenticator turns two-factor on, so a typo in the
 *    QR code cannot lock someone out.
 */
@Injectable()
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
  ) {}

  private context(subject: Subject, id: string): string {
    return `${subject === 'user' ? 'users' : 'admin_users'}.two_factor_secret_enc:${id}`;
  }

  // -- reading and writing the right table -------------------------------------

  private async load(subject: Subject, id: string) {
    const select = {
      id: true,
      twoFactorEnabled: true,
      twoFactorSecretEnc: true,
      twoFactorBackupHashes: true,
      twoFactorLastStep: true,
      twoFactorMethod: subject === 'user',
    } as const;
    if (subject === 'user') {
      return this.prisma.user.findUnique({ where: { id }, select });
    }
    const admin = await this.prisma.adminUser.findUnique({
      where: { id },
      select: {
        id: true,
        twoFactorEnabled: true,
        twoFactorSecretEnc: true,
        twoFactorBackupHashes: true,
        twoFactorLastStep: true,
      },
    });
    return admin ? { ...admin, twoFactorMethod: null } : null;
  }

  private async save(
    subject: Subject,
    id: string,
    data: {
      twoFactorEnabled?: boolean;
      twoFactorSecretEnc?: string | null;
      twoFactorBackupHashes?: string[];
      twoFactorLastStep?: number | null;
      twoFactorMethod?: TwoFactorMethod | null;
    },
  ): Promise<void> {
    if (subject === 'user') {
      await this.prisma.user.update({ where: { id }, data });
    } else {
      const { twoFactorMethod: _method, ...adminData } = data;
      await this.prisma.adminUser.update({ where: { id }, data: adminData });
    }
  }

  /**
   * Compare-and-set: applies `data` only if `where` still holds, and reports
   * whether it did. This is what makes "use once" safe when two requests race.
   */
  private async updateIf(
    subject: Subject,
    where: ClaimWhere,
    data: { twoFactorLastStep?: number; twoFactorBackupHashes?: string[] },
  ): Promise<boolean> {
    const result =
      subject === 'user'
        ? await this.prisma.user.updateMany({ where, data })
        : await this.prisma.adminUser.updateMany({ where, data });
    return result.count === 1;
  }

  // -- setup ---------------------------------------------------------------------

  /** Generates and stores a pending secret. Returns what the authenticator app needs. */
  async beginTotpSetup(
    subject: Subject,
    id: string,
    accountLabel: string,
  ): Promise<{ secret: string; otpauthUri: string }> {
    const current = await this.load(subject, id);
    if (!current) throw Errors.notFound('Account');
    if (current.twoFactorEnabled) {
      throw Errors.conflict('Two-step verification is already on.', 'CONFLICT');
    }
    const secret = generateSecret();
    await this.save(subject, id, {
      twoFactorSecretEnc: this.cipher.encrypt(secret, this.context(subject, id)),
      twoFactorLastStep: null,
    });
    return {
      secret,
      otpauthUri: generateURI({ issuer: ISSUER, label: accountLabel, secret }),
    };
  }

  /** Confirms the pending secret with a first code, turns two-factor on and returns the backup codes. */
  async confirmTotpSetup(subject: Subject, id: string, code: string): Promise<string[]> {
    const current = await this.load(subject, id);
    if (!current?.twoFactorSecretEnc || current.twoFactorEnabled) {
      throw Errors.precondition('Start two-step verification setup first.');
    }
    if (!(await this.checkTotp(subject, current, code))) throw Errors.otpInvalid(0);
    const codes = this.generateBackupCodes();
    await this.save(subject, id, {
      twoFactorEnabled: true,
      twoFactorMethod: 'TOTP',
      twoFactorBackupHashes: codes.map(hashBackupCode),
    });
    return codes;
  }

  /** Enables an OTP-based method (SMS or e-mail) once its code has been verified elsewhere. */
  async enableOtpMethod(id: string, method: 'SMS' | 'EMAIL'): Promise<string[]> {
    const codes = this.generateBackupCodes();
    await this.save('user', id, {
      twoFactorEnabled: true,
      twoFactorMethod: method,
      twoFactorBackupHashes: codes.map(hashBackupCode),
    });
    return codes;
  }

  async disable(subject: Subject, id: string): Promise<void> {
    await this.save(subject, id, {
      twoFactorEnabled: false,
      twoFactorSecretEnc: null,
      twoFactorBackupHashes: [],
      twoFactorLastStep: null,
      twoFactorMethod: null,
    });
  }

  async regenerateBackupCodes(subject: Subject, id: string): Promise<string[]> {
    const codes = this.generateBackupCodes();
    await this.save(subject, id, { twoFactorBackupHashes: codes.map(hashBackupCode) });
    return codes;
  }

  // -- checking a code at sign-in ---------------------------------------------------

  /** True if `code` is a valid, not-yet-used authenticator code for the account. */
  async verifyTotp(subject: Subject, id: string, code: string): Promise<boolean> {
    const current = await this.load(subject, id);
    if (!current?.twoFactorEnabled || !current.twoFactorSecretEnc) return false;
    return this.checkTotp(subject, current, code);
  }

  private async checkTotp(
    subject: Subject,
    current: { id: string; twoFactorSecretEnc: string | null; twoFactorLastStep: number | null },
    code: string,
  ): Promise<boolean> {
    if (!current.twoFactorSecretEnc || !/^\d{6}$/.test(code)) return false;
    let secret: string;
    try {
      secret = this.cipher.decrypt(current.twoFactorSecretEnc, this.context(subject, current.id));
    } catch {
      return false;
    }
    const result = verifySync({
      strategy: 'totp',
      secret,
      token: code,
      epochTolerance: TOLERANCE_SECONDS,
      ...(current.twoFactorLastStep === null ? {} : { afterTimeStep: current.twoFactorLastStep }),
    });
    // The library's result type covers HOTP too; only a TOTP result carries the step.
    if (!result.valid || !('timeStep' in result)) return false;
    const step = result.timeStep;

    // Record the step so this exact code cannot be used again. Compare-and-set:
    // if two requests present the same code at once, only one gets through.
    return this.updateIf(
      subject,
      { id: current.id, OR: [{ twoFactorLastStep: null }, { twoFactorLastStep: { lt: step } }] },
      { twoFactorLastStep: step },
    );
  }

  /** Uses up a backup code. True if it was valid. */
  async consumeBackupCode(subject: Subject, id: string, code: string): Promise<boolean> {
    const current = await this.load(subject, id);
    if (!current?.twoFactorEnabled) return false;
    const hash = hashBackupCode(normalizeBackupCode(code));
    const match = current.twoFactorBackupHashes.find((h) => safeEqual(h, hash));
    if (!match) return false;
    // Remove it with a conditional write so the same code cannot be spent twice.
    const remaining = current.twoFactorBackupHashes.filter((h) => h !== match);
    return this.updateIf(
      subject,
      { id, twoFactorBackupHashes: { has: match } },
      { twoFactorBackupHashes: remaining },
    );
  }

  async backupCodesLeft(subject: Subject, id: string): Promise<number> {
    return (await this.load(subject, id))?.twoFactorBackupHashes.length ?? 0;
  }

  private generateBackupCodes(): string[] {
    return Array.from({ length: BACKUP_CODE_COUNT }, () => randomBackupCode());
  }
}

/** Backup codes are hashed after normalising, so `abcd-efgh-jk` and `ABCDEFGHJK` match. */
export function hashBackupCode(code: string): string {
  return sha256Hex(normalizeBackupCode(code));
}
