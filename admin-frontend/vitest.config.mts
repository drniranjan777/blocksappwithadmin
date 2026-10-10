import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Two projects:
//   unit        server code and pure logic, in Node (the sign-in routes, the cookie rules, the helpers)
//   components  React components, in a simulated browser
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': here('./src'),
      'server-only': here('./tests/stubs/server-only.ts'),
    },
  },
  test: {
    projects: [
      { extends: true, test: { name: 'unit', environment: 'node', include: ['tests/unit/**/*.test.ts'] } },
      {
        extends: true,
        test: {
          name: 'components',
          environment: 'jsdom',
          include: ['tests/components/**/*.test.tsx'],
          setupFiles: ['tests/setup-dom.ts'],
        },
      },
    ],
  },
});
