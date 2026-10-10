import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * "Trojan Source" (CVE-2021-42574): invisible bidirectional and zero-width
 * characters in source code can make it read differently from what it does, and
 * hide characters from a reviewer. None belongs in this repository's code. Where
 * the program needs one (the text cleaners, tests of them), it is written as an
 * explicit escape sequence that a reader can see.
 *
 * The ranges are built from code points so that this file contains none itself.
 */
const FORBIDDEN: Array<[number, number]> = [
  [0x200b, 0x200f], // zero-width space, joiners, direction marks
  [0x202a, 0x202e], // embedding and override controls
  [0x2060, 0x2064], // word joiner and invisible operators
  [0x2066, 0x2069], // isolate controls
  [0xfeff, 0xfeff], // byte order mark / zero-width no-break space
];

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SKIP = new Set(['node_modules', 'generated', 'dist', '.devdb', '.git']);
const EXTENSIONS = /\.(ts|js|mjs|json|sql|prisma|md)$/;

function* files(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (EXTENSIONS.test(entry.name)) yield path;
  }
}

describe('source hygiene', () => {
  it('has no invisible bidirectional or zero-width characters in any source file', () => {
    const offenders: string[] = [];
    for (const file of files(root)) {
      const text = readFileSync(file, 'utf8');
      let line = 1;
      for (const ch of text) {
        const cp = ch.codePointAt(0) as number;
        if (ch === '\n') line++;
        if (FORBIDDEN.some(([a, b]) => cp >= a && cp <= b)) {
          offenders.push(
            `${relative(root, file)}:${line} U+${cp.toString(16).toUpperCase().padStart(4, '0')}`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('actually looks at the source tree', () => {
    const seen = [...files(root)].map((f) => relative(root, f).replaceAll('\\', '/'));
    expect(seen).toContain('src/app.module.ts');
    expect(seen).toContain('package.json');
    expect(seen.length).toBeGreaterThan(100);
  });
});
