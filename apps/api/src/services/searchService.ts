import type { SearchQuery, SearchResult } from '@llmstxt/shared-types';
import { db } from '@llmstxt/database';

// Wrapper around database search methods.
export class SearchService {
  // Get all entries with pagination.
  async getAllEntries(limit = 50, offset = 0): Promise<SearchResult> {
    return db.searchEntries('', limit, offset);
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
