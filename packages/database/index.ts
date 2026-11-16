import pg from 'pg';
import type { SiteEntry, CreateSiteEntryRequest, SiteCadence } from '@llmstxt/shared-types';
import { logWarn } from '@llmstxt/logger';

// Database connection URL.
const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/llmstxt_directory';

// In-memory cadences for development fallback.
const mockCadenceMap = new Map<string, SiteCadence>();

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

// Default rows for local development and testing.
export const MOCK_SEED_ENTRIES: SiteEntry[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    website_name: 'FastAPI',
    website_url: 'https://fastapi.tiangolo.com',
    website_short_description: 'FastAPI framework, high performance, easy to learn, fast to code, ready for production',
    is_updated_latest: true,
    llms_txt_storage: 'https://fastapi.tiangolo.com/llms.txt',
    llms_full_txt_storage: 'https://fastapi.tiangolo.com/llms-full.txt',
    status: 'COMPLETED',
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-14T14:22:10.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    website_name: 'Anthropic Docs',
    website_url: 'https://docs.anthropic.com',
    website_short_description: 'Anthropic API, Claude models documentation, guides, and SDK reference.',
    is_updated_latest: true,
    llms_txt_storage: 'https://docs.anthropic.com/llms.txt',
    llms_full_txt_storage: 'https://docs.anthropic.com/llms-full.txt',
    status: 'COMPLETED',
    created_at: '2026-11-02T12:00:00.000Z',
    updated_at: '2026-11-15T09:15:30.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    website_name: 'llmstxt.org',
    website_url: 'https://llmstxt.org',
    website_short_description: 'The official standard specification for /llms.txt and /llms-full.txt website discovery.',
    is_updated_latest: true,
    llms_txt_storage: 'https://llmstxt.org/llms.txt',
    llms_full_txt_storage: null,
    status: 'COMPLETED',
    created_at: '2026-10-15T08:30:00.000Z',
    updated_at: '2026-11-12T18:45:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    website_name: 'Hugging Face',
    website_url: 'https://huggingface.co',
    website_short_description: 'The platform where the machine learning community collaborates on models, datasets, and applications.',
    is_updated_latest: true,
    llms_txt_storage: 'https://huggingface.co/llms.txt',
    llms_full_txt_storage: 'https://huggingface.co/llms-full.txt',
    status: 'COMPLETED',
    created_at: '2026-11-05T16:20:00.000Z',
    updated_at: '2026-11-15T19:00:00.000Z',
  },
];

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

  return {
    ...row,
    created_at: createdAt,
    updated_at: updatedAt,
    llm_txt: llmTxt,
  };
}

// Check if running in local dev mode.
function isDevMode(): boolean {
  return process.env.NODE_ENV !== 'production' || connectionString.includes('localhost');
}

// Check if an entry contains the search text.
function entryMatchesQuery(entry: SiteEntry, lowerQuery: string): boolean {
  const name = (entry.website_name || '').toLowerCase();
  const desc = (entry.website_short_description || '').toLowerCase();
  const url = (entry.website_url || '').toLowerCase();
  return name.includes(lowerQuery) || desc.includes(lowerQuery) || url.includes(lowerQuery);
}

// Handles all PostgreSQL queries.
export class DatabaseClient {
  private pool: pg.Pool | null = null;
  private hasEnsuredSeed = false;

  // Create or reuse the DB connection pool.
  private getPool(): pg.Pool {
    if (!this.pool) {
      this.pool = new pg.Pool({ connectionString });
    }
    return this.pool;
  }

  // Insert seed rows if not already done.
  async ensureDevelopmentSeed(): Promise<void> {
    if (this.hasEnsuredSeed) return;
    try {
      const pool = this.getPool();
      for (const entry of MOCK_SEED_ENTRIES) {
        await pool.query(
          `INSERT INTO site_entries (
            id, website_name, website_url, website_short_description,
            is_updated_latest, llms_txt_storage, llms_full_txt_storage,
            status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (website_url) DO UPDATE SET
            website_name = EXCLUDED.website_name,
            website_short_description = EXCLUDED.website_short_description,
            is_updated_latest = EXCLUDED.is_updated_latest,
            llms_txt_storage = EXCLUDED.llms_txt_storage,
            llms_full_txt_storage = EXCLUDED.llms_full_txt_storage,
            status = EXCLUDED.status,
            updated_at = EXCLUDED.updated_at`,
          [
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
          ]
        );
      }
      this.hasEnsuredSeed = true;
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        const msg = err instanceof Error ? err.message : String(err);
        logWarn(`[DatabaseClient] Seed upsert skipped: ${msg}`);
      }
    }
  }

  // Get all entries sorted by newest update.
  async listEntries(): Promise<SiteEntry[]> {
    const isDev = isDevMode();
    if (isDev && !this.hasEnsuredSeed) {
      await this.ensureDevelopmentSeed();
    }

    const selectAllSql =
      'SELECT id, website_name, website_url, website_short_description, is_updated_latest, llms_txt_storage, llms_full_txt_storage, status, created_at, updated_at FROM site_entries ORDER BY updated_at DESC';

    try {
      const pool = this.getPool();
      const result = await pool.query<SiteEntry>(selectAllSql);

      // Seed and retry if table is empty in dev.
      if (result.rows.length === 0 && isDev) {
        await this.ensureDevelopmentSeed();
        const recheck = await pool.query<SiteEntry>(selectAllSql);
        if (recheck.rows.length > 0) {
          return recheck.rows.map(formatRow);
        }
        return MOCK_SEED_ENTRIES;
      }

      return result.rows.map(formatRow);
    } catch (err) {
      // Fall back to mock data in dev if DB is offline.
      if (isDev) {
        const msg = err instanceof Error ? err.message : String(err);
        logWarn(`[DatabaseClient] PostgreSQL query error: ${msg}`);
        return MOCK_SEED_ENTRIES;
      }
      throw err;
    }
  }

  // Search entries by text with pagination.
  async searchEntries(
    query: string,
    limit = 50,
    offset = 0
  ): Promise<{ entries: SiteEntry[]; total: number }> {
    const isDev = isDevMode();
    const q = query.trim();

    // Return paged list if query is empty.
    if (!q) {
      const all = await this.listEntries();
      return {
        entries: all.slice(offset, offset + limit),
        total: all.length,
      };
    }

    if (isDev && !this.hasEnsuredSeed) {
      await this.ensureDevelopmentSeed();
    }

    try {
      const pool = this.getPool();
      // Search using Postgres full-text search and ILIKE fallback.
      const sql = `
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

      const result = await pool.query(sql, [q, limit, offset]);
      let total = 0;
      if (result.rows.length > 0) {
        total = Number(result.rows[0].full_count);
      }

      return {
        entries: result.rows.map(formatRow),
        total,
      };
    } catch (err) {
      // Filter mock data in memory if DB fails in dev.
      if (isDev) {
        const lowerQ = q.toLowerCase();
        const matches: SiteEntry[] = [];
        for (const entry of MOCK_SEED_ENTRIES) {
          if (entryMatchesQuery(entry, lowerQ)) {
            matches.push(entry);
          }
        }
        return {
          entries: matches.slice(offset, offset + limit),
          total: matches.length,
        };
      }
      throw err;
    }
  }

  // Find one entry by ID.
  async getEntryById(id: string): Promise<SiteEntry | null> {
    const pool = this.getPool();
    const result = await pool.query<SiteEntry>('SELECT * FROM site_entries WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return null;
    }
    return formatRow(result.rows[0]);
  }

  // Insert a new entry.
  async createEntry(input: CreateSiteEntryRequest): Promise<SiteEntry> {
    const pool = this.getPool();
    const description = input.website_short_description || '';
    const result = await pool.query<SiteEntry>(
      `INSERT INTO site_entries (website_url, website_short_description)
       VALUES ($1, $2)
       RETURNING *`,
      [input.website_url, description]
    );
    return formatRow(result.rows[0]);
  }

  // Update fields on an existing entry.
  async updateEntry(id: string, patch: Partial<SiteEntry>): Promise<SiteEntry | null> {
    const pool = this.getPool();
    const sets: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const [key, val] of Object.entries(patch)) {
      sets.push(`${key} = $${paramIndex}`);
      values.push(val);
      paramIndex += 1;
    }

    if (sets.length === 0) {
      return this.getEntryById(id);
    }

    values.push(id);
    const result = await pool.query<SiteEntry>(
      `UPDATE site_entries SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return null;
    }
    return formatRow(result.rows[0]);
  }

  // Get entries that need updating.
  async findStaleEntries(): Promise<SiteEntry[]> {
    const pool = this.getPool();
    const result = await pool.query<SiteEntry>(
      'SELECT * FROM site_entries WHERE is_updated_latest = false'
    );
    return result.rows.map(formatRow);
  }

  // Get cadence row for a site.
  async getCadenceBySiteId(siteId: string): Promise<SiteCadence | null> {
    const isDev = isDevMode();
    try {
      const pool = this.getPool();
      const res = await pool.query('SELECT * FROM site_cadence WHERE site_id = $1', [siteId]);
      if (res.rows.length === 0) {
        return mockCadenceMap.get(siteId) || null;
      }
      return formatCadenceRow(res.rows[0]);
    } catch {
      if (isDev) {
        return mockCadenceMap.get(siteId) || null;
      }
      throw new Error(`Failed to get cadence for site ${siteId}`);
    }
  }

  // Transactionally insert entry and its cadence schedule.
  async createEntryWithCadence(
    input: CreateSiteEntryRequest,
    siteCategory: string = 'api_docs',
    intervalHours: number = 24
  ): Promise<{ entry: SiteEntry; cadence: SiteCadence }> {
    const isDev = isDevMode();
    const description = input.website_short_description || '';

    try {
      const pool = this.getPool();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const entryRes = await client.query(
          `INSERT INTO site_entries (website_url, website_short_description)
           VALUES ($1, $2)
           RETURNING *`,
          [input.website_url, description]
        );
        const entry = formatRow(entryRes.rows[0]);

        const cadenceRes = await client.query(
          `INSERT INTO site_cadence (site_id, url, site_category, check_interval_hours, next_check_at, status)
           VALUES ($1, $2, $3, $4, NOW(), 'idle')
           RETURNING *`,
          [entry.id, entry.website_url, siteCategory, intervalHours]
        );
        const cadence = formatCadenceRow(cadenceRes.rows[0]);

        await client.query('COMMIT');
        return { entry, cadence };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      if (isDev) {
        const id = `00000000-0000-0000-0000-${Date.now().toString().slice(-12).padStart(12, '0')}`;
        const newEntry: SiteEntry = {
          id,
          website_url: input.website_url,
          website_short_description: description,
          is_updated_latest: false,
          llms_txt_storage: null,
          llms_full_txt_storage: null,
          status: 'PENDING',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const newCadence: SiteCadence = {
          site_id: id,
          url: input.website_url,
          site_category: siteCategory,
          check_interval_hours: intervalHours,
          unchanged_streak: 0,
          etag: null,
          last_modified: null,
          last_content_hash: null,
          last_checked_at: null,
          next_check_at: new Date().toISOString(),
          status: 'idle',
        };
        MOCK_SEED_ENTRIES.unshift(newEntry);
        mockCadenceMap.set(id, newCadence);
        return { entry: newEntry, cadence: newCadence };
      }
      throw err;
    }
  }

  // Atomically claim due sites using FOR UPDATE SKIP LOCKED.
  async claimDueCadenceSites(limit: number = 50): Promise<SiteCadence[]> {
    const isDev = isDevMode();
    try {
      const pool = this.getPool();
      const sql = `
        UPDATE site_cadence
        SET status = 'queued'
        WHERE site_id IN (
          SELECT site_id FROM site_cadence
          WHERE next_check_at <= NOW() AND status = 'idle'
          ORDER BY next_check_at ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *;
      `;
      const result = await pool.query(sql, [limit]);
      return result.rows.map(formatCadenceRow);
    } catch (err) {
      if (isDev) {
        const claimed: SiteCadence[] = [];
        const now = Date.now();
        for (const [id, cad] of mockCadenceMap.entries()) {
          if (cad.status === 'idle' && new Date(cad.next_check_at).getTime() <= now) {
            cad.status = 'queued';
            claimed.push({ ...cad });
            if (claimed.length >= limit) break;
          }
        }
        return claimed;
      }
      throw err;
    }
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
    const isDev = isDevMode();
    try {
      const pool = this.getPool();
      const sql = `
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
      await pool.query(sql, [
        result.newIntervalHours,
        result.newStreak,
        result.etag ?? null,
        result.lastModified ?? null,
        result.contentHash ?? null,
        result.siteCategory ?? null,
        result.nextCheckAt.toISOString(),
        siteId,
      ]);
    } catch (err) {
      if (isDev) {
        const item = mockCadenceMap.get(siteId);
        if (item) {
          item.check_interval_hours = result.newIntervalHours;
          item.unchanged_streak = result.newStreak;
          if (result.etag !== undefined) item.etag = result.etag;
          if (result.lastModified !== undefined) item.last_modified = result.lastModified;
          if (result.contentHash !== undefined) item.last_content_hash = result.contentHash;
          if (result.siteCategory) item.site_category = result.siteCategory;
          item.last_checked_at = new Date().toISOString();
          item.next_check_at = result.nextCheckAt.toISOString();
          item.status = 'idle';
        }
        return;
      }
      throw err;
    }
  }
}

export const db = new DatabaseClient();
