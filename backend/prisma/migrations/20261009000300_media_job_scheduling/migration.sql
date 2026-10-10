-- Media jobs can be delayed (retry back-off), carry parameters, and include assembling a reel.
ALTER TYPE "media_job_type" ADD VALUE IF NOT EXISTS 'COMPOSE';

ALTER TABLE "media_jobs"
  ADD COLUMN "run_after" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "payload" JSONB;

CREATE INDEX "media_jobs_status_run_after_idx" ON "media_jobs"("status", "run_after");
