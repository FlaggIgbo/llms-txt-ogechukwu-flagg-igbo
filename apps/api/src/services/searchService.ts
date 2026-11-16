import type { SearchQuery, SearchResult } from '@llmstxt/shared-types';

export class SearchService {
  async searchEntries(_query: SearchQuery): Promise<SearchResult> {
    throw new Error('Not implemented');
  }
}

export const searchService = new SearchService();
