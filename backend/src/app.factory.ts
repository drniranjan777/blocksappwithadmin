import { VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { enrichOpenApi } from './common/http/openapi-enrich.js';
import { requestIdMiddleware } from './common/http/request.js';
import { listRoutes } from './common/http/route-inventory.js';
import { createValidationPipe } from './common/pipes/validation.js';
import type { Env } from './config/env.js';

/**
 * Everything about the HTTP layer that is not a module: used by `main.ts` and by
 * the test harness, so tests exercise the same security headers, CORS rules,
 * versioning and validation as production.
 */
export function configureApp(app: NestExpressApplication, env: Env): void {
  // The real client IP, taking only as many `X-Forwarded-For` hops as we trust.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.disable('x-powered-by');

  app.use(requestIdMiddleware);

  // An API returns JSON, never HTML: forbid everything, and never allow framing.
  const apiHeaders = helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginResourcePolicy: { policy: 'same-site' },
    hsts: env.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
  });
  // The interactive docs page needs its own scripts and styles: relax the policy there only.
  const docsHeaders = helmet({ contentSecurityPolicy: false, hsts: false });
  app.use((req: Request, res: Response, next: NextFunction) =>
    req.path.startsWith('/api/docs') ? docsHeaders(req, res, next) : apiHeaders(req, res, next),
  );

  const allowed = new Set(env.CORS_ORIGINS);
  app.enableCors({
    // Mobile apps send no Origin header, so CORS never applies to them; for a
    // browser, only listed origins get an allow header.
    origin: (origin, callback) => callback(null, !origin || allowed.has(origin)),
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'X-Request-Id',
      'Idempotency-Key',
      'Accept-Language',
    ],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    maxAge: 600,
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(createValidationPipe());

  // JSON bodies are small by design: uploads go straight to object storage.
  app.useBodyParser('json', { limit: '256kb' });
  app.useBodyParser('urlencoded', { limit: '32kb', extended: false });

  app.enableShutdownHooks();

  if (env.swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('BLOCKS API')
      .setDescription(
        'Mobile and admin API. All routes are under /api/v1. Success: `{ data, meta? }`. Error: `{ error: { code, message, details?, requestId } }`.',
      )
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'user')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'admin')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    // Request shapes come from the validators that enforce them (see common/http/route-schemas.ts).
    enrichOpenApi(document, listRoutes(app));
    SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs-json' });
  }
}
