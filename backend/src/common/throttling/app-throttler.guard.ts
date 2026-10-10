import { Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';
import { Errors } from '../errors/app-error.js';

/**
 * The global rate limiter. It tracks callers by IP address (the real one: see
 * `TRUST_PROXY_HOPS`), and answers with the API's normal error envelope and a
 * `Retry-After` header. Sensitive routes tighten the limit with `@Throttle`.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    return (req['ip'] as string | undefined) ?? 'unknown';
  }

  protected override async throwThrottlingException(
    _context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw Errors.rateLimited(detail.isBlocked ? detail.timeToBlockExpire : detail.timeToExpire);
  }
}
