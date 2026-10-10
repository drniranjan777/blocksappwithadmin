import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError, type ErrorCode, type FieldIssue } from '../errors/app-error.js';
import type { ApiRequest } from '../http/request.js';

interface Rendered {
  status: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
  headers?: Record<string, string>;
}

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  412: 'PRECONDITION_FAILED',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

/**
 * The one place every error leaves the API. Whatever was thrown, the client
 * gets the same envelope, and nothing about the server's internals (stack
 * traces, SQL, file paths, library names) ever reaches it. Unexpected errors
 * are logged here with the request id and answered with a generic 500.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<ApiRequest>();
    const res = http.getResponse<Response>();
    const rendered = this.render(exception);

    if (rendered.status >= 500) {
      this.logger.error(
        { requestId: req.requestId, method: req.method, path: req.path, err: exception },
        'Unhandled error',
      );
    }
    if (res.headersSent) return;
    for (const [name, value] of Object.entries(rendered.headers ?? {})) res.setHeader(name, value);
    res.status(rendered.status).json({
      error: {
        code: rendered.code,
        message: rendered.message,
        ...(rendered.details === undefined ? {} : { details: rendered.details }),
        requestId: req.requestId ?? null,
      },
    });
  }

  private render(e: unknown): Rendered {
    if (e instanceof AppError) {
      return {
        status: e.status,
        code: e.code,
        message: e.message,
        details: e.details,
        headers: e.headers,
      };
    }

    if (e instanceof HttpException) {
      const status = e.getStatus();
      const response = e.getResponse();
      // class-validator output arrives as { message: string[] }.
      if (
        status === 400 &&
        typeof response === 'object' &&
        Array.isArray((response as { message?: unknown }).message)
      ) {
        const issues: FieldIssue[] = (response as { message: string[] }).message.map((m) => ({
          field: 'body',
          reasons: [m],
        }));
        return {
          status,
          code: 'VALIDATION_FAILED',
          message: 'Some fields are not valid.',
          details: issues,
        };
      }
      // Nest turns body-parser's SyntaxError into BadRequestException(<V8 message>).
      // The application never throws that class itself (it throws AppError), so a
      // 400 whose message talks about JSON is a malformed body.
      if (status === 400 && /\bJSON\b/.test(e.message)) {
        return { status, code: 'INVALID_JSON', message: 'The request body is not valid JSON.' };
      }
      return {
        status,
        code: STATUS_TO_CODE[status] ?? (status >= 500 ? 'INTERNAL' : 'VALIDATION_FAILED'),
        message: status >= 500 ? 'Something went wrong on our side. Please try again.' : e.message,
      };
    }

    // body-parser (malformed JSON, body too large) throws plain errors with a `type`.
    const parsed = e as { type?: string; status?: number };
    if (parsed?.type === 'entity.parse.failed') {
      return { status: 400, code: 'INVALID_JSON', message: 'The request body is not valid JSON.' };
    }
    if (parsed?.type === 'entity.too.large') {
      return { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'The request is too large.' };
    }

    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        return { status: 409, code: 'CONFLICT', message: 'That value is already in use.' };
      }
      if (e.code === 'P2025') {
        return { status: 404, code: 'NOT_FOUND', message: 'Resource was not found.' };
      }
      if (e.code === 'P2003') {
        return {
          status: 409,
          code: 'PRECONDITION_FAILED',
          message: 'That is still in use by something else.',
        };
      }
      // Every database connection was busy for too long (P2028), or two requests collided and one was
      // rolled back (P2034). Nothing was changed, and asking again a moment later will usually work.
      if (e.code === 'P2028' || e.code === 'P2034') {
        return {
          status: 503,
          code: 'SERVICE_UNAVAILABLE',
          message: 'The service is busy right now. Please try again in a moment.',
          headers: { 'Retry-After': '1' },
        };
      }
    }

    return {
      status: 500,
      code: 'INTERNAL',
      message: 'Something went wrong on our side. Please try again.',
    };
  }
}
