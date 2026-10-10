import type { RouteInfo } from '../../src/common/http/route-inventory.js';

/** Turns the application's Swagger document and route table into the API reference (docs/api-documentation.md). */

interface Schema {
  type?: string;
  format?: string;
  enum?: unknown[];
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
  $ref?: string;
  description?: string;
  oneOf?: Schema[];
  anyOf?: Schema[];
  allOf?: Schema[];
  nullable?: boolean;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}
interface Parameter {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: Schema;
}
interface Operation {
  tags?: string[];
  summary?: string;
  description?: string;
  parameters?: Parameter[];
  requestBody?: { content?: Record<string, { schema?: Schema }> };
  responses?: Record<string, { description?: string }>;
  security?: Array<Record<string, string[]>>;
}
export interface OpenApi {
  info: { title: string; version: string; description?: string };
  paths: Record<string, Record<string, Operation>>;
  components?: { schemas?: Record<string, Schema> };
}

function resolveRef(spec: OpenApi, schema: Schema | undefined): Schema | undefined {
  if (!schema?.$ref) return schema;
  const name = schema.$ref.split('/').pop() ?? '';
  return spec.components?.schemas?.[name];
}

function typeOf(spec: OpenApi, schema: Schema | undefined): string {
  const s = resolveRef(spec, schema);
  if (!s) return 'object';
  if (s.enum) return s.enum.map((v) => String(v)).join(' or ');
  if (s.type === 'array') return `${typeOf(spec, s.items)}[]`;
  if (s.oneOf || s.anyOf)
    return (s.oneOf ?? s.anyOf ?? []).map((x) => typeOf(spec, x)).join(' or ');
  const limits = [
    s.minLength !== undefined || s.maxLength !== undefined
      ? `${s.minLength ?? 0}–${s.maxLength ?? '∞'} chars`
      : '',
    s.minimum !== undefined || s.maximum !== undefined
      ? `${s.minimum ?? '−∞'}–${s.maximum ?? '∞'}`
      : '',
  ].filter(Boolean);
  return `${s.format && s.format !== 'int32' ? `${s.type} (${s.format})` : (s.type ?? 'object')}${limits.length ? ` (${limits.join(', ')})` : ''}`;
}

function cell(text: string | undefined): string {
  return (text ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

function access(r: RouteInfo | undefined, op: Operation): string {
  if (!r) return '—';
  if (r.public) return r.admin ? 'Public (staff sign-in step)' : 'Public';
  if (r.admin) {
    if (r.permissions.length)
      return `Staff with ${r.permissions.map((p) => `\`${p}\``).join(' and ')}`;
    if (r.enrolScope) return 'Staff (sign-in set-up step)';
    return 'Any signed-in staff member';
  }
  const publishes = r.publishes ? '; refused for a restricted account' : '';
  return `Signed-in person${publishes}${(op.security ?? []).length === 0 ? '' : ''}`;
}

function bodyRows(spec: OpenApi, op: Operation): string[] {
  const content = op.requestBody?.content?.['application/json']?.schema;
  const schema = resolveRef(spec, content);
  if (!schema?.properties) return [];
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties).map(([name, prop]) => {
    const p = resolveRef(spec, prop);
    return `| \`${name}\` | ${cell(typeOf(spec, prop))} | ${required.has(name) ? 'yes' : 'no'} | ${cell(p?.description ?? prop.description)} |`;
  });
}

export function renderApiDoc(spec: OpenApi, routes: RouteInfo[]): string {
  const byKey = new Map(routes.map((r) => [`${r.method} ${r.path}`, r]));
  const sections = new Map<string, string[]>();
  let count = 0;
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(item)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      const colon = path.replace(/\{([^}]+)\}/g, ':$1');
      const route = byKey.get(`${method.toUpperCase()} ${colon}`);
      const tag = op.tags?.[0] ?? 'other';
      const lines = sections.get(tag) ?? [];
      count++;
      lines.push(`#### \`${method.toUpperCase()} ${path}\``, '');
      if (op.summary) lines.push(`**${op.summary}**`, '');
      if (op.description) lines.push(op.description, '');
      lines.push(`*Access:* ${access(route, op)}`, '');
      const params = op.parameters ?? [];
      if (params.length) {
        lines.push(
          '| Parameter | In | Type | Required | Notes |',
          '| --- | --- | --- | --- | --- |',
        );
        for (const p of params) {
          lines.push(
            `| \`${p.name}\` | ${p.in} | ${cell(typeOf(spec, p.schema))} | ${p.required ? 'yes' : 'no'} | ${cell(p.description)} |`,
          );
        }
        lines.push('');
      }
      const rows = bodyRows(spec, op);
      if (rows.length) {
        lines.push(
          '| Body field | Type | Required | Notes |',
          '| --- | --- | --- | --- |',
          ...rows,
          '',
        );
      }
      const codes = Object.keys(op.responses ?? {});
      if (codes.length) lines.push(`*Answers:* ${codes.map((c) => `\`${c}\``).join(', ')}`, '');
      sections.set(tag, lines);
    }
  }
  const tags = [...sections.keys()].sort((a, b) => {
    const admin = (t: string) => (t.startsWith('admin') ? 1 : 0);
    return admin(a) - admin(b) || a.localeCompare(b);
  });

  const out: string[] = [
    '# BLOCKS API reference',
    '',
    '> Generated by `npm run docs:api` from the running application: its route table and its Swagger',
    '> document. **Do not edit by hand**; change the code and regenerate. The machine-readable version is',
    '> [`openapi.json`](openapi.json); a running server also serves it at `/api/docs-json` and a browsable',
    '> version at `/api/docs` (development and staging only: production serves neither unless asked to).',
    '',
    `${count} operations, ${tags.length} groups. Version ${spec.info.version}.`,
    '',
    '## How the API behaves',
    '',
    '* **Base path** `/api/v1`. JSON in, JSON out.',
    '* **Success** `{ "data": ..., "meta": { "nextCursor", "hasMore" } }` (`meta` on lists only).',
    '* **Failure** `{ "error": { "code", "message", "details?", "requestId" } }`. `code` is stable and meant for programs; `message` is for people and may change. `details` is a list of `{ field, reasons[] }` for a validation failure, or an object for a few specific refusals.',
    '* **Lists** are cursor-paginated: pass `cursor` from the previous `meta.nextCursor`, and `limit` (1 to 50). There is no page number.',
    '* **Two sign-in systems that never mix.** App users (`Authorization: Bearer <user token>`) use everything outside `/api/v1/admin`. Staff (`Authorization: Bearer <staff token>`, from `/api/v1/admin/auth/...`) use `/api/v1/admin`. A token of one kind is meaningless to the other.',
    '* **Staff permissions** are checked on every request from the database. A route lists the permissions it needs; a route that lists none and is not an own-account route is refused.',
    '* **Retries.** Creating things accepts an `Idempotency-Key` header: the same key and body replays the first answer instead of doing it twice.',
    '* **Rate limits** answer `429 RATE_LIMITED` with `Retry-After`. A busy database answers `503` with `Retry-After`.',
    '* **Restricted accounts** can sign in and read but are refused (`403 ACCOUNT_RESTRICTED`) on routes marked as publishing.',
    '',
    '## Contents',
    '',
    ...tags.map(
      (t) =>
        `* [${t}](#${t.toLowerCase().replace(/[^a-z0-9]+/g, '-')}) (${(sections.get(t) ?? []).filter((l) => l.startsWith('####')).length})`,
    ),
    '',
  ];
  for (const tag of tags) {
    out.push(`## ${tag}`, '', ...(sections.get(tag) ?? []));
  }
  // Routes the application serves that are deliberately left out of the Swagger document.
  const listed = new Set<string>();
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of Object.keys(item)) {
      listed.add(`${method.toUpperCase()} ${path.replace(/\{([^}]+)\}/g, ':$1')}`);
    }
  }
  const unlisted = routes.filter((r) => !listed.has(`${r.method} ${r.path}`));
  if (unlisted.length) {
    out.push(
      '## Routes outside the Swagger document',
      '',
      'Served by the application but kept out of the Swagger document on purpose: file delivery by signed link, and the development-only mailbox.',
      '',
      '| Route | Access |',
      '| --- | --- |',
      ...unlisted.map((r) => `| \`${r.method} ${r.path}\` | ${access(r, {})} |`),
      '',
    );
  }
  return `${out.join('\n')}\n`;
}
