-- Migration: Add background_jobs table for queue and DLQ processing using SKIP LOCKED.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_status') THEN
    CREATE TYPE job_status AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS background_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES site_entries(id) ON DELETE CASCADE,
  website_url TEXT NOT NULL,
  is_scheduled_update BOOLEAN NOT NULL DEFAULT FALSE,
  status job_status NOT NULL DEFAULT 'QUEUED',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  last_error TEXT,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_queue 
ON background_jobs (status, created_at) 
WHERE status = 'QUEUED';

CREATE INDEX IF NOT EXISTS idx_background_jobs_dlq
ON background_jobs (status, failed_at)
WHERE status = 'DEAD_LETTER';

