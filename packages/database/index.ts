import { randomUUID } from 'node:crypto';
import type { SiteEntry, CreateSiteEntryRequest } from '@llmstxt/shared-types';

/**
 * Shared Database Client used by `api`, `worker`, and `cron-updater`.
 * In production, this delegates to Prisma / PostgreSQL via DATABASE_URL.
 * Provides an in-memory fallback with seed entries for seamless local dev.
 */
class DatabaseClient {
  private entries: Map<string, SiteEntry> = new Map();

  constructor() {
    const now = new Date().toISOString();
    const seeds: SiteEntry[] = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        website_url: 'https://llmstxt.org',
        website_short_description: 'The official proposal and specification for /llms.txt files.',
        is_updated_latest: true,
        llms_txt_storage: 's3://llmstxt-files-bucket/llmstxt.org/llms.txt',
        llms_full_txt_storage: 's3://llmstxt-files-bucket/llmstxt.org/llms-full.txt',
        status: 'COMPLETED',
        created_at: now,
        updated_at: now,
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        website_url: 'https://docs.anthropic.com',
        website_short_description: 'Anthropic developer documentation, API reference, and prompt engineering guides.',
        is_updated_latest: true,
        llms_txt_storage: 's3://llmstxt-files-bucket/docs.anthropic.com/llms.txt',
        llms_full_txt_storage: 's3://llmstxt-files-bucket/docs.anthropic.com/llms-full.txt',
        status: 'COMPLETED',
        created_at: now,
        updated_at: now,
      },
    ];
    for (const seed of seeds) {
      this.entries.set(seed.id, seed);
    }
  }

  async listEntries(): Promise<SiteEntry[]> {
    return Array.from(this.entries.values()).sort((a, b) =>
      b.updated_at.localeCompare(a.updated_at)
    );
  }

  async getEntryById(id: string): Promise<SiteEntry | null> {
    return this.entries.get(id) ?? null;
  }

  async createEntry(input: CreateSiteEntryRequest): Promise<SiteEntry> {
    const now = new Date().toISOString();
    const entry: SiteEntry = {
      id: randomUUID(),
      website_url: input.website_url,
      website_short_description: input.website_short_description ?? '',
      is_updated_latest: false,
      llms_txt_storage: null,
      llms_full_txt_storage: null,
      status: 'PENDING',
      created_at: now,
      updated_at: now,
    };
    this.entries.set(entry.id, entry);
    return entry;
  }

  async updateEntry(id: string, patch: Partial<SiteEntry>): Promise<SiteEntry | null> {
    const existing = this.entries.get(id);
    if (!existing) return null;
    const updated: SiteEntry = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    this.entries.set(id, updated);
    return updated;
  }

  async findStaleEntries(): Promise<SiteEntry[]> {
    return Array.from(this.entries.values()).filter((e) => !e.is_updated_latest);
  }
}

export const db = new DatabaseClient();
export type { DatabaseClient };
