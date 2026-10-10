import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

/**
 * Runtime settings that staff can change without a deploy (the moderation term
 * list, the live-streaming gate, payout thresholds). Read through a short cache
 * so a hot path (every post) does not query for it, and a change takes effect
 * within `TTL_MS` everywhere.
 *
 * Writing goes through the admin API, which audits every change with before and
 * after values; this class only reads.
 */
@Injectable()
export class SystemSettingsService {
  private static readonly TTL_MS = 30_000;
  private readonly cache = new Map<string, { value: unknown; at: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async get<T>(key: string, fallback: T): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < SystemSettingsService.TTL_MS) return hit.value as T;
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    const value = (row?.value ?? fallback) as T;
    this.cache.set(key, { value, at: Date.now() });
    return value;
  }

  /** Forget cached values (after a change made in this process, and in tests). */
  invalidate(key?: string): void {
    if (key) this.cache.delete(key);
    else this.cache.clear();
  }
}
