import { defineConfig } from 'prisma/config';

// The connection string comes from the environment. It is never read from a file
// that is committed. `prisma generate` and `migrate diff --from-empty` do not
// connect, so DATABASE_URL may be absent for those.
export default defineConfig({
  schema: 'prisma/schema',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://blocks:blocks_dev@127.0.0.1:54340/blocks',
  },
});
