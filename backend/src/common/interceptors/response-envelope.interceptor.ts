import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Observable, map } from 'rxjs';
import { IS_RAW } from '../decorators/route-metadata.js';
import { Page } from '../pagination/cursor.js';

/**
 * Wraps every successful response as `{ "data": ... }`, with a `meta` object for
 * pages:
 *
 *     { "data": [ ... ], "meta": { "nextCursor": "...", "hasMore": true } }
 *
 * so clients parse one shape for everything. Routes that return nothing (204)
 * are left alone, and `@RawResponse()` opts a route out.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const raw = this.reflector.getAllAndOverride<boolean>(IS_RAW, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (raw) return next.handle();

    return next.handle().pipe(
      map((body: unknown) => {
        if (body === undefined) return body;
        if (body instanceof Page) {
          return { data: body.items, meta: { nextCursor: body.nextCursor, hasMore: body.hasMore } };
        }
        return { data: body };
      }),
    );
  }
}
