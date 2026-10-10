-- Extensions the application relies on. Both are "trusted" extensions in
-- PostgreSQL 13+, so the database owner can create them without superuser rights.

-- Trigram indexes for fast, typo-tolerant user and hashtag search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- gen_random_uuid() on PostgreSQL versions before 13, and digest() for checks.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Work in UTC for every client of this database (psql, reports, other services),
-- not only the API, which also sets it on each connection. A time written by one
-- zone and read by another is silently wrong by hours. Skipped, with a notice,
-- where the migration user does not own the database.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'UTC');
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Could not set the database time zone to UTC; set it manually (see docs/deployment.md).';
END
$$;
