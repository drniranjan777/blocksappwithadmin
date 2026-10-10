import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '../../src/generated/prisma/client.js';

const rand = (): string => randomBytes(4).toString('hex');

/** An app user with a profile. Credentials are placeholders: these rows exist
 *  to exercise the schema, not authentication. */
export async function createUser(
  prisma: PrismaClient,
  overrides: {
    username?: string;
    email?: string | null;
    phone?: string | null;
  } = {},
) {
  const suffix = rand();
  return prisma.user.create({
    data: {
      username: overrides.username ?? `user_${suffix}`,
      email: overrides.email === undefined ? `user_${suffix}@example.test` : overrides.email,
      phone: overrides.phone ?? null,
      passwordHash: '$argon2id$placeholder',
      profile: { create: { displayName: `User ${suffix}` } },
    },
  });
}

export async function createAdmin(prisma: PrismaClient, email?: string) {
  return prisma.adminUser.create({
    data: {
      email: email ?? `admin_${rand()}@example.test`,
      name: 'Test Admin',
      passwordHash: '$argon2id$placeholder',
      status: 'ACTIVE',
    },
  });
}

export async function createReel(prisma: PrismaClient, authorId: string) {
  return prisma.reel.create({
    data: { authorId, caption: 'test reel', durationMs: 15_000 },
  });
}

export async function createPost(prisma: PrismaClient, authorId: string) {
  return prisma.post.create({ data: { authorId, caption: 'test post' } });
}
