import type { SearchQuery, SearchResult, SiteEntry } from '@llmstxt/shared-types';
import { db } from '@llmstxt/database';

export class SearchService {
  async getAllEntries(): Promise<SiteEntry[]> {
    return db.listEntries();
  }

  async searchEntries(query: SearchQuery): Promise<SearchResult> {
    return db.searchEntries(query.q ?? '', query.limit ?? 50, query.offset ?? 0);
  }
}

export const searchService = new SearchService();
