import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { Env } from '../../config/env.js';
import type { ApiRequest } from '../http/request.js';

/**
 * Structured JSON logs, one line per request, with secrets removed before they
 * are written. The redaction list is the safety net; the primary rule is that
 * code never logs request bodies, tokens, codes or identifiers in the first place.
 */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  // If a body ever ends up in a log object, these keys never survive:
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.code',
  '*.otp',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.resetToken',
  '*.secret',
  '*.pan',
  '*.accountNumber',
  '*.aadhaar',
  '*.number',
];

export function loggerParams(env: Env): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
      genReqId: (req: IncomingMessage) => (req as ApiRequest).requestId ?? 'unknown',
      // Health probes would drown everything else.
      autoLogging: { ignore: (req: IncomingMessage) => (req.url ?? '').includes('/health') },
      customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      // Log what is needed to debug a request, never its body or query string.
      serializers: {
        req: (req: { id: string; method: string; url?: string }) => ({
          id: req.id,
          method: req.method,
          path: (req.url ?? '').split('?')[0],
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    },
  };
}
