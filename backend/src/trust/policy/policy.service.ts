import { Injectable } from '@nestjs/common';
import { AuditService } from '../../admin/audit/audit.service.js';
import { Errors } from '../../common/errors/app-error.js';
import type { AdminAuthContext } from '../../common/http/request.js';
import { SystemSettingsService } from '../../common/settings/system-settings.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { ReportCategory, Severity } from '../../generated/prisma/client.js';
import {
  CATEGORIES,
  CATEGORY_DEFAULTS,
  type CategoryPolicy,
  POLICY_RULES,
  POLICY_VERSION,
  SEVERITY_ORDER,
} from '../policy.js';

export const CATEGORY_POLICY_KEY = 'moderation.category_policy';

/** Limits staff change on the settings page; these are the values used when nothing was set. */
export const MODERATION_LIMIT_DEFAULTS = {
  'moderation.reports_per_day': 30,
  'moderation.appeal_window_days': 30,
  'moderation.appeal_sla_hours': 72,
} as const;

/**
 * Child-safety and self-harm reports can be tuned, but never below this floor: whatever a settings
 * mistake or a bad day does, they stay high-severity and are looked at within a day.
 */
const FLOOR: Partial<Record<ReportCategory, { minSeverity: Severity; maxSlaHours: number }>> = {
  CHILD_SAFETY: { minSeverity: 'HIGH', maxSlaHours: 24 },
  SELF_HARM: { minSeverity: 'HIGH', maxSlaHours: 24 },
};

interface Meta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

type Stored = Partial<Record<ReportCategory, CategoryPolicy>>;

/**
 * Severity, response time and automatic hiding per report category, and the limits around
 * reporting and appeals.
 *
 * What is stored is only what staff changed; everything else follows the defaults in `policy.ts`,
 * so a default improved in code reaches every category nobody has overridden. Changes need the
 * `policy.update` permission and a reason, are written with an optimistic version so two people
 * editing at once cannot silently overwrite each other, and are audited with before and after.
 */
@Injectable()
export class PolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SystemSettingsService,
    private readonly audit: AuditService,
  ) {}

  private async stored(): Promise<Stored> {
    return this.settings.get<Stored>(CATEGORY_POLICY_KEY, {});
  }

  async categoryPolicy(category: ReportCategory): Promise<CategoryPolicy> {
    const stored = await this.stored();
    return { ...CATEGORY_DEFAULTS[category], ...stored[category] };
  }

  async limits(): Promise<{
    reportsPerDay: number;
    appealWindowDays: number;
    appealSlaHours: number;
  }> {
    const [reportsPerDay, appealWindowDays, appealSlaHours] = await Promise.all([
      this.settings.get<number>(
        'moderation.reports_per_day',
        MODERATION_LIMIT_DEFAULTS['moderation.reports_per_day'],
      ),
      this.settings.get<number>(
        'moderation.appeal_window_days',
        MODERATION_LIMIT_DEFAULTS['moderation.appeal_window_days'],
      ),
      this.settings.get<number>(
        'moderation.appeal_sla_hours',
        MODERATION_LIMIT_DEFAULTS['moderation.appeal_sla_hours'],
      ),
    ]);
    return { reportsPerDay, appealWindowDays, appealSlaHours };
  }

  /** Everything the policy page shows. */
  async view() {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: CATEGORY_POLICY_KEY } });
    const stored = (row?.value ?? {}) as Stored;
    return {
      policyVersion: POLICY_VERSION,
      version: row?.version ?? 0,
      updatedAt: row?.updatedAt.toISOString() ?? null,
      rules: POLICY_RULES.map((r) => ({ ...r, categories: [...r.categories] })),
      categories: CATEGORIES.map((category) => ({
        category,
        ...CATEGORY_DEFAULTS[category],
        ...stored[category],
        default: CATEGORY_DEFAULTS[category],
        isDefault: !stored[category],
        floor: FLOOR[category] ?? null,
      })),
      limits: await this.limits(),
    };
  }

  async setCategory(
    actor: AdminAuthContext,
    category: ReportCategory,
    next: CategoryPolicy,
    reason: string,
    expectedVersion: number | undefined,
    meta: Meta,
  ) {
    const floor = FLOOR[category];
    if (floor) {
      if (SEVERITY_ORDER[next.severity] < SEVERITY_ORDER[floor.minSeverity]) {
        throw Errors.validation([
          { field: 'severity', reasons: [`at_least_${floor.minSeverity.toLowerCase()}`] },
        ]);
      }
      if (next.slaHours > floor.maxSlaHours) {
        throw Errors.validation([{ field: 'slaHours', reasons: [`at_most_${floor.maxSlaHours}`] }]);
      }
    }
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.systemSetting.findUnique({ where: { key: CATEGORY_POLICY_KEY } });
      if (expectedVersion !== undefined && (row?.version ?? 0) !== expectedVersion) {
        throw Errors.conflict(
          'The policy was changed by someone else. Reload it and try again.',
          'CONFLICT',
          { version: row?.version ?? 0 },
        );
      }
      const before = (row?.value ?? {}) as Stored;
      const after: Stored = { ...before, [category]: next };
      if (row) {
        const res = await tx.systemSetting.updateMany({
          where: { key: CATEGORY_POLICY_KEY, version: row.version },
          data: { value: after as object, version: { increment: 1 }, updatedById: actor.adminId },
        });
        if (res.count !== 1)
          throw Errors.conflict('The policy was changed by someone else. Reload it and try again.');
      } else {
        await tx.systemSetting.create({
          data: { key: CATEGORY_POLICY_KEY, value: after as object, updatedById: actor.adminId },
        });
      }
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorId: actor.adminId,
          actorLabel: actor.name,
          action: 'policy.category_updated',
          targetType: 'policy_category',
          targetId: category,
          reason,
          before: before[category] ?? CATEGORY_DEFAULTS[category],
          after: next,
          ...meta,
        },
        tx,
      );
    });
    this.settings.invalidate(CATEGORY_POLICY_KEY);
    return this.view();
  }
}
