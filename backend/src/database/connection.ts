import type { PoolConfig } from 'pg';

/**
 * Every connection works in UTC, whatever the server or the machine's zone is.
 *
 * This is not cosmetic. Prisma's PostgreSQL driver sends timestamps as plain
 * text without an offset, and PostgreSQL reads such text in the *session* time
 * zone. On a server set to, say, IST every `expires_at` the API wrote would be
 * 5h30m off, while SQL that uses `now()` (triggers, job claims, reports) would
 * disagree with it. Pinning the session to UTC makes the two agree everywhere.
 *
 * Sent as a startup parameter, so it also holds through a pooler that does not
 * forward `SET` (PgBouncer needs `ignore_startup_parameters = options` for it;
 * see docs/deployment.md).
 */
export const SESSION_OPTIONS = '-c timezone=UTC';

export function poolConfig(connectionString: string, extra: PoolConfig = {}): PoolConfig {
  return { connectionString, options: SESSION_OPTIONS, ...extra };
}
