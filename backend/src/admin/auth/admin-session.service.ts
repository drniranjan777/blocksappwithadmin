import { Inject, Injectable } from '@nestjs/common';
import { issueRefreshToken, parseRefreshToken } from '../../auth/refresh-token.js';
import { safeEqual } from '../../common/crypto/tokens.js';
import { Errors } from '../../common/errors/app-error.js';
import { uuidv7 } from '../../common/ids.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  AdminSession,
  AdminStatus,
  SessionRevokeReason,
} from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';

/** The same forgiveness for a lost response as app users get (see UserSessionService). */
export const ADMIN_REUSE_GRACE_MS = 10_000;

const MINUTE = 60_000;
const HOUR = 3_600_000;

export interface ResolvedAdminSession {
  id: string;
  adminId: string;
  mfaVerified: boolean;
  admin: {
    email: string;
    name: string;
    status: AdminStatus;
    mustChangePassword: boolean;
    twoFactorEnabled: boolean;
  };
}

export interface RequestMeta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

/**
 * Staff sign-ins. Stricter than app-user sessions in three ways:
 *
 *   - **idle timeout**: no activity for `ADMIN_SESSION_IDLE_MINUTES` signs the
 *     person out, however long the token would otherwise last;
 *   - **hard limit**: `ADMIN_SESSION_MAX_HOURS` after sign-in, whatever the
 *     activity, the password and a second factor are needed again;
 *   - **no caching**: the guard reads the session and the account from the
 *     database on every request, so disabling a person or revoking a session
 *     is effective on their very next click, not after a cache expires.
 */
@Injectable()
export class AdminSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private idleDeadline(from: Date, hardLimit: Date): Date {
    return new Date(
      Math.min(from.getTime() + this.env.ADMIN_SESSION_IDLE_MINUTES * MINUTE, hardLimit.getTime()),
    );
  }

  async create(
    adminId: string,
    meta: RequestMeta,
  ): Promise<{ session: AdminSession; refreshToken: string }> {
    const id = uuidv7();
    const { token, hash } = issueRefreshToken(id);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.env.ADMIN_SESSION_MAX_HOURS * HOUR);
    const session = await this.prisma.adminSession.create({
      data: {
        id,
        adminId,
        refreshTokenHash: hash,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
        idleExpiresAt: this.idleDeadline(now, expiresAt),
        expiresAt,
      },
    });
    return { session, refreshToken: token };
  }

  /** What the guard needs, or `null` when the session is gone, ended or timed out. */
  async resolve(sessionId: string): Promise<ResolvedAdminSession | null> {
    const s = await this.prisma.adminSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        adminId: true,
        mfaVerifiedAt: true,
        revokedAt: true,
        idleExpiresAt: true,
        expiresAt: true,
        lastUsedAt: true,
        admin: {
          select: {
            email: true,
            name: true,
            status: true,
            mustChangePassword: true,
            twoFactorEnabled: true,
          },
        },
      },
    });
    if (!s || s.revokedAt) return null;
    const now = Date.now();
    if (s.idleExpiresAt.getTime() <= now || s.expiresAt.getTime() <= now) return null;

    // Activity keeps the idle clock moving. Written at most twice a minute so a
    // busy dashboard does not turn every request into a write.
    if (now - s.lastUsedAt.getTime() > 30_000) {
      const at = new Date(now);
      await this.prisma.adminSession.updateMany({
        where: { id: s.id, revokedAt: null },
        data: { lastUsedAt: at, idleExpiresAt: this.idleDeadline(at, s.expiresAt) },
      });
    }
    return { id: s.id, adminId: s.adminId, mfaVerified: !!s.mfaVerifiedAt, admin: s.admin };
  }

  /** Why a session is no longer usable, for the right error: timed out vs. signed out. */
  async whyUnusable(sessionId: string): Promise<'expired' | 'revoked'> {
    const s = await this.prisma.adminSession.findUnique({
      where: { id: sessionId },
      select: { revokedAt: true, idleExpiresAt: true, expiresAt: true },
    });
    if (!s || s.revokedAt) return 'revoked';
    return 'expired';
  }

  async markMfaVerified(sessionId: string): Promise<void> {
    await this.prisma.adminSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { mfaVerifiedAt: new Date() },
    });
  }

  /**
   * Exchanges a refresh token for a new one (rotation), refusing a session that
   * has timed out. A replaced token shown again after the grace period means it
   * was copied: the session ends and the audit log records it.
   */
  async rotate(
    refreshToken: string,
    meta: RequestMeta,
    retried = false,
  ): Promise<{ session: AdminSession; refreshToken: string }> {
    const parsed = parseRefreshToken(refreshToken);
    if (!parsed) throw Errors.unauthenticated();
    const session = await this.prisma.adminSession.findUnique({ where: { id: parsed.sessionId } });
    if (!session) throw Errors.unauthenticated();
    if (session.revokedAt) throw Errors.sessionRevoked();
    const now = new Date();
    if (session.idleExpiresAt <= now || session.expiresAt <= now) throw Errors.sessionExpired();

    const isCurrent = safeEqual(session.refreshTokenHash, parsed.hash);
    const isPrevious =
      !!session.previousTokenHash && safeEqual(session.previousTokenHash, parsed.hash);
    if (!isCurrent && !isPrevious) throw Errors.unauthenticated();

    if (isPrevious) {
      const recent =
        session.rotatedAt && now.getTime() - session.rotatedAt.getTime() <= ADMIN_REUSE_GRACE_MS;
      if (!recent) {
        await this.revokeById(session.id, 'REUSE_DETECTED');
        await this.audit.record({
          actorType: 'SYSTEM',
          action: 'admin.session.reuse_detected',
          targetType: 'admin',
          targetId: session.adminId,
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
        throw Errors.sessionRevoked();
      }
    }

    const next = issueRefreshToken(session.id);
    const swapped = await this.prisma.adminSession.updateMany({
      where: { id: session.id, refreshTokenHash: session.refreshTokenHash, revokedAt: null },
      data: {
        previousTokenHash: session.refreshTokenHash,
        refreshTokenHash: next.hash,
        rotatedAt: now,
        lastUsedAt: now,
        idleExpiresAt: this.idleDeadline(now, session.expiresAt),
        ...(meta.ip ? { ip: meta.ip } : {}),
        ...(meta.userAgent ? { userAgent: meta.userAgent } : {}),
      },
    });
    if (swapped.count === 0) {
      if (retried) throw Errors.unauthenticated();
      return this.rotate(refreshToken, meta, true);
    }
    return {
      session: await this.prisma.adminSession.findUniqueOrThrow({ where: { id: session.id } }),
      refreshToken: next.token,
    };
  }

  /**
   * A new refresh token for a session whose holder was just verified (after the
   * second factor): the one issued at password time is replaced. The old one
   * keeps working for the usual short grace, then is treated as copied.
   */
  async reissue(sessionId: string): Promise<string> {
    const session = await this.prisma.adminSession.findUniqueOrThrow({ where: { id: sessionId } });
    const next = issueRefreshToken(session.id);
    await this.prisma.adminSession.update({
      where: { id: session.id },
      data: {
        previousTokenHash: session.refreshTokenHash,
        refreshTokenHash: next.hash,
        rotatedAt: new Date(),
      },
    });
    return next.token;
  }

  async revoke(adminId: string, sessionId: string, reason: SessionRevokeReason): Promise<boolean> {
    const res = await this.prisma.adminSession.updateMany({
      where: { id: sessionId, adminId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return res.count === 1;
  }

  private async revokeById(sessionId: string, reason: SessionRevokeReason): Promise<void> {
    await this.prisma.adminSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /** Signs a staff member out everywhere, optionally keeping one session. Returns how many ended. */
  async revokeAll(
    adminId: string,
    reason: SessionRevokeReason,
    exceptSessionId?: string,
  ): Promise<number> {
    const res = await this.prisma.adminSession.updateMany({
      where: {
        adminId,
        revokedAt: null,
        ...(exceptSessionId ? { NOT: { id: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return res.count;
  }

  async listActive(adminId: string): Promise<AdminSession[]> {
    const now = new Date();
    return this.prisma.adminSession.findMany({
      where: {
        adminId,
        revokedAt: null,
        idleExpiresAt: { gt: now },
        expiresAt: { gt: now },
      },
      orderBy: { lastUsedAt: 'desc' },
      take: 50,
    });
  }

  /** Housekeeping: forget sessions that ended long ago. */
  async purgeExpired(olderThanDays = 90): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
    const res = await this.prisma.adminSession.deleteMany({
      where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
    });
    return res.count;
  }
}
