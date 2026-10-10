import { defineConfig } from 'vitest/config';

// Two projects:
//   unit         pure logic, no I/O: `npm test`
//   integration  talks to a real PostgreSQL (and Redis when available):
//                `npm run test:int`. A global setup starts PostgreSQL once and
//                migrates a template database; every test file clones it.
export default defineConfig({
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts', 'tests/**/*.spec.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/**/*.int-spec.ts'],
          globalSetup: ['tests/support/global-setup.ts'],
          testTimeout: 120_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
