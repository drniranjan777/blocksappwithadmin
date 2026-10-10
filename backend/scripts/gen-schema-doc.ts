// Regenerates the table inventory in docs/database-schema.md from the Prisma
// schema files, so the documentation cannot drift from the real schema.
// Run with:  npm run docs:schema
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = resolve(here, '..', 'prisma', 'schema');
const docPath = resolve(here, '..', '..', 'docs', 'database-schema.md');

const START = '<!-- tables:start -->';
const END = '<!-- tables:end -->';

interface Row {
  domain: string;
  table: string;
  model: string;
  purpose: string;
  protectedFields: string[];
}

const rows: Row[] = [];

/** The first sentence of a (possibly multi-line) doc comment, without its full stop. */
function firstSentence(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const end = clean.search(/\.(\s|$)/);
  return (end < 0 ? clean : clean.slice(0, end)).trim();
}

for (const file of readdirSync(schemaDir)
  .filter((f) => f.endsWith('.prisma') && f !== 'base.prisma')
  .sort()) {
  const domain = file.replace('.prisma', '');
  const lines = readFileSync(join(schemaDir, file), 'utf8').split(/\r?\n/);

  let modelDoc: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.startsWith('///')) {
      modelDoc.push(line.replace(/^\/\/\/\s?/, ''));
      i++;
      continue;
    }
    const model = /^model\s+(\w+)\s*\{/.exec(line);
    if (!model) {
      if (!line.startsWith('//')) modelDoc = [];
      i++;
      continue;
    }

    let table = '';
    const protectedFields: string[] = [];
    let fieldDoc: string[] = [];
    for (i++; i < lines.length && !(lines[i] ?? '').startsWith('}'); i++) {
      const body = lines[i] ?? '';
      const trimmed = body.trim();
      const map = /@@map\("([^"]+)"\)/.exec(body);
      if (map) table = map[1] ?? '';
      if (trimmed.startsWith('///')) {
        fieldDoc.push(trimmed);
        continue;
      }
      const field = /^\s+([a-z]\w*)\s+[A-Z]/.exec(body);
      if (field && fieldDoc.some((d) => /ENCRYPTED|BLIND INDEX/.test(d))) {
        protectedFields.push(field[1] ?? '');
      }
      fieldDoc = [];
    }
    rows.push({
      domain,
      table,
      model: model[1] ?? '',
      purpose: firstSentence(modelDoc.join(' ')),
      protectedFields,
    });
    modelDoc = [];
    i++;
  }
}

const byDomain = new Map<string, Row[]>();
for (const r of rows) byDomain.set(r.domain, [...(byDomain.get(r.domain) ?? []), r]);

const out: string[] = [`${rows.length} tables.`, ''];
for (const [domain, list] of byDomain) {
  out.push(`### ${domain}`, '', '| Table | Purpose | Protected fields |', '|---|---|---|');
  for (const r of list) {
    const protectedList = r.protectedFields.map((s) => `\`${s}\``).join(', ');
    out.push(`| \`${r.table}\` | ${r.purpose || r.model} | ${protectedList} |`);
  }
  out.push('');
}

const doc = readFileSync(docPath, 'utf8');
const startAt = doc.indexOf(START);
const endAt = doc.indexOf(END);
if (startAt < 0 || endAt < 0) throw new Error(`markers missing in ${docPath}`);
writeFileSync(
  docPath,
  `${doc.slice(0, startAt + START.length)}\n\n${out.join('\n')}\n${doc.slice(endAt)}`,
  'utf8',
);
console.log(`documented ${rows.length} tables in ${byDomain.size} groups`);
