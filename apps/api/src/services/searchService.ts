import type { SearchQuery, SearchResult, SiteEntry } from '@llmstxt/shared-types';
import { db } from '@llmstxt/database';

// Wrapper around database search methods.
export class SearchService {
  // Get all entries.
  async getAllEntries(): Promise<SiteEntry[]> {
    return db.listEntries();
  }

  // Search entries with query, limit, and offset.
  async searchEntries(query: SearchQuery): Promise<SearchResult> {
    const q = query.q || '';
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    return db.searchEntries(q, limit, offset);
  }
}

export const searchService = new SearchService();
