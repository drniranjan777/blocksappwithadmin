import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../admin/audit/audit.service.js';
import { Errors } from '../common/errors/app-error.js';
import type { AdminAuthContext } from '../common/http/request.js';
import { Page, clampLimit, decodeCursor } from '../common/pagination/cursor.js';
import { SystemSettingsService } from '../common/settings/system-settings.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma, RewardCycle } from '../generated/prisma/client.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { type Paise, formatRupees, fromDatabase, parseRupees } from '../ledger/money.js';
import type { LevelKey, ReachConfig } from '../reach/reach-config.js';
import { ReachConfigService } from '../reach/reach-config.service.js';
import { CreatorProfileService } from './creator-profile.service.js';
import { type ContentContribution, creatorWeights, distributePool } from './earnings-calc.js';

const cursorSchema = z.object({ t: z.string(), id: z.string() });

interface Meta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

/** The most one cycle's pool can be, and the most one manual adjustment can move, unless staff change the setting. */
export const MAX_POOL = parseRupees('10000000.00');
export const MAX_ADJUSTMENT_SETTING = 'earnings.max_adjustment';
export const DEFAULT_MAX_ADJUSTMENT = parseRupees('10000.00');
const MAX_CYCLE_DAYS = 92;

const asKey = (level: string): LevelKey => level.toLowerCase() as LevelKey;

/** An amount read from the database, always shown with two decimals ("600.00", never "600"). */
const money = (value: { toString(): string } | null | undefined): string =>
  formatRupees(fromDatabase(value));

/**
 * Reward cycles, estimates, and the release of earnings into the ledger.
 *
 *   OPEN        accruing. Every few minutes each creator's *estimate* is refreshed from what they
 *               have earned a claim to so far. An estimate is not money and is never promised.
 *   CLOSED      the cycle has ended and staff have frozen the shares: each creator's amount is
 *               fixed, awaiting release.
 *   FINALIZED   a second person has released the cycle: each amount is credited to the creator's
 *               ledger account in one journal, once, and can then be paid out (separately,
 *               after verification).
 *
 * The pool is shared by qualified performance, not by a rate per view, so what a view is worth
 * depends on everyone else's. A creator is paid at most once per cycle (one earning row per
 * creator and cycle, one journal per earning, a unique key per journal); releasing the same
 * cycle twice, or after a crash half way, cannot pay anyone twice.
 */
@Injectable()
export class EarningsService {
  private readonly logger = new Logger('Earnings');

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly configs: ReachConfigService,
    private readonly creators: CreatorProfileService,
    private readonly audit: AuditService,
    private readonly settings: SystemSettingsService,
  ) {}

  // ------------------------------------------------------------------ cycles --

  private view(c: RewardCycle & { configVersion?: { version: number } | null }) {
    const summary = c.summary as Record<string, unknown> | null;
    return {
      id: c.id,
      label: c.label,
      status: c.status,
      startsAt: c.startsAt.toISOString(),
      endsAt: c.endsAt.toISOString(),
      poolAmount: money(c.poolAmount),
      configVersion: c.configVersion?.version ?? null,
      finalizedAt: c.finalizedAt?.toISOString() ?? null,
      summary: summary ?? null,
    };
  }

  async listCycles(q: { cursor?: string | undefined; limit?: number | undefined }) {
    const limit = clampLimit(q.limit);
    const after = decodeCursor(q.cursor, cursorSchema);
    const rows = await this.prisma.rewardCycle.findMany({
      where: after
        ? {
            OR: [
              { startsAt: { lt: new Date(after.t) } },
              { startsAt: new Date(after.t), id: { lt: after.id } },
            ],
          }
        : {},
      include: { configVersion: { select: { version: true } } },
      orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.startsAt.toISOString(), id: r.id }),
      (r) => this.view(r),
    );
  }

  async getCycle(id: string) {
    const c = await this.prisma.rewardCycle.findUnique({
      where: { id },
      include: { configVersion: { select: { version: true } } },
    });
    if (!c) throw Errors.notFound('Reward cycle');
    const top = await this.prisma.creatorEarning.findMany({
      where: { cycleId: id },
      orderBy: [{ estimatedAmount: 'desc' }, { id: 'asc' }],
      take: 20,
      select: {
        creatorId: true,
        status: true,
        estimatedAmount: true,
        finalizedAmount: true,
        qualifiedReach: true,
        reachLevel: true,
      },
    });
    return {
      ...this.view(c),
      top: top.map((e) => ({
        creatorId: e.creatorId,
        status: e.status,
        estimatedAmount: money(e.estimatedAmount),
        finalizedAmount: e.finalizedAmount ? money(e.finalizedAmount) : null,
        qualifiedReach: e.qualifiedReach,
        level: e.reachLevel,
      })),
    };
  }

  async createCycle(
    actor: AdminAuthContext,
    input: { label: string; startsAt: Date; endsAt: Date; poolAmount: string },
    meta: Meta,
  ) {
    const pool = this.parsePool(input.poolAmount);
    this.assertWindow(input.startsAt, input.endsAt);
    const active = await this.configs.active();
    return this.prisma.$transaction(async (tx) => {
      await this.assertNoOverlap(tx, input.startsAt, input.endsAt);
      const label = input.label.trim();
      if (await tx.rewardCycle.findUnique({ where: { label } })) {
        throw Errors.conflict('A reward cycle with that label already exists.');
      }
      const c = await tx.rewardCycle.create({
        data: {
          label,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          poolAmount: formatRupees(pool),
          // The rules are fixed when the cycle is made, so changing them later cannot change a cycle in flight.
          configVersionId: active.id,
        },
        include: { configVersion: { select: { version: true } } },
      });
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'earnings.cycle_created',
          targetType: 'reward_cycle',
          targetId: c.id,
          after: {
            label,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            poolAmount: formatRupees(pool),
            configVersion: active.version,
          },
          ...meta,
        },
        tx,
      );
      return this.view(c);
    });
  }

  async updateCycle(
    actor: AdminAuthContext,
    id: string,
    input: {
      startsAt?: Date | undefined;
      endsAt?: Date | undefined;
      poolAmount?: string | undefined;
    },
    meta: Meta,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.rewardCycle.findUnique({ where: { id } });
      if (!before) throw Errors.notFound('Reward cycle');
      if (before.status !== 'OPEN') throw Errors.conflict('Only an open cycle can be changed.');
      const startsAt = input.startsAt ?? before.startsAt;
      const endsAt = input.endsAt ?? before.endsAt;
      this.assertWindow(startsAt, endsAt);
      await this.assertNoOverlap(tx, startsAt, endsAt, id);
      const pool = input.poolAmount === undefined ? undefined : this.parsePool(input.poolAmount);
      const c = await tx.rewardCycle.update({
        where: { id },
        data: {
          startsAt,
          endsAt,
          ...(pool === undefined ? {} : { poolAmount: formatRupees(pool) }),
        },
        include: { configVersion: { select: { version: true } } },
      });
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'earnings.cycle_updated',
          targetType: 'reward_cycle',
          targetId: id,
          before: {
            startsAt: before.startsAt,
            endsAt: before.endsAt,
            poolAmount: money(before.poolAmount),
          },
          after: { startsAt, endsAt, poolAmount: money(c.poolAmount) },
          ...meta,
        },
        tx,
      );
      return this.view(c);
    });
  }

  private parsePool(text: string): Paise {
    let pool: Paise;
    try {
      pool = parseRupees(text);
    } catch {
      throw Errors.validation([{ field: 'poolAmount', reasons: ['invalid_amount'] }]);
    }
    if (pool < 0n || pool > MAX_POOL)
      throw Errors.validation([{ field: 'poolAmount', reasons: ['out_of_range'] }]);
    return pool;
  }

  private assertWindow(startsAt: Date, endsAt: Date): void {
    if (!(endsAt > startsAt))
      throw Errors.validation([{ field: 'endsAt', reasons: ['before_start'] }]);
    if (endsAt.getTime() - startsAt.getTime() > MAX_CYCLE_DAYS * 86_400_000) {
      throw Errors.validation([{ field: 'endsAt', reasons: ['too_long'] }]);
    }
  }

  private async assertNoOverlap(
    tx: Prisma.TransactionClient,
    startsAt: Date,
    endsAt: Date,
    exceptId?: string,
  ) {
    const clash = await tx.rewardCycle.findFirst({
      where: {
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { label: true },
    });
    if (clash) throw Errors.conflict(`These dates overlap the cycle "${clash.label}".`);
  }

  // --------------------------------------------------------------- the shares --

  /** What each piece of content earned inside the window: qualified views, its rung and its score. */
  private async contributions(from: Date, to: Date): Promise<ContentContribution[]> {
    const rows = await this.prisma.$queryRaw<
      { creator_id: string; reach_level: string; score: number; qv: bigint }[]
    >`
      SELECT creator_id, reach_level, score, qv FROM (
        SELECT r.author_id AS creator_id, r.reach_level::text AS reach_level,
               COALESCE((SELECT s.score FROM reach_scores s WHERE s.reel_id = r.id ORDER BY s.computed_at DESC LIMIT 1), 0)::float8 AS score,
               count(*) AS qv
          FROM reach_events e JOIN reels r ON r.id = e.reel_id
         WHERE e.type = 'QUALIFIED_VIEW' AND NOT e.excluded AND e.created_at >= ${from} AND e.created_at < ${to}
           AND r.deleted_at IS NULL AND r.publish_status = 'PUBLISHED' AND r.moderation_status = 'APPROVED'
         GROUP BY r.id
        UNION ALL
        SELECT p.author_id, p.reach_level::text,
               COALESCE((SELECT s.score FROM reach_scores s WHERE s.post_id = p.id ORDER BY s.computed_at DESC LIMIT 1), 0)::float8,
               count(*)
          FROM reach_events e JOIN posts p ON p.id = e.post_id
         WHERE e.type = 'QUALIFIED_VIEW' AND NOT e.excluded AND e.created_at >= ${from} AND e.created_at < ${to}
           AND p.deleted_at IS NULL AND p.moderation_status = 'APPROVED'
         GROUP BY p.id
      ) t`;
    return rows.map((r) => ({
      creatorId: r.creator_id,
      level: asKey(r.reach_level),
      score: Number(r.score),
      qualifiedViews: Number(r.qv),
    }));
  }

  /** Creators who may be paid right now: eligible (or active), not suspended, account in good standing. */
  private async eligibleAmong(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.prisma.creatorProfile.findMany({
      where: {
        userId: { in: ids },
        monetizationStatus: { in: ['ELIGIBLE', 'ACTIVE'] },
        user: { status: 'ACTIVE' },
      },
      select: { userId: true },
    });
    return new Set(rows.map((r) => r.userId));
  }

  private async cycleConfig(cycle: RewardCycle): Promise<{ version: number; config: ReachConfig }> {
    const stored = cycle.configVersionId ? await this.configs.byId(cycle.configVersionId) : null;
    if (stored) return { version: stored.version, config: stored.config };
    const active = await this.configs.active();
    return { version: active.version, config: active.config };
  }

  /** Works out each eligible creator's amount for a cycle, from the events so far (or the whole cycle once ended). */
  private async compute(cycle: RewardCycle, now = new Date()) {
    const { version, config } = await this.cycleConfig(cycle);
    const to = now < cycle.endsAt ? now : cycle.endsAt;
    const all = await this.contributions(cycle.startsAt, to);
    const eligible = await this.eligibleAmong([...new Set(all.map((c) => c.creatorId))]);
    const weights = creatorWeights(
      config,
      all.filter((c) => eligible.has(c.creatorId)),
    );
    const pool = fromDatabase(cycle.poolAmount);
    return {
      version,
      distribution: distributePool(config, pool, weights),
      pool,
      considered: all.length,
    };
  }

  private breakdown(
    a: ReturnType<typeof distributePool>['allocations'][number],
  ): Prisma.InputJsonValue {
    return {
      share: a.share,
      weight: a.weight,
      capped: a.capped,
      byLevel: a.byLevel,
    } as unknown as Prisma.InputJsonValue;
  }

  /** Background job: refresh everyone's estimate for the cycles that are running. Estimates are not money. */
  async refreshEstimates(now = new Date()): Promise<number> {
    const open = await this.prisma.rewardCycle.findMany({
      where: { status: 'OPEN', startsAt: { lte: now } },
    });
    let touched = 0;
    for (const cycle of open) {
      const { version, distribution } = await this.compute(cycle, now);
      const current = new Set(distribution.allocations.map((a) => a.creatorId));
      for (const a of distribution.allocations) {
        const data = {
          estimatedAmount: formatRupees(a.amount),
          qualifiedReach: a.qualifiedReach,
          reachLevel: a.bestLevel.toUpperCase() as 'DISTRICT',
          scoringVersion: version,
          breakdown: this.breakdown(a),
        };
        await this.prisma.creatorEarning.upsert({
          where: { creatorId_cycleId: { creatorId: a.creatorId, cycleId: cycle.id } },
          create: { creatorId: a.creatorId, cycleId: cycle.id, ...data },
          update: data,
        });
        touched++;
      }
      // Anyone who had an estimate and no longer has a claim drops to zero, not to a stale figure.
      const stale = await this.prisma.creatorEarning.findMany({
        where: {
          cycleId: cycle.id,
          status: 'ESTIMATED',
          estimatedAmount: { gt: 0 },
          creatorId: { notIn: [...current] },
        },
        select: { id: true },
      });
      if (stale.length) {
        await this.prisma.creatorEarning.updateMany({
          where: { id: { in: stale.map((s) => s.id) } },
          data: { estimatedAmount: '0.00', qualifiedReach: 0 },
        });
        touched += stale.length;
      }
    }
    return touched;
  }

  // ----------------------------------------------------------- close, release --

  /** Freezes a finished cycle's shares. Nothing reaches the ledger yet. */
  async closeCycle(actor: AdminAuthContext, id: string, meta: Meta) {
    const cycle = await this.prisma.rewardCycle.findUnique({ where: { id } });
    if (!cycle) throw Errors.notFound('Reward cycle');
    if (cycle.status !== 'OPEN') throw Errors.conflict('Only an open cycle can be closed.');
    if (new Date() < cycle.endsAt)
      throw Errors.conflict('A cycle can be closed only after its end date.');

    // Claim the cycle first, so two people closing it at once cannot both compute and write.
    const claimed = await this.prisma.rewardCycle.updateMany({
      where: { id, status: 'OPEN' },
      data: { status: 'CALCULATING' },
    });
    if (claimed.count !== 1) throw Errors.conflict('This cycle is already being closed.');
    try {
      const { version, distribution, pool } = await this.compute(cycle, cycle.endsAt);
      const paid = distribution.allocations.reduce((sum, a) => sum + a.amount, 0n);
      const summary = {
        closedById: actor.adminId,
        closedAt: new Date().toISOString(),
        configVersion: version,
        pool: formatRupees(pool),
        allocated: formatRupees(paid),
        unspent: formatRupees(distribution.unspent),
        cappedAway: formatRupees(distribution.cappedAway),
        creators: distribution.allocations.filter((a) => a.amount > 0n).length,
        totalWeight: distribution.totalWeight,
      };
      await this.prisma.$transaction(async (tx) => {
        const current = new Set(distribution.allocations.map((a) => a.creatorId));
        for (const a of distribution.allocations) {
          const data = {
            estimatedAmount: formatRupees(a.amount),
            qualifiedReach: a.qualifiedReach,
            reachLevel: a.bestLevel.toUpperCase() as 'DISTRICT',
            scoringVersion: version,
            breakdown: this.breakdown(a),
          };
          await tx.creatorEarning.upsert({
            where: { creatorId_cycleId: { creatorId: a.creatorId, cycleId: id } },
            create: { creatorId: a.creatorId, cycleId: id, ...data },
            update: data,
          });
        }
        await tx.creatorEarning.updateMany({
          where: { cycleId: id, status: 'ESTIMATED', creatorId: { notIn: [...current] } },
          data: { estimatedAmount: '0.00', qualifiedReach: 0 },
        });
        await tx.rewardCycle.update({
          where: { id },
          data: { status: 'CLOSED', summary: summary as unknown as Prisma.InputJsonValue },
        });
        await this.audit.record(
          {
            actorType: 'ADMIN',
            actorId: actor.adminId,
            actorLabel: actor.name,
            action: 'earnings.cycle_closed',
            targetType: 'reward_cycle',
            targetId: id,
            after: summary,
            ...meta,
          },
          tx,
        );
      });
    } catch (error) {
      // Put it back so it can be tried again; nothing was written.
      await this.prisma.rewardCycle.updateMany({
        where: { id, status: 'CALCULATING' },
        data: { status: 'OPEN' },
      });
      throw error;
    }
    return this.getCycle(id);
  }

  /**
   * Releases a closed cycle into the ledger. A second person must do this (the one who closed
   * it cannot), and it can be run again after an interruption: each creator is credited in one
   * transaction under a key made from the cycle and the creator, so no one is ever credited twice.
   */
  async finalizeCycle(actor: AdminAuthContext, id: string, meta: Meta) {
    const cycle = await this.prisma.rewardCycle.findUnique({ where: { id } });
    if (!cycle) throw Errors.notFound('Reward cycle');
    if (cycle.status !== 'CLOSED' && cycle.status !== 'FINALIZED') {
      throw Errors.conflict('Close the cycle first; only a closed cycle can be released.');
    }
    const closedBy = (cycle.summary as { closedById?: string } | null)?.closedById;
    if (closedBy && closedBy === actor.adminId) {
      throw Errors.forbidden('Ask someone else to release a cycle you closed.');
    }

    const pending = await this.prisma.creatorEarning.findMany({
      where: { cycleId: id, status: 'ESTIMATED' },
      select: { id: true, creatorId: true, estimatedAmount: true },
      orderBy: { id: 'asc' },
    });
    let credited = 0;
    let voided = 0;
    let total = 0n;
    for (const earning of pending) {
      const amount = fromDatabase(earning.estimatedAmount);
      const outcome = await this.prisma.$transaction(async (tx) => {
        // Re-read inside the transaction with a lock: whoever gets here first does the work.
        const [row] = await tx.$queryRaw<
          { status: string }[]
        >`SELECT status::text AS status FROM creator_earnings WHERE id = ${earning.id}::uuid FOR UPDATE`;
        if (row?.status !== 'ESTIMATED') return 'skipped' as const;
        const standing = await tx.creatorProfile.findUnique({
          where: { userId: earning.creatorId },
          select: { monetizationStatus: true, user: { select: { status: true } } },
        });
        const payable =
          amount > 0n &&
          !!standing &&
          (standing.monetizationStatus === 'ELIGIBLE' ||
            standing.monetizationStatus === 'ACTIVE') &&
          standing.user.status === 'ACTIVE';
        if (!payable) {
          // Nothing earned, or the creator was suspended since the cycle closed: no money moves.
          await tx.creatorEarning.update({
            where: { id: earning.id },
            data: {
              status: 'VOID',
              finalizedAmount: '0.00',
              breakdown: { voided: amount > 0n ? 'not_payable_at_release' : 'nothing_earned' },
            },
          });
          return amount > 0n ? ('voided' as const) : ('skipped' as const);
        }
        const { journalId } = await this.ledger.post(
          {
            type: 'REWARD_FINALIZED',
            idempotencyKey: `reward:${id}:${earning.creatorId}`,
            memo: `Reward for ${cycle.label}`,
            reference: { type: 'creator_earning', id: earning.id },
            lines: [
              { account: { kind: 'platform', type: 'REWARD_POOL' }, direction: 'DEBIT', amount },
              {
                account: { kind: 'creator', userId: earning.creatorId },
                direction: 'CREDIT',
                amount,
              },
            ],
            actor: { type: 'ADMIN', id: actor.adminId },
          },
          tx,
        );
        await tx.creatorEarning.update({
          where: { id: earning.id },
          data: { status: 'FINALIZED', finalizedAmount: formatRupees(amount), journalId },
        });
        return 'credited' as const;
      });
      if (outcome === 'credited') {
        credited++;
        total += amount;
      } else if (outcome === 'voided') voided++;
    }

    const remaining = await this.prisma.creatorEarning.count({
      where: { cycleId: id, status: 'ESTIMATED' },
    });
    if (remaining === 0 && cycle.status === 'CLOSED') {
      await this.prisma.$transaction(async (tx) => {
        const res = await tx.rewardCycle.updateMany({
          where: { id, status: 'CLOSED' },
          data: { status: 'FINALIZED', finalizedAt: new Date() },
        });
        if (res.count === 1) {
          await this.audit.record(
            {
              actorType: 'ADMIN',
              actorId: actor.adminId,
              actorLabel: actor.name,
              action: 'earnings.cycle_finalized',
              targetType: 'reward_cycle',
              targetId: id,
              after: { credited, voided, total: formatRupees(total) },
              ...meta,
            },
            tx,
          );
        }
      });
    }
    return {
      ...(await this.getCycle(id)),
      release: { credited, voided, total: formatRupees(total), remaining },
    };
  }

  // ------------------------------------------------------------- adjustments --

  /**
   * A manual correction to one creator’s balance, by a person, with a reason, through the same
   * ledger as everything else. Positive adds, negative takes away (and is refused if it would
   * take the balance below zero). Sending the same `idempotencyKey` again changes nothing.
   */
  async adjust(
    actor: AdminAuthContext,
    input: { userId: string; amount: string; reason: string; idempotencyKey: string },
    meta: Meta,
  ) {
    let amount: Paise;
    try {
      amount = parseRupees(input.amount);
    } catch {
      throw Errors.validation([{ field: 'amount', reasons: ['invalid_amount'] }]);
    }
    if (amount === 0n) throw Errors.validation([{ field: 'amount', reasons: ['zero'] }]);
    const configured = await this.settings.get<string>(
      MAX_ADJUSTMENT_SETTING,
      formatRupees(DEFAULT_MAX_ADJUSTMENT),
    );
    const max = (() => {
      try {
        return parseRupees(String(configured));
      } catch {
        return DEFAULT_MAX_ADJUSTMENT;
      }
    })();
    if ((amount < 0n ? -amount : amount) > max) {
      throw Errors.validation([{ field: 'amount', reasons: ['above_adjustment_limit'] }]);
    }
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true },
    });
    if (!user) throw Errors.notFound('Creator');

    const abs = amount < 0n ? -amount : amount;
    const creator = { kind: 'creator', userId: input.userId } as const;
    const adjustments = { kind: 'platform', type: 'ADJUSTMENTS' } as const;
    return this.prisma.$transaction(async (tx) => {
      const posted = await this.ledger.post(
        {
          type: 'ADJUSTMENT',
          idempotencyKey: `adjust:${input.userId}:${input.idempotencyKey}`,
          memo: input.reason.slice(0, 300),
          reference: { type: 'user', id: input.userId },
          lines:
            amount > 0n
              ? [
                  { account: adjustments, direction: 'DEBIT', amount: abs },
                  { account: creator, direction: 'CREDIT', amount: abs },
                ]
              : [
                  { account: creator, direction: 'DEBIT', amount: abs },
                  { account: adjustments, direction: 'CREDIT', amount: abs },
                ],
          actor: { type: 'ADMIN', id: actor.adminId },
        },
        tx,
      );
      if (!posted.replayed) {
        await this.audit.record(
          {
            actorType: 'ADMIN',
            actorId: actor.adminId,
            actorLabel: actor.name,
            action: 'earnings.adjustment_posted',
            targetType: 'user',
            targetId: input.userId,
            reason: input.reason,
            after: { amount: formatRupees(amount), journalId: posted.journalId },
            ...meta,
          },
          tx,
        );
      }
      return {
        journalId: posted.journalId,
        replayed: posted.replayed,
        amount: formatRupees(amount),
      };
    });
  }

  // ---------------------------------------------------------------- creators --

  /**
   * The creator's own figures, kept apart on purpose:
   *   estimated  a projection for the cycle in progress. Not money; changes until the cycle ends.
   *   pending    fixed at the close of a cycle, awaiting release.
   *   finalized  released into the ledger.
   *   available  what the ledger says the platform owes them now.
   */
  async summary(userId: string) {
    const [available, finalized, pending, open, eligibility] = await Promise.all([
      this.ledger.balanceOf(userId),
      this.prisma.creatorEarning.aggregate({
        where: { creatorId: userId, status: 'FINALIZED' },
        _sum: { finalizedAmount: true },
      }),
      this.prisma.creatorEarning.aggregate({
        where: { creatorId: userId, status: 'ESTIMATED', cycle: { status: 'CLOSED' } },
        _sum: { estimatedAmount: true },
      }),
      this.prisma.creatorEarning.findFirst({
        where: { creatorId: userId, status: 'ESTIMATED', cycle: { status: 'OPEN' } },
        orderBy: { cycle: { startsAt: 'desc' } },
        include: { cycle: { select: { label: true, startsAt: true, endsAt: true } } },
      }),
      this.creators.eligibility(userId),
    ]);
    return {
      currency: 'INR',
      estimated: open
        ? {
            amount: money(open.estimatedAmount),
            cycle: {
              label: open.cycle.label,
              startsAt: open.cycle.startsAt.toISOString(),
              endsAt: open.cycle.endsAt.toISOString(),
            },
            qualifiedReach: open.qualifiedReach,
            level: open.reachLevel,
            updatedAt: open.updatedAt.toISOString(),
          }
        : null,
      pending: formatRupees(fromDatabase(pending._sum.estimatedAmount)),
      finalized: formatRupees(fromDatabase(finalized._sum.finalizedAmount)),
      available: formatRupees(available),
      eligibility,
      notice: 'ESTIMATE_NOT_GUARANTEED',
    };
  }

  async history(userId: string, q: { cursor?: string | undefined; limit?: number | undefined }) {
    const limit = clampLimit(q.limit);
    const after = decodeCursor(q.cursor, cursorSchema);
    const rows = await this.prisma.creatorEarning.findMany({
      where: {
        creatorId: userId,
        ...(after
          ? {
              OR: [
                { createdAt: { lt: new Date(after.t) } },
                { createdAt: new Date(after.t), id: { lt: after.id } },
              ],
            }
          : {}),
      },
      include: { cycle: { select: { label: true, startsAt: true, endsAt: true, status: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.createdAt.toISOString(), id: r.id }),
      (r) => ({
        id: r.id,
        cycle: {
          label: r.cycle.label,
          startsAt: r.cycle.startsAt.toISOString(),
          endsAt: r.cycle.endsAt.toISOString(),
          status: r.cycle.status,
        },
        status: r.status,
        // The amount that counts for each state: a projection, a fixed figure, or the money released.
        amount: money(
          r.status === 'FINALIZED'
            ? r.finalizedAmount
            : r.status === 'VOID'
              ? null
              : r.estimatedAmount,
        ),
        isEstimate: r.status === 'ESTIMATED' && r.cycle.status === 'OPEN',
        qualifiedReach: r.qualifiedReach,
        level: r.reachLevel,
      }),
    );
  }

  /** The creator’s own ledger lines, newest first. Credits are positive, debits negative. */
  async ledgerOf(userId: string, q: { cursor?: string | undefined; limit?: number | undefined }) {
    const limit = clampLimit(q.limit);
    const after = decodeCursor(q.cursor, cursorSchema);
    const rows = await this.ledger.entriesOf(userId, { limit, after });
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.createdAt.toISOString(), id: r.id }),
      (r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        type: r.journal.type,
        memo: r.journal.memo,
        // CREATOR_PAYABLE rises with credits: a credit is money owed to the creator, a debit is money taken or paid.
        amount: formatRupees(
          r.direction === 'CREDIT' ? fromDatabase(r.amount) : -fromDatabase(r.amount),
        ),
        balanceAfter: money(r.balanceAfter),
      }),
    );
  }
}
