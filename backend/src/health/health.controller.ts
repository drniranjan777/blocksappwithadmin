import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Errors } from '../common/errors/app-error.js';
import { Public } from '../common/decorators/route-metadata.js';
import { PrismaService } from '../database/prisma.service.js';
import { REDIS, type RedisClient } from '../redis/redis.module.js';

interface Check {
  ok: boolean;
  latencyMs?: number;
  /** `skipped` when the dependency is not configured, e.g. Redis in development. */
  state?: 'skipped';
}

/**
 * Probes for the load balancer and the orchestrator.
 *   /health/live   the process is up (never touches a dependency)
 *   /health/ready  it can serve traffic: database reachable, Redis reachable if used
 * Neither returns versions, hostnames or error text.
 */
@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: RedisClient,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness: the process is running' })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness: dependencies are reachable' })
  async ready(): Promise<{ status: 'ok'; checks: Record<string, Check> }> {
    const checks: Record<string, Check> = {
      database: await this.time(async () => {
        await this.prisma.$queryRaw`SELECT 1`;
      }),
      redis: this.redis
        ? await this.time(async () => {
            await this.redis?.ping();
          })
        : { ok: true, state: 'skipped' },
    };
    if (Object.values(checks).some((c) => !c.ok)) {
      throw Errors.unavailable('Not ready.', { checks });
    }
    return { status: 'ok', checks };
  }

  @Get()
  @ApiOperation({ summary: 'Health summary' })
  async summary(): Promise<{ status: 'ok'; checks: Record<string, Check> }> {
    return this.ready();
  }

  private async time(fn: () => Promise<void>): Promise<Check> {
    const started = performance.now();
    try {
      await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 2_000).unref(),
        ),
      ]);
      return { ok: true, latencyMs: Math.round(performance.now() - started) };
    } catch {
      return { ok: false };
    }
  }
}
