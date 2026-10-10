import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { ActorType, Prisma } from '../../generated/prisma/client.js';
import { redact } from './redact.js';

export interface AuditInput {
  actorType: ActorType;
  actorId?: string | null | undefined;
  /** Name and role at the time, so the log stays readable if the account changes. */
  actorLabel?: string | null | undefined;
  /** `module.action`, e.g. `admin.invite`. */
  action: string;
  targetType?: string | undefined;
  targetId?: string | undefined;
  reason?: string | undefined;
  before?: unknown;
  after?: unknown;
  ip?: string | undefined;
  userAgent?: string | undefined;
  requestId?: string | undefined;
  /** Access to protected data: reviewed separately and hidden from most auditors. */
  sensitive?: boolean;
}

/** Anything that can run `auditLog.create`: the client itself, or a transaction. */
export type AuditDb = Pick<PrismaService, 'auditLog'> | Pick<Prisma.TransactionClient, 'auditLog'>;

/**
 * Writes the audit trail.
 *
 * Pass the transaction (`tx`) that makes the change, so the change and its record
 * commit or fail together: there is never a change without a record, and never a
 * record of a change that did not happen. The table itself refuses UPDATE and
 * DELETE (see the integrity migration), so a record cannot be altered later.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput, db: AuditDb = this.prisma): Promise<void> {
    await db.auditLog.create({
      data: {
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        actorLabel: input.actorLabel?.slice(0, 160) ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        reason: input.reason?.slice(0, 500) ?? null,
        before:
          input.before === undefined ? undefined : (redact(input.before) as Prisma.InputJsonValue),
        after:
          input.after === undefined ? undefined : (redact(input.after) as Prisma.InputJsonValue),
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        requestId: input.requestId ?? null,
        sensitive: input.sensitive ?? false,
      },
    });
  }
}
