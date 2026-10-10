// Regenerates docs/api-documentation.md and docs/openapi.json from the running application, so the
// documentation cannot drift from the code. Run with:  npm run docs:api
//
// The generator is a test (tests/docs/api-doc.int-spec.ts) because it needs the whole application
// booted against a real database, which is exactly what the integration test harness provides. This
// wrapper only switches its write mode on, in a way that works on every operating system.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const result = spawnSync(
  process.execPath,
  [
    resolve(root, 'node_modules', 'vitest', 'vitest.mjs'),
    'run',
    '--project',
    'integration',
    'tests/docs/api-doc.int-spec.ts',
  ],
  { cwd: root, stdio: 'inherit', env: { ...process.env, WRITE_API_DOC: '1' } },
);
process.exit(result.status ?? 1);
