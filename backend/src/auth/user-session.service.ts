import { Inject, Injectable } from '@nestjs/common';
import { safeEqual } from '../common/crypto/tokens.js';
import { Errors } from '../common/errors/app-error.js';
import { uuidv7 } from '../common/ids.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../database/prisma.service.js';
import type {
  DevicePlatform,
  SessionRevokeReason,
  UserSession,
  UserStatus,
} from '../generated/prisma/client.js';
import { SecurityEventService, deviceLabelOf } from '../security/security-events.service.js';
import { issueRefreshToken, parseRefreshToken } from './refresh-token.js';

export interface DeviceInfo {
  deviceId?: string | undefined;
  deviceName?: string | undefined;
  platform?: DevicePlatform | undefined;
  appVersion?: string | undefined;
}

export interface RequestInfo {
  ip?: string | undefined;
  userAgent?: string | undefined;
  locationLabel?: string | undefined;
}

export interface ActiveSession {
  id: string;
  userId: string;
  userStatus: UserStatus;
  mfaVerified: boolean;
}

/** Most devices one account can be signed in on; the least recently used is signed out first. */
export const MAX_ACTIVE_SESSIONS = 20;
/** However active, a sign-in lasts at most this long: after that the password is needed again. */
export const SESSION_ABSOLUTE_DAYS = 180;
/**
 * A refresh token that was *just* replaced may be presented once more: the app
 * may have lost the response on a flaky network. Beyond this, presenting a
 * replaced token means it was copied, and the session is ended.
 */
export const REUSE_GRACE_MS = 10_000;

const DAY = 86_400_000;

/**
 * Sign-ins ("sessions"), their refresh tokens, and what the auth guard needs to
 * know about them on every request.
 */
@Injectable()
export class UserSessionService {
  /** The guard asks about the same session on every call; a short cache keeps that off the database. */
  private readonly cache = new Map<string, { value: ActiveSession | null; at: number }>();
  private static readonly CACHE_MS = 5_000;
  private static readonly TOUCH_MS = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: SecurityEventService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private expiryFor(createdAt: Date): Date {
    const sliding = Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * DAY;
    const absolute = createdAt.getTime() + SESSION_ABSOLUTE_DAYS * DAY;
    return new Date(Math.min(sliding, absolute));
  }

  async create(input: {
    userId: string;
    device?: DeviceInfo | undefined;
    request?: RequestInfo | undefined;
    mfaVerified: boolean;
    trusted?: boolean;
  }): Promise<{ session: UserSession; refreshToken: string }> {
    const id = uuidv7();
    const { token, hash } = issueRefreshToken(id);
    const now = new Date();

    const session = await this.prisma.userSession.create({
      data: {
        id,
        userId: input.userId,
        refreshTokenHash: hash,
        deviceId: input.device?.deviceId ?? null,
        deviceName: input.device?.deviceName ?? null,
        platform: input.device?.platform ?? 'UNKNOWN',
        appVersion: input.device?.appVersion ?? null,
        ip: input.request?.ip ?? null,
        userAgent: input.request?.userAgent ?? null,
        locationLabel: input.request?.locationLabel ?? null,
        trusted: input.trusted ?? false,
        mfaVerifiedAt: input.mfaVerified ? now : null,
        expiresAt: this.expiryFor(now),
      },
    });

    // Keep the list a person has to review short: retire the least recently used.
    const active = await this.prisma.userSession.findMany({
      where: { userId: input.userId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { lastUsedAt: 'asc' },
      select: { id: true },
    });
    if (active.length > MAX_ACTIVE_SESSIONS) {
      const surplus = active.slice(0, active.length - MAX_ACTIVE_SESSIONS).map((s) => s.id);
      await this.prisma.userSession.updateMany({
        where: { id: { in: surplus }, NOT: { id } },
        data: { revokedAt: now, revokedReason: 'USER_REVOKED' },
      });
      surplus.forEach((sid) => this.cache.delete(sid));
    }
    return { session, refreshToken: token };
  }

  /**
   * Exchanges a refresh token for a new one (rotation). Every successful call
   * replaces the secret, so a stolen token works at most once, and *using it
   * after the real owner has* ends the session.
   */
  async rotate(
    refreshToken: string,
    request: RequestInfo = {},
    retried = false,
  ): Promise<{ session: UserSession; refreshToken: string }> {
    const parsed = parseRefreshToken(refreshToken);
    if (!parsed) throw Errors.unauthenticated();

    const session = await this.prisma.userSession.findUnique({ where: { id: parsed.sessionId } });
    if (!session) throw Errors.unauthenticated();
    if (session.revokedAt) throw Errors.sessionRevoked();
    const now = new Date();
    if (session.expiresAt <= now) throw Errors.tokenExpired();

    const isCurrent = safeEqual(session.refreshTokenHash, parsed.hash);
    const isPrevious =
      !!session.previousTokenHash && safeEqual(session.previousTokenHash, parsed.hash);
    // A made-up secret for a real session id proves nothing and must not end the
    // owner's session (the id is not secret), so it is simply refused.
    if (!isCurrent && !isPrevious) throw Errors.unauthenticated();

    if (isPrevious) {
      const recent =
        session.rotatedAt && now.getTime() - session.rotatedAt.getTime() <= REUSE_GRACE_MS;
      if (!recent) {
        await this.revokeById(session.id, 'REUSE_DETECTED');
        await this.events.record({
          userId: session.userId,
          type: 'REFRESH_TOKEN_REUSE',
          severity: 'CRITICAL',
          sessionId: session.id,
          ip: request.ip,
          deviceLabel: deviceLabelOf({
            deviceName: session.deviceName ?? undefined,
            platform: session.platform,
          }),
          riskScore: 90,
          notify: { template: 'security_token_reuse' },
        });
        throw Errors.sessionRevoked();
      }
    }

    const next = issueRefreshToken(session.id);
    // Compare-and-swap on the hash we read: if another request rotated in the
    // meantime this updates nothing, and we start again from fresh state.
    const swapped = await this.prisma.userSession.updateMany({
      where: { id: session.id, refreshTokenHash: session.refreshTokenHash, revokedAt: null },
      data: {
        previousTokenHash: session.refreshTokenHash,
        refreshTokenHash: next.hash,
        rotatedAt: now,
        lastUsedAt: now,
        expiresAt: this.expiryFor(session.createdAt),
        ...(request.ip ? { ip: request.ip } : {}),
        ...(request.userAgent ? { userAgent: request.userAgent } : {}),
      },
    });
    if (swapped.count === 0) {
      if (retried) throw Errors.unauthenticated();
      return this.rotate(refreshToken, request, true);
    }
    this.cache.delete(session.id);
    return {
      session: await this.prisma.userSession.findUniqueOrThrow({ where: { id: session.id } }),
      refreshToken: next.token,
    };
  }

  /** What the auth guard needs for a request that presented a valid access token. */
  async resolve(sessionId: string): Promise<ActiveSession | null> {
    const cached = this.cache.get(sessionId);
    if (cached && Date.now() - cached.at < UserSessionService.CACHE_MS) return cached.value;

    const s = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        userId: true,
        revokedAt: true,
        expiresAt: true,
        lastUsedAt: true,
        mfaVerifiedAt: true,
        user: { select: { status: true } },
      },
    });
    const now = Date.now();
    const value: ActiveSession | null =
      s && !s.revokedAt && s.expiresAt.getTime() > now
        ? { id: s.id, userId: s.userId, userStatus: s.user.status, mfaVerified: !!s.mfaVerifiedAt }
        : null;
    this.cache.set(sessionId, { value, at: now });
    if (this.cache.size > 10_000) this.cache.clear();

    if (value && s && now - s.lastUsedAt.getTime() > UserSessionService.TOUCH_MS) {
      void this.prisma.userSession
        .update({ where: { id: sessionId }, data: { lastUsedAt: new Date(now) } })
        .catch(() => undefined);
    }
    return value;
  }

  async listForUser(userId: string): Promise<UserSession[]> {
    return this.prisma.userSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      take: MAX_ACTIVE_SESSIONS + 5,
    });
  }

  /** Signs one of the user's own devices out. False when it is not theirs or is already gone. */
  async revoke(userId: string, sessionId: string, reason: SessionRevokeReason): Promise<boolean> {
    const res = await this.prisma.userSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    this.cache.delete(sessionId);
    return res.count === 1;
  }

  private async revokeById(sessionId: string, reason: SessionRevokeReason): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    this.cache.delete(sessionId);
  }

  async revokeOthers(
    userId: string,
    keepSessionId: string,
    reason: SessionRevokeReason,
  ): Promise<number> {
    return this.revokeMany(userId, reason, keepSessionId);
  }

  async revokeAll(userId: string, reason: SessionRevokeReason): Promise<number> {
    return this.revokeMany(userId, reason);
  }

  private async revokeMany(
    userId: string,
    reason: SessionRevokeReason,
    except?: string,
  ): Promise<number> {
    const live = await this.prisma.userSession.findMany({
      where: { userId, revokedAt: null, ...(except ? { NOT: { id: except } } : {}) },
      select: { id: true },
    });
    if (live.length === 0) return 0;
    await this.prisma.userSession.updateMany({
      where: { id: { in: live.map((s) => s.id) }, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    live.forEach((s) => this.cache.delete(s.id));
    return live.length;
  }

  /** Drops the cached view of a session (used when the account's status changes). */
  invalidate(sessionId: string): void {
    this.cache.delete(sessionId);
  }

  /**
   * Drops the cached view of every live session of one person, so a change to their account
   * (restricted, restored) applies to their next request here instead of when the cache expires.
   * Other instances pick it up within the cache window (a few seconds).
   */
  async refreshStatus(userId: string): Promise<void> {
    const live = await this.prisma.userSession.findMany({
      where: { userId, revokedAt: null },
      select: { id: true },
    });
    live.forEach((s) => this.cache.delete(s.id));
  }

  /** Housekeeping: forget sessions that ended long ago. Run by the worker. */
  async purgeExpired(olderThanDays = 90): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * DAY);
    const res = await this.prisma.userSession.deleteMany({
      where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
    });
    return res.count;
  }
}
