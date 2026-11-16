import pg from 'pg';
import type { SiteEntry, CreateSiteEntryRequest } from '@llmstxt/shared-types';

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/llmstxt_directory';

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

function formatRow(row: any): SiteEntry {
  return {
    ...row,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
    llm_txt: row.llm_txt ?? row.llms_txt_storage ?? (row.website_url ? `${row.website_url.replace(/\/+$/, '')}/llms.txt` : null),
  };
}

export class DatabaseClient {
  private pool: pg.Pool | null = null;
  private hasEnsuredSeed = false;

  private getPool(): pg.Pool {
    if (!this.pool) {
      this.pool = new pg.Pool({ connectionString });
    }
    return this.pool;
  }

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
      console.warn('[DatabaseClient] Seed upsert skipped:', err instanceof Error ? err.message : err);
    }
  }

  async listEntries(): Promise<SiteEntry[]> {
    const isDev = process.env.NODE_ENV !== 'production' || connectionString.includes('localhost');
    if (isDev && !this.hasEnsuredSeed) {
      await this.ensureDevelopmentSeed();
    }

    try {
      const pool = this.getPool();
      const result = await pool.query<SiteEntry>(
        'SELECT id, website_name, website_url, website_short_description, is_updated_latest, llms_txt_storage, llms_full_txt_storage, status, created_at, updated_at FROM site_entries ORDER BY updated_at DESC'
      );

      if (result.rows.length === 0 && isDev) {
        await this.ensureDevelopmentSeed();
        const recheck = await pool.query<SiteEntry>(
          'SELECT id, website_name, website_url, website_short_description, is_updated_latest, llms_txt_storage, llms_full_txt_storage, status, created_at, updated_at FROM site_entries ORDER BY updated_at DESC'
        );
        if (recheck.rows.length > 0) {
          return recheck.rows.map(formatRow);
        }
        return MOCK_SEED_ENTRIES;
      }

      return result.rows.map(formatRow);
    } catch (err) {
      console.warn('[DatabaseClient] PostgreSQL query error:', err instanceof Error ? err.message : err);
      if (isDev) {
        return MOCK_SEED_ENTRIES;
      }
      throw err;
    }
  }

  async getEntryById(id: string): Promise<SiteEntry | null> {
    const pool = this.getPool();
    const result = await pool.query<SiteEntry>('SELECT * FROM site_entries WHERE id = $1', [id]);
    return result.rows[0] ? formatRow(result.rows[0]) : null;
  }

  async createEntry(input: CreateSiteEntryRequest): Promise<SiteEntry> {
    const pool = this.getPool();
    const result = await pool.query<SiteEntry>(
      `INSERT INTO site_entries (website_url, website_short_description)
       VALUES ($1, $2)
       RETURNING *`,
      [input.website_url, input.website_short_description ?? '']
    );
    return formatRow(result.rows[0]);
  }

  async updateEntry(id: string, patch: Partial<SiteEntry>): Promise<SiteEntry | null> {
    const pool = this.getPool();
    const sets: string[] = [];
    const values: any[] = [];
    let i = 1;

    for (const [key, val] of Object.entries(patch)) {
      sets.push(`${key} = $${i++}`);
      values.push(val);
    }
    if (sets.length === 0) return this.getEntryById(id);

    values.push(id);
    const result = await pool.query<SiteEntry>(
      `UPDATE site_entries SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`,
      values
    );
    return result.rows[0] ? formatRow(result.rows[0]) : null;
  }

  async findStaleEntries(): Promise<SiteEntry[]> {
    const pool = this.getPool();
    const result = await pool.query<SiteEntry>(
      `SELECT * FROM site_entries WHERE is_updated_latest = false`
    );
    return result.rows.map(formatRow);
  }
}

export const db = new DatabaseClient();
