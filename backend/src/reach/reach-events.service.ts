import { createHmac } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { hmacHex } from '../common/crypto/tokens.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma, ReachEventType } from '../generated/prisma/client.js';
import { postVisibleTo, reelVisibleTo } from '../social/shared/visibility.js';
import { ReachConfigService } from './reach-config.service.js';
import type { ReachConfig } from './reach-config.js';
import {
  fraudScore,
  isExcluded,
  isMeaningfulComment,
  viewQualifies,
  watchRatio,
} from './reach-events.rules.js';

export type ContentKind = 'post' | 'reel';

export interface IncomingEvent {
  kind: ContentKind;
  id: string;
  type: 'IMPRESSION' | 'WATCH';
  /** How long it was on screen, as the phone measured it. */
  watchMs: number;
  /** The phone's own id for this viewing session, so a retried request is not counted twice. */
  eventId: string;
}

interface ViewerFacts {
  accountAgeHours: number;
  verified: boolean;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  active: boolean;
  country: string | null;
  state: string | null;
  district: string | null;
}

const MINUTE = 60_000;
const DAY = 24 * 3_600_000;
/** The most a post can be "watched" for in one report, whatever the phone says. */
const MAX_POST_DWELL_MS = 10 * MINUTE;

/**
 * Recording what happened to a post or reel, as evidence for the Reach Engine.
 *
 * Two kinds of input arrive here:
 *   - **views**, reported by the app (`ingest`): "this was on screen for 4.2 seconds";
 *   - **actions**, noticed by the server itself when someone likes, saves, shares or
 *     comments (`recordEngagement`).
 *
 * Either way the server decides what it means. It works out the viewer's place from their own
 * profile, whether the view qualified, and how fake it looks; the phone can supply none of
 * those. Each event is written once (a unique key per viewer, content and kind of event, so a
 * retry, a replay or a script that repeats itself adds nothing), and events that look
 * fabricated are kept as evidence but set aside from every count.
 */
@Injectable()
export class ReachEventsService {
  private readonly logger = new Logger('ReachEvents');
  private readonly deviceKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ReachConfigService,
    @Inject(ENV) env: Env,
  ) {
    this.deviceKey = hmacHex(env.JWT_SECRET, 'blocks:reach:device');
  }

  /** Devices are never stored: only a keyed hash that lets one device be recognised against itself. */
  hashDevice(deviceId: string): string {
    return createHmac('sha256', this.deviceKey).update(deviceId).digest('hex');
  }

  // ------------------------------------------------------------------ viewer --

  private async viewerFacts(viewerId: string): Promise<ViewerFacts | null> {
    const u = await this.prisma.user.findUnique({
      where: { id: viewerId },
      select: {
        status: true,
        createdAt: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        riskLevel: true,
        profile: { select: { country: true, state: true, district: true } },
      },
    });
    if (!u) return null;
    return {
      accountAgeHours: (Date.now() - u.createdAt.getTime()) / 3_600_000,
      verified: !!(u.emailVerifiedAt ?? u.phoneVerifiedAt),
      risk: u.riskLevel,
      active: u.status === 'ACTIVE',
      country: u.profile?.country ?? null,
      state: u.profile?.state ?? null,
      district: u.profile?.district ?? null,
    };
  }

  private async deviceOf(viewerId: string, sessionId?: string): Promise<string | null> {
    const session = sessionId
      ? await this.prisma.userSession.findUnique({
          where: { id: sessionId },
          select: { deviceId: true },
        })
      : await this.prisma.userSession.findFirst({
          where: { userId: viewerId, deviceId: { not: null }, revokedAt: null },
          orderBy: { lastUsedAt: 'desc' },
          select: { deviceId: true },
        });
    return session?.deviceId ? this.hashDevice(session.deviceId) : null;
  }

  /** Devices the author has signed in from, as hashes. Engaging from one of them is engaging with yourself. */
  private async authorDevices(authorIds: string[]): Promise<Map<string, Set<string>>> {
    const out = new Map<string, Set<string>>();
    if (authorIds.length === 0) return out;
    const sessions = await this.prisma.userSession.findMany({
      where: { userId: { in: authorIds }, deviceId: { not: null } },
      select: { userId: true, deviceId: true },
      orderBy: { lastUsedAt: 'desc' },
      take: 200,
    });
    for (const s of sessions) {
      const set = out.get(s.userId) ?? new Set<string>();
      set.add(this.hashDevice(s.deviceId as string));
      out.set(s.userId, set);
    }
    return out;
  }

  // ------------------------------------------------------------------- views --

  /**
   * Takes a batch of view reports from the app. Anything the viewer could not see, their own
   * content, and anything malformed is silently dropped; the reply says only how many reports
   * were read, so it cannot be used to probe what counts.
   */
  async ingest(viewerId: string, sessionId: string, events: IncomingEvent[]): Promise<number> {
    const [cfg, viewer, deviceHash] = await Promise.all([
      this.config.active(),
      this.viewerFacts(viewerId),
      this.deviceOf(viewerId, sessionId),
    ]);
    if (!viewer?.active || events.length === 0) return 0;
    const config = cfg.config;

    const reelIds = [...new Set(events.filter((e) => e.kind === 'reel').map((e) => e.id))];
    const postIds = [...new Set(events.filter((e) => e.kind === 'post').map((e) => e.id))];
    const [reels, posts] = await Promise.all([
      reelIds.length
        ? this.prisma.reel.findMany({
            where: {
              AND: [
                { id: { in: reelIds } },
                reelVisibleTo(viewerId),
                { publishStatus: 'PUBLISHED' },
              ],
            },
            select: { id: true, authorId: true, durationMs: true, country: true },
          })
        : [],
      postIds.length
        ? this.prisma.post.findMany({
            where: { AND: [{ id: { in: postIds } }, postVisibleTo(viewerId)] },
            select: { id: true, authorId: true, country: true },
          })
        : [],
    ]);
    const content = new Map<string, { authorId: string; durationMs: number; country: string }>([
      ...reels.map(
        (r) =>
          [
            `reel:${r.id}`,
            { authorId: r.authorId, durationMs: r.durationMs, country: r.country },
          ] as const,
      ),
      ...posts.map(
        (p) =>
          [`post:${p.id}`, { authorId: p.authorId, durationMs: 0, country: p.country }] as const,
      ),
    ]);

    const authors = await this.authorDevices([
      ...new Set([...content.values()].map((c) => c.authorId)),
    ]);
    const now = Date.now();
    const [viewerRecent, deviceRecent, sharedDevice] = await Promise.all([
      this.prisma.reachEvent.count({
        where: { viewerId, createdAt: { gt: new Date(now - MINUTE) } },
      }),
      deviceHash
        ? this.prisma.reachEvent.count({
            where: { deviceHash, createdAt: { gt: new Date(now - MINUTE) } },
          })
        : 0,
      this.accountsOnDevice(deviceHash, reelIds, postIds, new Date(now - DAY)),
    ]);

    const rows: Prisma.ReachEventCreateManyInput[] = [];
    const day = new Date(now).toISOString().slice(0, 10);
    let read = 0;
    for (const [index, e] of events.entries()) {
      const target = content.get(`${e.kind}:${e.id}`);
      if (!target || target.authorId === viewerId) continue;
      read++;

      const isReel = e.kind === 'reel';
      const loopCap = isReel ? target.durationMs * config.fraud.maxWatchLoops : MAX_POST_DWELL_MS;
      const reported = Math.max(0, Math.round(e.watchMs));
      const implausible = e.type === 'WATCH' && reported > loopCap * 1.25;
      const watchMs = Math.min(reported, Math.round(loopCap));

      const accounts = sharedDevice.get(`${e.kind}:${e.id}`) ?? new Set<string>();
      const fraud = fraudScore(config, {
        eventsByViewerLastMinute: viewerRecent + index + 1,
        eventsByDeviceLastMinute: deviceRecent + index + 1,
        viewersOnDeviceForContentToday: new Set([...accounts, viewerId]).size,
        sameDeviceAsAuthor: !!deviceHash && !!authors.get(target.authorId)?.has(deviceHash),
        viewerRisk: viewer.risk,
        implausibleWatch: implausible,
      });
      const excluded = isExcluded(config, fraud.score);
      const common = {
        ...(isReel ? { reelId: e.id } : { postId: e.id }),
        viewerId,
        deviceHash,
        viewerCountry: viewer.country,
        viewerState: viewer.state,
        viewerDistrict: viewer.district,
        fraudScore: fraud.score,
        excluded,
      };
      const key = `${viewerId}:${e.kind}:${e.id}`;

      if (e.type === 'IMPRESSION') {
        rows.push({ ...common, type: 'IMPRESSION', dedupeKey: `imp:${key}:${day}` });
        continue;
      }
      rows.push({ ...common, type: 'WATCH', watchMs, dedupeKey: `watch:${key}:${e.eventId}` });
      // Kept as evidence above, but never turned into a qualified view: a report of far more time
      // than the content has is not to be believed, even if nothing else about it looked wrong.
      if (excluded || implausible) continue;
      const qualifies = viewQualifies(config, {
        kind: e.kind,
        watchMs,
        durationMs: target.durationMs,
        viewerAccountAgeHours: viewer.accountAgeHours,
        viewerVerified: viewer.verified,
      });
      if (!qualifies) continue;
      rows.push({ ...common, type: 'QUALIFIED_VIEW', watchMs, dedupeKey: `qv:${key}` });
      if (
        isReel &&
        watchRatio(watchMs, target.durationMs, config.fraud.maxWatchLoops) >=
          config.qualification.completeRatio
      ) {
        rows.push({ ...common, type: 'COMPLETE', watchMs, dedupeKey: `done:${key}` });
      }
    }
    if (rows.length > 0)
      await this.prisma.reachEvent.createMany({ data: rows, skipDuplicates: true });
    return read;
  }

  /** For each piece of content, the accounts that have used this device on it in the last day. */
  private async accountsOnDevice(
    deviceHash: string | null,
    reelIds: string[],
    postIds: string[],
    since: Date,
  ): Promise<Map<string, Set<string>>> {
    const out = new Map<string, Set<string>>();
    if (!deviceHash || reelIds.length + postIds.length === 0) return out;
    const rows = await this.prisma.reachEvent.findMany({
      where: {
        deviceHash,
        createdAt: { gt: since },
        OR: [
          ...(reelIds.length ? [{ reelId: { in: reelIds } }] : []),
          ...(postIds.length ? [{ postId: { in: postIds } }] : []),
        ],
      },
      select: { viewerId: true, reelId: true, postId: true },
      distinct: ['viewerId', 'reelId', 'postId'],
      take: 2000,
    });
    for (const r of rows) {
      if (!r.viewerId) continue;
      const key = r.reelId ? `reel:${r.reelId}` : `post:${r.postId}`;
      const set = out.get(key) ?? new Set<string>();
      set.add(r.viewerId);
      out.set(key, set);
    }
    return out;
  }

  // ----------------------------------------------------------------- actions --

  /**
   * Notes that someone liked, saved, shared or (meaningfully) commented. Called by the
   * server's own handlers after the action succeeded, so it cannot be forged by a client. It
   * never throws: counting is secondary to the action itself.
   */
  async recordEngagement(input: {
    viewerId: string;
    kind: ContentKind;
    id: string;
    type: Extract<ReachEventType, 'LIKE' | 'SAVE' | 'SHARE' | 'COMMENT'>;
    text?: string;
  }): Promise<void> {
    try {
      const { viewerId, kind, id, type } = input;
      const [cfg, viewer, deviceHash] = await Promise.all([
        this.config.active(),
        this.viewerFacts(viewerId),
        this.deviceOf(viewerId),
      ]);
      const config: ReachConfig = cfg.config;
      if (!viewer?.active) return;
      if (type === 'COMMENT' && !isMeaningfulComment(config, input.text ?? '')) return;
      // Engagement from a brand-new or unverified account does not count, as with views.
      if (viewer.accountAgeHours < config.qualification.minViewerAccountAgeHours) return;
      if (config.qualification.requireVerifiedViewer && !viewer.verified) return;

      const target =
        kind === 'reel'
          ? await this.prisma.reel.findUnique({ where: { id }, select: { authorId: true } })
          : await this.prisma.post.findUnique({ where: { id }, select: { authorId: true } });
      if (!target || target.authorId === viewerId) return;

      const authors = await this.authorDevices([target.authorId]);
      const since = new Date(Date.now() - MINUTE);
      const [viewerRecent, deviceRecent] = await Promise.all([
        this.prisma.reachEvent.count({ where: { viewerId, createdAt: { gt: since } } }),
        deviceHash
          ? this.prisma.reachEvent.count({ where: { deviceHash, createdAt: { gt: since } } })
          : 0,
      ]);
      const fraud = fraudScore(config, {
        eventsByViewerLastMinute: viewerRecent + 1,
        eventsByDeviceLastMinute: deviceRecent + 1,
        viewersOnDeviceForContentToday: 1,
        sameDeviceAsAuthor: !!deviceHash && !!authors.get(target.authorId)?.has(deviceHash),
        viewerRisk: viewer.risk,
        implausibleWatch: false,
      });
      await this.prisma.reachEvent.createMany({
        data: [
          {
            ...(kind === 'reel' ? { reelId: id } : { postId: id }),
            viewerId,
            deviceHash,
            type,
            viewerCountry: viewer.country,
            viewerState: viewer.state,
            viewerDistrict: viewer.district,
            // One of each kind per viewer per content, for good: liking and un-liking over and
            // over cannot add anything.
            dedupeKey: `${type.toLowerCase()}:${viewerId}:${kind}:${id}`,
            fraudScore: fraud.score,
            excluded: isExcluded(config, fraud.score),
          },
        ],
        skipDuplicates: true,
      });
    } catch (error) {
      this.logger.warn(`could not record ${input.type}: ${(error as Error).message}`);
    }
  }
}
