import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { AuditService } from '../admin/audit/audit.service.js';
import { Errors } from '../common/errors/app-error.js';
import type { AdminAuthContext } from '../common/http/request.js';
import { Page, clampLimit, decodeCursor } from '../common/pagination/cursor.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma, ReachConfigVersion } from '../generated/prisma/client.js';
import { z } from 'zod';
import {
  DEFAULT_REACH_CONFIG,
  type ReachConfig,
  diffConfig,
  validateReachConfig,
} from './reach-config.js';

const cursorSchema = z.object({ v: z.number().int() });

interface Meta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface ActiveConfig {
  id: string;
  version: number;
  config: ReachConfig;
}

/**
 * The Reach Engine's settings, versioned.
 *
 *   - exactly one version is **active**; the database refuses a second, and refuses any edit
 *     to a version once it is no longer a draft, so a past score can always be reproduced;
 *   - a draft is validated on every save, so an invalid configuration can never become active;
 *   - going live takes **two people**: the one who activates a version cannot be the one who
 *     drafted it (and the permissions to draft and to activate are held by different roles);
 *   - every step is audited in the same transaction, with the settings that changed.
 *
 * A system default (version 1) is created at start-up if there is none, so the engine always
 * has a configuration to score with.
 */
@Injectable()
export class ReachConfigService implements OnApplicationBootstrap {
  private readonly logger = new Logger('ReachConfig');
  private cached: { value: ActiveConfig; at: number } | undefined;
  private static readonly TTL_MS = 30_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureDefault().catch((e: Error) =>
      this.logger.error(`could not create the default reach configuration: ${e.message}`),
    );
  }

  // ------------------------------------------------------------------ reading --

  /** The configuration scoring uses now. Cached briefly; a change is felt everywhere within seconds. */
  async active(): Promise<ActiveConfig> {
    if (this.cached && Date.now() - this.cached.at < ReachConfigService.TTL_MS) {
      return this.cached.value;
    }
    let row = await this.prisma.reachConfigVersion.findFirst({ where: { status: 'ACTIVE' } });
    if (!row) {
      await this.ensureDefault();
      row = await this.prisma.reachConfigVersion.findFirst({ where: { status: 'ACTIVE' } });
    }
    if (!row) throw new Error('no active reach configuration and none could be created');
    const value = this.toActive(row);
    this.cached = { value, at: Date.now() };
    return value;
  }

  invalidate(): void {
    this.cached = undefined;
  }

  private toActive(row: ReachConfigVersion): ActiveConfig {
    // Stored configurations were validated on the way in; check again so a hand-edited row
    // is refused loudly instead of silently producing wrong scores.
    const checked = validateReachConfig(row.config);
    if (!checked.ok) {
      throw new Error(
        `stored reach configuration v${row.version} is invalid: ${checked.issues[0]?.message}`,
      );
    }
    return { id: row.id, version: row.version, config: checked.config };
  }

  /** The configuration a stored score was computed with. */
  async byId(id: string): Promise<ActiveConfig | null> {
    const row = await this.prisma.reachConfigVersion.findUnique({ where: { id } });
    return row ? this.toActive(row) : null;
  }

  private view(
    row: ReachConfigVersion & { createdBy?: { name: string } | null },
    activeConfig?: unknown,
  ) {
    return {
      id: row.id,
      version: row.version,
      status: row.status,
      note: row.note,
      createdBy: row.createdBy?.name ?? 'system',
      createdAt: row.createdAt.toISOString(),
      activatedAt: row.activatedAt?.toISOString() ?? null,
      config: row.config,
      ...(activeConfig === undefined || row.status === 'ACTIVE'
        ? {}
        : { changesFromActive: diffConfig(activeConfig, row.config) }),
    };
  }

  async list(q: { cursor?: string | undefined; limit?: number | undefined }) {
    const limit = clampLimit(q.limit);
    const after = decodeCursor(q.cursor, cursorSchema);
    const rows = await this.prisma.reachConfigVersion.findMany({
      where: after ? { version: { lt: after.v } } : {},
      include: { createdBy: { select: { name: true } } },
      orderBy: { version: 'desc' },
      take: limit + 1,
    });
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ v: r.version }),
      (r) => {
        const { config: _config, ...summary } = this.view(r);
        return summary;
      },
    );
  }

  async get(id: string) {
    const row = await this.prisma.reachConfigVersion.findUnique({
      where: { id },
      include: { createdBy: { select: { name: true } } },
    });
    if (!row) throw Errors.notFound('Configuration version');
    const active = await this.prisma.reachConfigVersion.findFirst({ where: { status: 'ACTIVE' } });
    return this.view(row, active?.config);
  }

  // ------------------------------------------------------------------ writing --

  private validated(raw: unknown): ReachConfig {
    const result = validateReachConfig(raw);
    if (!result.ok) {
      throw Errors.validation(
        result.issues.map((i) => ({ field: i.path || 'config', reasons: [i.message] })),
      );
    }
    return result.config;
  }

  /** Starts a draft: from the supplied settings, or as a copy of the active version. */
  async createDraft(
    actor: AdminAuthContext,
    input: { config?: unknown; note?: string | undefined },
    meta: Meta,
  ) {
    const current = await this.active();
    const base = input.config === undefined ? current.config : this.validated(input.config);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const latest = await tx.reachConfigVersion.aggregate({ _max: { version: true } });
          const row = await tx.reachConfigVersion.create({
            data: {
              version: (latest._max.version ?? 0) + 1,
              status: 'DRAFT',
              config: base as unknown as Prisma.InputJsonValue,
              note: input.note?.trim() || null,
              createdById: actor.adminId,
            },
            include: { createdBy: { select: { name: true } } },
          });
          await this.audit.record(
            {
              actorType: 'ADMIN',
              actorId: actor.adminId,
              actorLabel: actor.name,
              action: 'reach.config_drafted',
              targetType: 'reach_config',
              targetId: row.id,
              after: { version: row.version, note: row.note },
              ...meta,
            },
            tx,
          );
          return this.view(row, current.config);
        });
      } catch (error) {
        // Two people drafting at once picked the same number: try the next one.
        if ((error as { code?: string }).code !== 'P2002' || attempt === 2) throw error;
      }
    }
    throw Errors.conflict('Could not number the new version. Try again.');
  }

  private async draft(tx: Prisma.TransactionClient, id: string) {
    const row = await tx.reachConfigVersion.findUnique({ where: { id } });
    if (!row) throw Errors.notFound('Configuration version');
    if (row.status !== 'DRAFT') {
      throw Errors.conflict('Only a draft can be changed. Draft a new version instead.');
    }
    return row;
  }

  async updateDraft(
    actor: AdminAuthContext,
    id: string,
    input: { config?: unknown; note?: string | undefined },
    meta: Meta,
  ) {
    const config = input.config === undefined ? undefined : this.validated(input.config);
    const current = await this.active();
    return this.prisma.$transaction(async (tx) => {
      const before = await this.draft(tx, id);
      const row = await tx.reachConfigVersion.update({
        where: { id },
        data: {
          ...(config ? { config: config as unknown as Prisma.InputJsonValue } : {}),
          ...(input.note !== undefined ? { note: input.note.trim() || null } : {}),
        },
        include: { createdBy: { select: { name: true } } },
      });
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'reach.config_updated',
          targetType: 'reach_config',
          targetId: id,
          after: { version: row.version, changes: config ? diffConfig(before.config, config) : [] },
          ...meta,
        },
        tx,
      );
      return this.view(row, current.config);
    });
  }

  async deleteDraft(actor: AdminAuthContext, id: string, meta: Meta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await this.draft(tx, id);
      await tx.reachConfigVersion.delete({ where: { id } });
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'reach.config_deleted',
          targetType: 'reach_config',
          targetId: id,
          before: { version: row.version },
          ...meta,
        },
        tx,
      );
    });
  }

  /** Makes a draft the live configuration. The previous one is archived, not changed. */
  async activate(actor: AdminAuthContext, id: string, reason: string, meta: Meta) {
    const result = await this.prisma.$transaction(async (tx) => {
      const draft = await this.draft(tx, id);
      if (draft.createdById === actor.adminId) {
        throw Errors.forbidden('Ask someone else to activate a version you drafted.');
      }
      // Validate once more: this is the last gate before it governs every score.
      const config = this.validated(draft.config);
      const current = await tx.reachConfigVersion.findFirst({ where: { status: 'ACTIVE' } });
      if (current) {
        await tx.reachConfigVersion.update({
          where: { id: current.id },
          data: { status: 'ARCHIVED' },
        });
      }
      const row = await tx.reachConfigVersion.update({
        where: { id },
        data: { status: 'ACTIVE', activatedAt: new Date(), activatedById: actor.adminId },
        include: { createdBy: { select: { name: true } } },
      });
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'reach.config_activated',
          targetType: 'reach_config',
          targetId: id,
          reason,
          before: { activeVersion: current?.version ?? null },
          after: {
            activeVersion: row.version,
            changes: current ? diffConfig(current.config, config) : [],
          },
          ...meta,
        },
        tx,
      );
      return this.view(row);
    });
    this.invalidate();
    return result;
  }

  // ----------------------------------------------------------------- bootstrap --

  /** Creates version 1 from the default if no version is live. Safe to run on every instance at once. */
  async ensureDefault(): Promise<void> {
    if (await this.prisma.reachConfigVersion.findFirst({ where: { status: 'ACTIVE' } })) return;
    try {
      await this.prisma.$transaction(async (tx) => {
        const latest = await tx.reachConfigVersion.aggregate({ _max: { version: true } });
        await tx.reachConfigVersion.create({
          data: {
            version: (latest._max.version ?? 0) + 1,
            status: 'ACTIVE',
            config: DEFAULT_REACH_CONFIG as unknown as Prisma.InputJsonValue,
            note: 'Default configuration created by the system. Replace it with a reviewed one.',
            createdById: null,
            activatedAt: new Date(),
          },
        });
      });
      this.logger.log('Created the default Reach configuration (version 1).');
    } catch (error) {
      // Another instance got there first.
      if ((error as { code?: string }).code !== 'P2002') throw error;
    }
  }
}
