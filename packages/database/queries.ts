/**
 * SQL queries for PostgreSQL database operations.
 * Separated from business logic and database client code for maintainability.
 */

// ==========================================
// Schema initialization & migrations
// ==========================================

/**
 * Ensures required database schema: enums, tables, and partial indexes exist on startup.
 */
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
`;

/**
 * Inserts default seed rows into site_entries, updating fields if the ID already exists.
 * Params: $1: id, $2: website_name, $3: website_url, $4: short_desc, $5: is_updated,
 *         $6: llms_txt, $7: llms_full_txt, $8: status, $9: created_at, $10: updated_at
 */
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

/**
 * Startup recovery: deletes duplicate unconfirmed entries, recovers stuck PROCESSING
 * records back to PENDING/QUEUED, and backfills missing background jobs.
 */
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

/**
 * Selects all directory entries ordered by most recently updated.
 */
export const SELECT_ALL_ENTRIES_SQL =
  'SELECT id, website_name, website_url, website_short_description, is_updated_latest, llms_txt_storage, llms_full_txt_storage, status, error_message, error_code, is_scheduled_update, created_at, updated_at FROM site_entries ORDER BY updated_at DESC';

/**
 * Full-text search with relevance ranking (ts_rank) and pagination over name, description, and URL.
 * Params: $1: search_query, $2: limit, $3: offset
 */
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

/**
 * Selects a single directory entry by UUID primary key.
 * Params: $1: entry_id
 */
export const SELECT_ENTRY_BY_ID_SQL = 'SELECT * FROM site_entries WHERE id = $1';

/**
 * Selects an entry by normalized website URL, prioritizing COMPLETED status over in-progress entries.
 * Params: $1: normalized_website_url
 */
export const SELECT_ENTRY_BY_URL_SQL = `
  SELECT * FROM site_entries 
  WHERE lower(rtrim(website_url, '/')) = $1 
  ORDER BY (status = 'COMPLETED') DESC, created_at DESC
  LIMIT 1
`;

/**
 * Inserts a new directory entry and returns the inserted row.
 * Params: $1: name, $2: url, $3: description, $4: llms_txt_storage, $5: llms_full_txt_storage
 */
export const INSERT_ENTRY_SQL = `
  INSERT INTO site_entries (website_name, website_url, website_short_description, llms_txt_storage, llms_full_txt_storage)
  VALUES ($1, $2, $3, $4, $5)
  RETURNING *
`;

/**
 * Builds dynamic parameterized UPDATE query for partial entry updates.
 */
export function buildUpdateEntrySql(sets: string[], idParamIndex: number): string {
  return `UPDATE site_entries SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idParamIndex} RETURNING *`;
}

/**
 * Finds all entries where is_updated_latest is false (pending cadence refresh).
 */
export const SELECT_STALE_ENTRIES_SQL = 'SELECT * FROM site_entries WHERE is_updated_latest = false';

/**
 * Records a user submission that failed validation or conflict checks with FAILED status and error tags.
 * Params: $1: name, $2: url, $3: description, $4: llms_txt, $5: llms_full_txt, $6: error_msg, $7: error_code
 */
export const INSERT_DUPLICATE_FAILED_ENTRY_SQL = `
  INSERT INTO site_entries (
    website_name, website_url, website_short_description,
    llms_txt_storage, llms_full_txt_storage, status, is_updated_latest,
    error_message, error_code, is_scheduled_update
  ) VALUES ($1, $2, $3, $4, $5, 'FAILED', FALSE, $6, $7, FALSE)
  RETURNING *
`;

/**
 * Inserts a newly submitted entry in PENDING status as part of the initial submission transaction.
 * Params: $1: name, $2: url, $3: description, $4: llms_txt, $5: llms_full_txt
 */
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

/**
 * Selects the cadence tracking row for a site entry.
 * Params: $1: site_id
 */
export const SELECT_CADENCE_BY_SITE_ID_SQL = 'SELECT * FROM site_cadence WHERE site_id = $1';

/**
 * Inserts an initial cadence schedule row for a newly created entry in the same transaction.
 * Params: $1: site_id, $2: url, $3: site_category, $4: check_interval_hours
 */
export const INSERT_CADENCE_TRANSACTION_SQL = `
  INSERT INTO site_cadence (site_id, url, site_category, check_interval_hours, next_check_at, status)
  VALUES ($1, $2, $3, $4, NOW() + ($4 * INTERVAL '1 hour'), 'idle')
  RETURNING *
`;

/**
 * Atomically claims due cadence rows up to batch limit using SKIP LOCKED to avoid multi-worker race conditions.
 * Params: $1: batch_limit
 */
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

/**
 * Updates cadence parameters, HTTP caching headers (ETag, Last-Modified), and next check time after a probe.
 * Params: $1: interval_hours, $2: streak, $3: etag, $4: last_modified, $5: content_hash,
 *         $6: site_category, $7: next_check_at, $8: site_id
 */
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

/**
 * Enqueues a new asynchronous generation task into the background_jobs queue table.
 * Params: $1: entry_id, $2: website_url, $3: is_scheduled_update, $4: max_attempts
 */
export const INSERT_BACKGROUND_JOB_SQL = `
  INSERT INTO background_jobs (
    entry_id, website_url, is_scheduled_update, status, attempts, max_attempts, created_at, updated_at
  ) VALUES ($1, $2, $3, 'QUEUED', 0, $4, NOW(), NOW())
  RETURNING *
`;

/**
 * Atomically claims the oldest QUEUED background job using SKIP LOCKED and transitions it to PROCESSING.
 */
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

/**
 * Marks a completed background job.
 * Params: $1: job_id
 */
export const COMPLETE_BACKGROUND_JOB_SQL = `
  UPDATE background_jobs
  SET status = 'COMPLETED',
      updated_at = NOW()
  WHERE id = $1
`;

/**
 * Retrieves current and max attempts for a background job.
 * Params: $1: job_id
 */
export const SELECT_JOB_ATTEMPTS_SQL = 'SELECT attempts, max_attempts FROM background_jobs WHERE id = $1';

/**
 * Moves an exhausted job to DEAD_LETTER (DLQ) after exceeding max_attempts.
 * Params: $1: job_id, $2: error_message, $3: attempts
 */
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

/**
 * Re-queues a failed job for retry when attempts < max_attempts.
 * Params: $1: job_id, $2: error_message, $3: attempts
 */
export const FAIL_JOB_RETRY_SQL = `
  UPDATE background_jobs
  SET status = 'QUEUED',
      attempts = $3,
      last_error = $2,
      updated_at = NOW()
  WHERE id = $1
  RETURNING *
`;

/**
 * Retrieves all jobs in the Dead Letter Queue ordered by most recently failed.
 */
export const SELECT_DEAD_LETTER_JOBS_SQL =
  "SELECT * FROM background_jobs WHERE status = 'DEAD_LETTER' ORDER BY failed_at DESC";

/**
 * Selects background jobs filtered by status.
 * Params: $1: status
 */
export const SELECT_BACKGROUND_JOBS_BY_STATUS_SQL =
  'SELECT * FROM background_jobs WHERE status = $1 ORDER BY created_at DESC';

/**
 * Selects all background jobs ordered by creation time.
 */
export const SELECT_ALL_BACKGROUND_JOBS_SQL = 'SELECT * FROM background_jobs ORDER BY created_at DESC';

/**
 * Resets any active/processing jobs back to QUEUED when bouncing the queue.
 */
export const RESET_PROCESSING_JOBS_SQL =
  "UPDATE background_jobs SET status = 'QUEUED', updated_at = NOW() WHERE status = 'PROCESSING'";

/**
 * Purges all dead letter queue jobs permanently.
 */
export const DELETE_DEAD_LETTER_JOBS_SQL = "DELETE FROM background_jobs WHERE status = 'DEAD_LETTER'";

/**
 * Re-enqueues all dead letter queue jobs for reprocessing, clearing errors and resetting attempt counters.
 */
export const REPROCESS_DEAD_LETTER_JOBS_SQL =
  "UPDATE background_jobs SET status = 'QUEUED', attempts = 0, last_error = null, failed_at = null, updated_at = NOW() WHERE status = 'DEAD_LETTER' RETURNING id";
