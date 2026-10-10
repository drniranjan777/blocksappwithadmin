import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listRoutes, type RouteInfo } from '../../src/common/http/route-inventory.js';
import { type OpenApi, renderApiDoc } from '../../scripts/lib/api-doc.js';
import { createTestApp, type TestApp } from '../support/app.js';

/**
 * The API reference (docs/api-documentation.md and docs/openapi.json) is generated from the running
 * application, and this is where. `npm run docs:api` runs this file with `WRITE_API_DOC=1`, which
 * writes the two files; without it the file only checks that the documentation is complete, so a
 * route cannot be added without a summary and a group.
 */
const docs = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs');

describe('the API reference', () => {
  let t: TestApp;
  let spec: OpenApi;
  let routes: RouteInfo[];

  beforeAll(async () => {
    t = await createTestApp({ SWAGGER_ENABLED: 'true' });
    const res = await t.http.get('/api/docs-json').expect(200);
    spec = res.body as OpenApi;
    routes = listRoutes(t.app);
  }, 240_000);
  afterAll(async () => {
    await t.close();
  });

  const operations = () =>
    Object.entries(spec.paths).flatMap(([path, item]) =>
      Object.entries(item)
        .filter(([method]) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
        .map(([method, op]) => ({ method: method.toUpperCase(), path, op })),
    );

  it('describes every route, except a short list that is left out on purpose', () => {
    const documented = new Set(
      operations().map((o) => `${o.method} ${o.path.replace(/\{([^}]+)\}/g, ':$1')}`),
    );
    const missing = routes
      .filter((r) => !documented.has(`${r.method} ${r.path}`))
      .map((r) => `${r.method} ${r.path}`);
    // Files are fetched by signed address and the mailbox is for developers: neither is an API a client builds on.
    expect(missing.sort()).toEqual([
      'DELETE /api/v1/dev/outbox',
      'GET /api/v1/dev/outbox',
      'GET /api/v1/media/f/*path',
      'GET /api/v1/media/local-download/:token',
      'PUT /api/v1/media/local-upload/:token',
    ]);
    expect(operations()).toHaveLength(routes.length - missing.length);
  });

  it('gives every route a group and a summary', () => {
    const bare = operations()
      .filter((o) => !o.op.tags?.length || !o.op.summary)
      .map((o) => `${o.method} ${o.path}`);
    expect(bare).toEqual([]);
  });

  it('shows what each route accepts, from the validators that enforce it', () => {
    const op = (method: string, path: string) =>
      operations().find((o) => o.method === method && o.path === path)?.op as {
        requestBody?: { content: Record<string, { schema: any }> };
        parameters?: Array<{ name: string; in: string; required?: boolean; schema: any }>;
      };
    const report = op('POST', '/api/v1/reports').requestBody?.content['application/json']?.schema;
    expect(Object.keys(report.properties).sort()).toEqual(
      ['category', 'description', 'evidence', 'targetId', 'targetType'].sort(),
    );
    expect(report.required.sort()).toEqual(['category', 'targetId', 'targetType']);
    expect(report.properties.targetId).toMatchObject({ type: 'string', format: 'uuid' });
    expect(report.properties.targetType.enum).toContain('POST');
    expect(report.properties.description).toMatchObject({ type: 'string', maxLength: 1000 });
    expect(report.properties.evidence).toMatchObject({ type: 'array', maxItems: 5 });
    expect(report.additionalProperties).toBe(false);

    const decision = op('POST', '/api/v1/admin/moderation/reports/{id}/decision').requestBody
      ?.content['application/json']?.schema;
    expect(decision.properties.action.enum).toContain('SUSPEND_USER');
    expect(decision.properties.notes).toMatchObject({ minLength: 3, maxLength: 1000 });
    expect(decision.required.sort()).toEqual(['action', 'policyReason']);

    // Query parameters, including those a base class contributes.
    const queue = op('GET', '/api/v1/admin/moderation/reports').parameters ?? [];
    const names = queue.filter((p) => p.in === 'query').map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining(['cursor', 'limit', 'scope', 'status', 'severity', 'overdue']),
    );
    expect(queue.find((p) => p.name === 'limit')?.schema).toMatchObject({
      type: 'integer',
      minimum: 1,
      maximum: 50,
    });
  });

  it('names the two sign-in systems', () => {
    expect(JSON.stringify(spec.components)).toContain('"user"');
    expect(JSON.stringify(spec.components)).toContain('"admin"');
  });

  it('renders a reference that says who may call each route', () => {
    const doc = renderApiDoc(spec, routes);
    expect(doc).toContain('# BLOCKS API reference');
    expect(doc).toContain('#### `POST /api/v1/reports`');
    expect(doc).toContain('## Routes outside the Swagger document');
    expect(doc).toMatch(/\*Access:\* Staff with `reports\.resolve`/);
    expect(doc).toMatch(/\*Access:\* Public/);
    expect(doc).toContain('| Body field | Type | Required | Notes |');
    expect(doc).toContain('| `policyReason` |');
    expect(doc).not.toContain('undefined');
    if (process.env['WRITE_API_DOC'] === '1') {
      mkdirSync(docs, { recursive: true });
      writeFileSync(resolve(docs, 'openapi.json'), `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
      writeFileSync(resolve(docs, 'api-documentation.md'), doc, 'utf8');
    }
  });
});
