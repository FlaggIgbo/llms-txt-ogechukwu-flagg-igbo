import pg from 'pg';
import {
  type SiteEntry,
  type CreateSiteEntryRequest,
  type SiteCadence,
  type BackgroundJob,
  type GenerateJobPayload,
  type JobStatus,
  EntryStatus,
  EntryErrorCode,
  SiteCategory,
  ApiErrorCode,
  ApiErrorMessage,
  MOCK_SEED_ENTRIES,
} from '@llmstxt/shared-types';
import {
  ENSURE_SCHEMA_SQL,
  UPSERT_SEED_ENTRY_SQL,
  RECOVER_STUCK_PROCESSING_SQL,
  SELECT_ALL_ENTRIES_SQL,
  SEARCH_ENTRIES_FTS_SQL,
  SELECT_ENTRY_BY_ID_SQL,
  SELECT_ENTRY_BY_URL_SQL,
  buildUpdateEntrySql,
  INSERT_ENTRY_TRANSACTION_SQL,
  SELECT_CADENCE_BY_SITE_ID_SQL,
  INSERT_CADENCE_TRANSACTION_SQL,
  CLAIM_DUE_CADENCE_SITES_SQL,
  UPDATE_CADENCE_RESULT_SQL,
  INSERT_BACKGROUND_JOB_SQL,
  CLAIM_NEXT_BACKGROUND_JOB_SQL,
  COMPLETE_BACKGROUND_JOB_SQL,
  SELECT_JOB_ATTEMPTS_SQL,
  FAIL_JOB_DEAD_LETTER_SQL,
  FAIL_JOB_RETRY_SQL,
  SELECT_DEAD_LETTER_JOBS_SQL,
  RESET_PROCESSING_JOBS_SQL,
  DELETE_DEAD_LETTER_JOBS_SQL,
  BOUNCE_RESET_BACKGROUND_JOBS_SQL,
  BOUNCE_RESET_FAILED_ENTRIES_SQL,
  BOUNCE_REENQUEUE_PENDING_ENTRIES_SQL,
} from './queries.js';

export { MOCK_SEED_ENTRIES };

// Database connection URL. Always defaults to Docker PostgreSQL.
const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/llmstxt_directory';

// Convert a raw DB row into a BackgroundJob.
function formatJobRow(row: any): BackgroundJob {
  return {
    id: String(row.id),
    entry_id: String(row.entry_id),
    website_url: String(row.website_url),
    is_scheduled_update: Boolean(row.is_scheduled_update),
    status: row.status as JobStatus,
    attempts: Number(row.attempts || 0),
    max_attempts: Number(row.max_attempts || 3),
    last_error: row.last_error || null,
    failed_at: row.failed_at ? new Date(row.failed_at).toISOString() : null,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

  // Convert a raw DB row into a SiteCadence.
function formatCadenceRow(row: any): SiteCadence {
  return {
    site_id: row.site_id,
    url: row.url,
    site_category: row.site_category || null,
    check_interval_hours: Number(row.check_interval_hours || 24),
    unchanged_streak: Number(row.unchanged_streak || 0),
    etag: row.etag || null,
    last_modified: row.last_modified || null,
    last_content_hash: row.last_content_hash || null,
    last_checked_at: row.last_checked_at ? new Date(row.last_checked_at).toISOString() : null,
    next_check_at: row.next_check_at ? new Date(row.next_check_at).toISOString() : new Date().toISOString(),
    status: row.status || 'idle',
  };
}

// Remove trailing slashes from a URL.
function trimTrailingSlashes(url: string): string {
  let clean = url;
  while (clean.endsWith('/')) {
    clean = clean.slice(0, -1);
  }
  return clean;
}

// Convert a raw DB row into a SiteEntry.
function formatRow(row: any): SiteEntry {
  const createdAt = row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString();
  const updatedAt = row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString();

  let llmTxt: string | null = null;
  if (row.llm_txt) {
    llmTxt = row.llm_txt;
  } else if (row.llms_txt_storage) {
    llmTxt = row.llms_txt_storage;
  } else if (row.website_url) {
    llmTxt = `${trimTrailingSlashes(String(row.website_url))}/llms.txt`;
  }

  const errorCode =
    (row.error_code as EntryErrorCode) ||
    (row.error_message?.toLowerCase().includes('already exists')
      ? EntryErrorCode.DUPLICATE_URL
      : null);

  return {
    ...row,
    error_message: row.error_message || null,
    error_code: errorCode,
    is_scheduled_update: Boolean(row.is_scheduled_update),
    created_at: createdAt,
    updated_at: updatedAt,
    llm_txt: llmTxt,
  };
}

// Error thrown when submitting a URL that already exists with COMPLETED status.
export class DuplicateEntryError extends Error {
  readonly code = ApiErrorCode.CONFLICT;
  constructor(message: string = ApiErrorMessage.DUPLICATE_URL) {
    super(message);
    this.name = 'DuplicateEntryError';
  }
}

// Handles all PostgreSQL queries directly against Docker or production PostgreSQL.
export class DatabaseClient {
  private pool: pg.Pool | null = null;
  private hasEnsuredSeed = false;

  // Create or reuse the DB connection pool.
  private getPool(): pg.Pool {
    if (!this.pool) {
      // Local Docker PostgreSQL has no SSL by default
      const isRemote = !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1');
      this.pool = new pg.Pool({
        connectionString,
        ssl: isRemote
          ? {
            rejectUnauthorized: false,
          }
          : undefined,
        allowExitOnIdle: true,
      });
    }
    return this.pool;
  }

  // Insert seed rows and ensure schema tables if not already done.
  async ensureDevelopmentSeed(): Promise<void> {
    if (this.hasEnsuredSeed) return;
    this.hasEnsuredSeed = true;
    try {
      const pool = this.getPool();
      await pool.query(ENSURE_SCHEMA_SQL).catch(() => { });

      for (const entry of MOCK_SEED_ENTRIES) {
        await pool.query(UPSERT_SEED_ENTRY_SQL, [
          entry.id,
          entry.website_name,
          entry.website_url,
          entry.website_short_description,
          entry.is_updated_latest,
          entry.llms_txt_storage,
          entry.llms_full_txt_storage,
          entry.status,
          entry.created_at,
          entry.updated_at,
        ]).catch(() => { });
      }

      // Recover any entries or jobs stuck in PROCESSING from a previous restart.
      await pool.query(RECOVER_STUCK_PROCESSING_SQL).catch(() => { });
    } catch {
      // Seed failure should never take down production database operations.
    }
  }

  // Get all entries sorted by newest update.
  async listEntries(): Promise<SiteEntry[]> {
    if (!this.hasEnsuredSeed) {
      await this.ensureDevelopmentSeed();
    }
    const pool = this.getPool();
    const result = await pool.query<SiteEntry>(SELECT_ALL_ENTRIES_SQL);
    return result.rows.map(formatRow);
  }

  // Search entries by text with pagination.
  async searchEntries(
    query: string,
    limit = 50,
    offset = 0
  ): Promise<{ entries: SiteEntry[]; total: number }> {
    if (!this.hasEnsuredSeed) {
      await this.ensureDevelopmentSeed();
    }
    const q = query.trim();
    const pool = this.getPool();

    if (!q) {
      const countRes = await pool.query<{ count: string }>(
        "SELECT COUNT(*) as count FROM site_entries WHERE status = 'COMPLETED'"
      );
      const total = Number(countRes.rows[0]?.count || 0);
      const result = await pool.query<SiteEntry>(
        "SELECT * FROM site_entries WHERE status = 'COMPLETED' ORDER BY updated_at DESC LIMIT $1 OFFSET $2",
        [limit, offset]
      );
      return {
        entries: result.rows.map(formatRow),
        total,
      };
    }

    const result = await pool.query(SEARCH_ENTRIES_FTS_SQL, [q, limit, offset]);
    let total = 0;
    if (result.rows.length > 0) {
      total = Number(result.rows[0].full_count);
    }

    return {
      entries: result.rows.map(formatRow),
      total,
    };
  }

  // Find one entry by ID.
  async getEntryById(id: string): Promise<SiteEntry | null> {
    const pool = this.getPool();
    const result = await pool.query<SiteEntry>(SELECT_ENTRY_BY_ID_SQL, [id]);
    if (result.rows.length === 0) {
      return null;
    }
    return formatRow(result.rows[0]);
  }

  // Find one entry by website URL (normalizing trailing slashes).
  async getEntryByUrl(url: string): Promise<SiteEntry | null> {
    if (!this.hasEnsuredSeed) {
      await this.ensureDevelopmentSeed();
    }
    const cleanUrl = trimTrailingSlashes(url.trim()).toLowerCase();
    const pool = this.getPool();
    const res = await pool.query<SiteEntry>(SELECT_ENTRY_BY_URL_SQL, [cleanUrl]);
    if (res.rows.length === 0) {
      return null;
    }
    return formatRow(res.rows[0]);
  }

  // Update fields on an existing entry.
  async updateEntry(id: string, patch: Partial<SiteEntry>): Promise<SiteEntry | null> {
    const pool = this.getPool();
    const sets: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const [key, val] of Object.entries(patch)) {
      if (val === undefined) {
        continue;
      }
      sets.push(`${key} = $${paramIndex}`);
      values.push(val);
      paramIndex += 1;
    }

    if (sets.length === 0) {
      return this.getEntryById(id);
    }

    values.push(id);
    const result = await pool.query<SiteEntry>(
      buildUpdateEntrySql(sets, paramIndex),
      values
    );

    if (result.rows.length === 0) {
      return null;
    }
    return formatRow(result.rows[0]);
  }

  // Get cadence row for a site.
  async getCadenceBySiteId(siteId: string): Promise<SiteCadence | null> {
    const pool = this.getPool();
    const res = await pool.query(SELECT_CADENCE_BY_SITE_ID_SQL, [siteId]);
    if (res.rows.length === 0) {
      return null;
    }
    return formatCadenceRow(res.rows[0]);
  }

  // Transactionally insert entry and its cadence schedule.
  async createEntryWithCadence(
    input: CreateSiteEntryRequest,
    siteCategory: SiteCategory | string = SiteCategory.API_DOCS,
    intervalHours: number = 24
  ): Promise<{ entry: SiteEntry; cadence: SiteCadence }> {
    const websiteName = input.website_name || input.product_name || '';
    const description = input.website_short_description || input.additional_notes || '';
    const llmsTxt = input.llms_txt_storage || input.llms_txt_url || input.llm_txt || null;
    const llmsFullTxt = input.llms_full_txt_storage || input.llms_full_txt_url || null;

    // Check if the URL already exists in our site_entries table with COMPLETED status.
    const existing = await this.getEntryByUrl(input.website_url);
    if (existing && existing.status === EntryStatus.COMPLETED) {
      throw new DuplicateEntryError(ApiErrorMessage.DUPLICATE_URL);
    }

    const pool = this.getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const entryRes = await client.query(INSERT_ENTRY_TRANSACTION_SQL, [
        websiteName,
        input.website_url,
        description,
        llmsTxt,
        llmsFullTxt,
      ]);
      const entry = formatRow(entryRes.rows[0]);

      const cadenceRes = await client.query(INSERT_CADENCE_TRANSACTION_SQL, [
        entry.id,
        entry.website_url,
        siteCategory,
        intervalHours,
      ]);
      const cadence = formatCadenceRow(cadenceRes.rows[0]);

      await client.query('COMMIT');
      return { entry, cadence };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Atomically claim due sites using FOR UPDATE SKIP LOCKED.
  async claimDueCadenceSites(limit: number = 50): Promise<SiteCadence[]> {
    const pool = this.getPool();
    const result = await pool.query(CLAIM_DUE_CADENCE_SITES_SQL, [limit]);
    return result.rows.map(formatCadenceRow);
  }

  // Update cadence metadata and next check time after a probe or full scrape.
  async updateCadenceResult(
    siteId: string,
    result: {
      newIntervalHours: number;
      newStreak: number;
      nextCheckAt: Date;
      etag?: string | null;
      lastModified?: string | null;
      contentHash?: string | null;
      siteCategory?: string | null;
    }
  ): Promise<void> {
    const pool = this.getPool();
    await pool.query(UPDATE_CADENCE_RESULT_SQL, [
      result.newIntervalHours,
      result.newStreak,
      result.etag ?? null,
      result.lastModified ?? null,
      result.contentHash ?? null,
      result.siteCategory ?? null,
      result.nextCheckAt.toISOString(),
      siteId,
    ]);
  }

  // Insert a new background job into the queue table.
  async createBackgroundJob(payload: GenerateJobPayload, maxAttempts: number = 3): Promise<BackgroundJob> {
    if (!this.hasEnsuredSeed) {
      await this.ensureDevelopmentSeed();
    }
    const pool = this.getPool();
    const res = await pool.query(INSERT_BACKGROUND_JOB_SQL, [
      payload.entryId,
      payload.websiteUrl,
      Boolean(payload.isScheduledUpdate),
      maxAttempts,
    ]);
    return formatJobRow(res.rows[0]);
  }

  // Atomically claim the next queued background job using SKIP LOCKED.
  async claimNextBackgroundJob(): Promise<BackgroundJob | null> {
    if (!this.hasEnsuredSeed) {
      await this.ensureDevelopmentSeed();
    }
    const pool = this.getPool();
    const res = await pool.query(CLAIM_NEXT_BACKGROUND_JOB_SQL);
    if (res.rows.length === 0) {
      return null;
    }
    return formatJobRow(res.rows[0]);
  }

  // Mark a background job as successfully completed.
  async completeBackgroundJob(jobId: string): Promise<void> {
    const pool = this.getPool();
    await pool.query(COMPLETE_BACKGROUND_JOB_SQL, [jobId]);
  }

  // Handle a failed background job: retry if attempts < max_attempts, or move to DEAD_LETTER (DLQ).
  async failBackgroundJob(
    jobId: string,
    error: string,
    currentAttempts?: number
  ): Promise<{ job: BackgroundJob; isDeadLetter: boolean }> {
    const pool = this.getPool();
    const checkRes = await pool.query(SELECT_JOB_ATTEMPTS_SQL, [jobId]);
    if (checkRes.rows.length === 0) {
      throw new Error(`Job ${jobId} not found`);
    }

    const { attempts, max_attempts } = checkRes.rows[0];
    const attemptsToUse = currentAttempts !== undefined ? currentAttempts : Number(attempts);
    const isDeadLetter = attemptsToUse >= Number(max_attempts);
    const updateSql = isDeadLetter ? FAIL_JOB_DEAD_LETTER_SQL : FAIL_JOB_RETRY_SQL;

    const updateRes = await pool.query(updateSql, [jobId, error, attemptsToUse]);
    const job = formatJobRow(updateRes.rows[0]);
    return { job, isDeadLetter };
  }

  // Retrieve all jobs in the Dead Letter Queue.
  async getDeadLetterJobs(): Promise<BackgroundJob[]> {
    const pool = this.getPool();
    const res = await pool.query<BackgroundJob>(SELECT_DEAD_LETTER_JOBS_SQL);
    return res.rows.map(formatJobRow);
  }

  // Bounce the queue: resets active/processing jobs and clears dead letter jobs.
  async bounceJobQueue(): Promise<void> {
    const pool = this.getPool();
    await pool.query(BOUNCE_RESET_BACKGROUND_JOBS_SQL).catch(() => pool.query(RESET_PROCESSING_JOBS_SQL));
    await pool.query(DELETE_DEAD_LETTER_JOBS_SQL).catch(() => {});
    await pool.query(BOUNCE_RESET_FAILED_ENTRIES_SQL).catch(() => {});
    await pool.query(BOUNCE_REENQUEUE_PENDING_ENTRIES_SQL).catch(() => {});
  }
}

export const db = new DatabaseClient();
