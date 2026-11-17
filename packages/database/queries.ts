/**
 * SQL queries for PostgreSQL database operations.
 * Separated from business logic and database client code for maintainability.
 */

// ==========================================
// Schema initialization & migrations
// ==========================================

export const ENSURE_SCHEMA_SQL = `
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entry_status') THEN
      CREATE TYPE entry_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
    END IF;
  END $$;

  CREATE TABLE IF NOT EXISTS site_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    website_name TEXT NOT NULL DEFAULT '',
    website_url TEXT NOT NULL,
    website_short_description TEXT NOT NULL DEFAULT '',
    is_updated_latest BOOLEAN NOT NULL DEFAULT FALSE,
    llms_txt_storage TEXT,
    llms_full_txt_storage TEXT,
    status entry_status NOT NULL DEFAULT 'PENDING',
    error_message TEXT,
    error_code TEXT,
    is_scheduled_update BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  ALTER TABLE site_entries ADD COLUMN IF NOT EXISTS error_message TEXT;
  ALTER TABLE site_entries ADD COLUMN IF NOT EXISTS error_code TEXT;
  ALTER TABLE site_entries ADD COLUMN IF NOT EXISTS is_scheduled_update BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE site_entries DROP CONSTRAINT IF EXISTS site_entries_website_url_key;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_site_entries_completed_url ON site_entries (website_url) WHERE status = 'COMPLETED';

  CREATE TABLE IF NOT EXISTS site_cadence (
    site_id UUID PRIMARY KEY REFERENCES site_entries(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    site_category TEXT,
    check_interval_hours INT NOT NULL DEFAULT 24,
    unchanged_streak INT NOT NULL DEFAULT 0,
    etag TEXT,
    last_modified TEXT,
    last_content_hash TEXT,
    last_checked_at TIMESTAMPTZ,
    next_check_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
    status TEXT NOT NULL DEFAULT 'idle'
  );

  CREATE INDEX IF NOT EXISTS idx_site_cadence_due ON site_cadence (next_check_at) WHERE status = 'idle';

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

  CREATE INDEX IF NOT EXISTS idx_background_jobs_queue ON background_jobs (status, created_at) WHERE status = 'QUEUED';
  CREATE INDEX IF NOT EXISTS idx_background_jobs_dlq ON background_jobs (status, failed_at) WHERE status = 'DEAD_LETTER';

  CREATE TABLE IF NOT EXISTS storage_files (
    rel_path TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

export const UPSERT_SEED_ENTRY_SQL = `
  INSERT INTO site_entries (
    id, website_name, website_url, website_short_description,
    is_updated_latest, llms_txt_storage, llms_full_txt_storage,
    status, created_at, updated_at
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  ON CONFLICT (id) DO UPDATE SET
    website_name = EXCLUDED.website_name,
    website_short_description = EXCLUDED.website_short_description,
    is_updated_latest = EXCLUDED.is_updated_latest,
    llms_txt_storage = EXCLUDED.llms_txt_storage,
    llms_full_txt_storage = EXCLUDED.llms_full_txt_storage,
    status = EXCLUDED.status,
    updated_at = EXCLUDED.updated_at
`;

export const RECOVER_STUCK_PROCESSING_SQL = `
  DELETE FROM site_entries a USING site_entries b
  WHERE a.created_at > b.created_at
    AND a.website_url = b.website_url
    AND a.status IN ('PENDING', 'PROCESSING')
    AND b.status IN ('PENDING', 'PROCESSING');
  UPDATE site_entries SET status = 'PENDING', is_scheduled_update = FALSE, updated_at = NOW() WHERE status = 'PROCESSING';
  UPDATE background_jobs SET status = 'QUEUED', updated_at = NOW() WHERE status = 'PROCESSING';
  INSERT INTO background_jobs (entry_id, website_url, is_scheduled_update, status, attempts, max_attempts, created_at, updated_at)
  SELECT se.id, se.website_url, FALSE, 'QUEUED', 0, 3, NOW(), NOW()
  FROM site_entries se
  WHERE se.status = 'PENDING'
    AND NOT EXISTS (
      SELECT 1 FROM background_jobs bj
      WHERE bj.entry_id = se.id AND bj.status IN ('QUEUED', 'PROCESSING')
    );
`;

// ==========================================
// Site Entries queries
// ==========================================

export const SELECT_ALL_ENTRIES_SQL =
  'SELECT id, website_name, website_url, website_short_description, is_updated_latest, llms_txt_storage, llms_full_txt_storage, status, error_message, error_code, is_scheduled_update, created_at, updated_at FROM site_entries ORDER BY updated_at DESC';

export const SEARCH_ENTRIES_FTS_SQL = `
  SELECT id, website_name, website_url, website_short_description,
         is_updated_latest, llms_txt_storage, llms_full_txt_storage,
         status, created_at, updated_at,
         ts_rank(
           to_tsvector('english', coalesce(website_name, '') || ' ' || coalesce(website_short_description, '') || ' ' || coalesce(website_url, '')),
           plainto_tsquery('english', $1)
         ) as rank,
         count(*) OVER() AS full_count
  FROM site_entries
  WHERE to_tsvector('english', coalesce(website_name, '') || ' ' || coalesce(website_short_description, '') || ' ' || coalesce(website_url, '')) @@ plainto_tsquery('english', $1)
     OR website_name ILIKE ('%' || $1 || '%')
     OR website_short_description ILIKE ('%' || $1 || '%')
     OR website_url ILIKE ('%' || $1 || '%')
  ORDER BY rank DESC, updated_at DESC
  LIMIT $2 OFFSET $3
`;

export const SELECT_ENTRY_BY_ID_SQL = 'SELECT * FROM site_entries WHERE id = $1';

export const SELECT_ENTRY_BY_URL_SQL = `
  SELECT * FROM site_entries 
  WHERE lower(rtrim(website_url, '/')) = $1 
  ORDER BY (status = 'COMPLETED') DESC, created_at DESC
  LIMIT 1
`;

export const INSERT_ENTRY_SQL = `
  INSERT INTO site_entries (website_name, website_url, website_short_description, llms_txt_storage, llms_full_txt_storage)
  VALUES ($1, $2, $3, $4, $5)
  RETURNING *
`;

export function buildUpdateEntrySql(sets: string[], idParamIndex: number): string {
  return `UPDATE site_entries SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idParamIndex} RETURNING *`;
}

export const SELECT_STALE_ENTRIES_SQL = 'SELECT * FROM site_entries WHERE is_updated_latest = false';

export const INSERT_DUPLICATE_FAILED_ENTRY_SQL = `
  INSERT INTO site_entries (
    website_name, website_url, website_short_description,
    llms_txt_storage, llms_full_txt_storage, status, is_updated_latest,
    error_message, error_code, is_scheduled_update
  ) VALUES ($1, $2, $3, $4, $5, 'FAILED', FALSE, $6, $7, FALSE)
  RETURNING *
`;

export const INSERT_ENTRY_TRANSACTION_SQL = `
  INSERT INTO site_entries (
    website_name, website_url, website_short_description,
    llms_txt_storage, llms_full_txt_storage, status, is_updated_latest
  ) VALUES ($1, $2, $3, $4, $5, 'PENDING', FALSE)
  RETURNING *
`;

// ==========================================
// Site Cadence queries
// ==========================================

export const SELECT_CADENCE_BY_SITE_ID_SQL = 'SELECT * FROM site_cadence WHERE site_id = $1';

export const INSERT_CADENCE_TRANSACTION_SQL = `
  INSERT INTO site_cadence (site_id, url, site_category, check_interval_hours, next_check_at, status)
  VALUES ($1, $2, $3, $4, NOW() + ($4 || ' hours')::INTERVAL, 'idle')
  RETURNING *
`;

export const CLAIM_DUE_CADENCE_SITES_SQL = `
  UPDATE site_cadence
  SET status = 'queued'
  WHERE site_id IN (
    SELECT sc.site_id FROM site_cadence sc
    INNER JOIN site_entries se ON se.id = sc.site_id
    WHERE sc.next_check_at <= NOW() AND sc.status = 'idle' AND se.status = 'COMPLETED'
    ORDER BY sc.next_check_at ASC
    LIMIT $1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
`;

export const UPDATE_CADENCE_RESULT_SQL = `
  UPDATE site_cadence
  SET check_interval_hours = $1,
      unchanged_streak = $2,
      etag = COALESCE($3, etag),
      last_modified = COALESCE($4, last_modified),
      last_content_hash = COALESCE($5, last_content_hash),
      site_category = COALESCE($6, site_category),
      last_checked_at = NOW(),
      next_check_at = $7,
      status = 'idle'
  WHERE site_id = $8;
`;

// ==========================================
// Background Jobs queries
// ==========================================

export const INSERT_BACKGROUND_JOB_SQL = `
  INSERT INTO background_jobs (
    entry_id, website_url, is_scheduled_update, status, attempts, max_attempts, created_at, updated_at
  ) VALUES ($1, $2, $3, 'QUEUED', 0, $4, NOW(), NOW())
  RETURNING *
`;

export const CLAIM_NEXT_BACKGROUND_JOB_SQL = `
  UPDATE background_jobs
  SET status = 'PROCESSING',
      attempts = attempts + 1,
      updated_at = NOW()
  WHERE id = (
    SELECT id FROM background_jobs
    WHERE status = 'QUEUED'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
`;

export const COMPLETE_BACKGROUND_JOB_SQL = `
  UPDATE background_jobs
  SET status = 'COMPLETED',
      updated_at = NOW()
  WHERE id = $1
`;

export const SELECT_JOB_ATTEMPTS_SQL = 'SELECT attempts, max_attempts FROM background_jobs WHERE id = $1';

export const FAIL_JOB_DEAD_LETTER_SQL = `
  UPDATE background_jobs
  SET status = 'DEAD_LETTER',
      attempts = $3,
      last_error = $2,
      failed_at = NOW(),
      updated_at = NOW()
  WHERE id = $1
  RETURNING *
`;

export const FAIL_JOB_RETRY_SQL = `
  UPDATE background_jobs
  SET status = 'QUEUED',
      attempts = $3,
      last_error = $2,
      updated_at = NOW()
  WHERE id = $1
  RETURNING *
`;

export const SELECT_DEAD_LETTER_JOBS_SQL =
  "SELECT * FROM background_jobs WHERE status = 'DEAD_LETTER' ORDER BY failed_at DESC";

export const SELECT_BACKGROUND_JOBS_BY_STATUS_SQL =
  'SELECT * FROM background_jobs WHERE status = $1 ORDER BY created_at DESC';

export const SELECT_ALL_BACKGROUND_JOBS_SQL = 'SELECT * FROM background_jobs ORDER BY created_at DESC';

export const RESET_PROCESSING_JOBS_SQL =
  "UPDATE background_jobs SET status = 'QUEUED', updated_at = NOW() WHERE status = 'PROCESSING'";

export const DELETE_DEAD_LETTER_JOBS_SQL = "DELETE FROM background_jobs WHERE status = 'DEAD_LETTER'";

export const REPROCESS_DEAD_LETTER_JOBS_SQL =
  "UPDATE background_jobs SET status = 'QUEUED', attempts = 0, last_error = null, failed_at = null, updated_at = NOW() WHERE status = 'DEAD_LETTER' RETURNING id";

// ==========================================
// Storage Files queries
// ==========================================

export const UPSERT_STORAGE_FILE_SQL = `
  INSERT INTO storage_files (rel_path, content, updated_at)
  VALUES ($1, $2, NOW())
  ON CONFLICT (rel_path) DO UPDATE SET
    content = EXCLUDED.content,
    updated_at = NOW()
`;

export const SELECT_STORAGE_FILE_SQL = 'SELECT content FROM storage_files WHERE rel_path = $1 LIMIT 1';

export const LIST_STORAGE_FILES_SQL = 'SELECT rel_path, content FROM storage_files ORDER BY updated_at DESC';

