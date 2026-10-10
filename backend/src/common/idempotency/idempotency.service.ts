import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Errors } from '../errors/app-error.js';
import { PrismaService } from '../../database/prisma.service.js';

const KEY_FORMAT = /^[A-Za-z0-9_-]{8,100}$/;
const TTL_HOURS = 24;
/** An unfinished attempt older than this is assumed to have died with its server. */
const STALE_MS = 2 * 60_000;

export interface IdempotencyOptions {
  /** Whose request and which operation, e.g. `post.create:<userId>`. */
  scope: string;
  /** The `Idempotency-Key` header, if the client sent one. */
  key: string | undefined;
  /** Everything that defines the request. The same key with a different body is refused. */
  request: unknown;
}

function stable(value: unknown): string {
  return JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as object).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

/**
 * Makes "create something" safe to retry.
 *
 * A phone on a bad connection sends a request, loses the answer, and tries
 * again. Without protection that is two posts, two comments, two payouts. With
 * an `Idempotency-Key` header the second attempt gets the first one's answer
 * back instead of doing the work again:
 *
 *   - same key, same request, finished  -> the stored answer, work not repeated;
 *   - same key, same request, running   -> 409 (try again shortly);
 *   - same key, different request       -> 409 IDEMPOTENCY_CONFLICT (a bug, or an attack);
 *   - the work failed                   -> the key is released, so a retry runs it again.
 *
 * Keys are scoped to a person and an operation, and expire after a day. Without a
 * key the work simply runs, so clients that do not send one still work.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(options: IdempotencyOptions, work: () => Promise<T>): Promise<T> {
    const { key } = options;
    if (key === undefined) return work();
    if (!KEY_FORMAT.test(key)) {
      throw Errors.validation([{ field: 'Idempotency-Key', reasons: ['invalid_format'] }]);
    }

    const requestHash = createHash('sha256').update(stable(options.request)).digest('hex');
    const expiresAt = new Date(Date.now() + TTL_HOURS * 3_600_000);

    const claimed = await this.prisma.idempotencyKey.createMany({
      data: [{ scope: options.scope, key, requestHash, expiresAt }],
      skipDuplicates: true,
    });

    if (claimed.count === 0) {
      const existing = await this.prisma.idempotencyKey.findUnique({
        where: { scope_key: { scope: options.scope, key } },
      });
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw Errors.conflict(
            'That Idempotency-Key was already used for a different request.',
            'IDEMPOTENCY_CONFLICT',
          );
        }
        if (existing.status === 'COMPLETED') return existing.responseBody as T;
        if (Date.now() - existing.createdAt.getTime() < STALE_MS) {
          throw Errors.conflict('The same request is still being processed. Try again shortly.');
        }
        // Abandoned: take it over, but only one retry may.
        const taken = await this.prisma.idempotencyKey.updateMany({
          where: { id: existing.id, status: 'IN_PROGRESS', createdAt: existing.createdAt },
          data: { createdAt: new Date() },
        });
        if (taken.count === 0) {
          throw Errors.conflict('The same request is still being processed. Try again shortly.');
        }
      } else {
        // Expired and cleaned up between our two reads: start over.
        return this.run(options, work);
      }
    }

    try {
      const result = await work();
      await this.prisma.idempotencyKey.update({
        where: { scope_key: { scope: options.scope, key } },
        data: {
          status: 'COMPLETED',
          responseStatus: 200,
          responseBody: result as never,
        },
      });
      return result;
    } catch (error) {
      await this.prisma.idempotencyKey
        .deleteMany({ where: { scope: options.scope, key, status: 'IN_PROGRESS' } })
        .catch(() => undefined);
      throw error;
    }
  }

  /** Housekeeping: forget keys past their life. Run by the worker. */
  async purgeExpired(): Promise<number> {
    const res = await this.prisma.idempotencyKey.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return res.count;
  }
}
