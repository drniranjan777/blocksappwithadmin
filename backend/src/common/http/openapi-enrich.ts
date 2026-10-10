import type { OpenAPIObject } from '@nestjs/swagger';
import type { RouteInfo } from './route-inventory.js';
import { schemaOf } from './route-schemas.js';

type Operation = {
  requestBody?: unknown;
  parameters?: Array<{ name: string; in: string }>;
};

/**
 * Fills in what Swagger cannot see by itself: the JSON body each route accepts and its query
 * parameters, taken from the validators (see `route-schemas.ts`). Without this the document lists
 * every route but shows no request shapes, which is the part a client developer needs most.
 */
export function enrichOpenApi(doc: OpenAPIObject, routes: RouteInfo[]): void {
  const byKey = new Map(routes.map((r) => [`${r.method} ${r.path}`, r]));
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const [method, raw] of Object.entries(item as Record<string, unknown>)) {
      const route = byKey.get(`${method.toUpperCase()} ${path.replace(/\{([^}]+)\}/g, ':$1')}`);
      if (!route) continue;
      const op = raw as Operation;
      if (route.body.length > 0) {
        op.requestBody = {
          required: route.body.some((f) => f.required),
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: Object.fromEntries(route.body.map((f) => [f.name, schemaOf(f)])),
                required: route.body.filter((f) => f.required).map((f) => f.name),
                additionalProperties: false,
              },
            },
          },
        };
      }
      if (route.query.length > 0) {
        const known = new Set(
          (op.parameters ?? []).filter((p) => p.in === 'query').map((p) => p.name),
        );
        op.parameters = [
          ...(op.parameters ?? []),
          ...route.query
            .filter((f) => !known.has(f.name))
            .map((f) => ({
              name: f.name,
              in: 'query',
              required: f.required,
              schema: schemaOf(f),
            })),
        ] as Operation['parameters'];
      }
    }
  }
}
