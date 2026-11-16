import type { SiteEntry, CreateSiteEntryRequest } from '@llmstxt/shared-types';

export class DatabaseClient {
  async listEntries(): Promise<SiteEntry[]> {
    throw new Error('Not implemented');
  }

  async getEntryById(_id: string): Promise<SiteEntry | null> {
    throw new Error('Not implemented');
  }

  async createEntry(_input: CreateSiteEntryRequest): Promise<SiteEntry> {
    throw new Error('Not implemented');
  }

  async updateEntry(_id: string, _patch: Partial<SiteEntry>): Promise<SiteEntry | null> {
    throw new Error('Not implemented');
  }

  async findStaleEntries(): Promise<SiteEntry[]> {
    throw new Error('Not implemented');
  }
}

export const db = new DatabaseClient();
