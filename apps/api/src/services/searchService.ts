import { db } from '@llmstxt/database';
import type { SearchQuery, SearchResult } from '@llmstxt/shared-types';

/**
 * Elasticsearch / Database Search Service
 */
export class SearchService {
  private readonly esNode = process.env.ELASTICSEARCH_NODE ?? 'http://localhost:9200';
  private readonly esIndex = process.env.ELASTICSEARCH_INDEX ?? 'llmstxt_entries';

  async searchEntries(query: SearchQuery): Promise<SearchResult> {
    const allEntries = await db.listEntries();
    const q = (query.q ?? '').trim().toLowerCase();

    const filtered = q
      ? allEntries.filter(
          (entry) =>
            entry.website_url.toLowerCase().includes(q) ||
            entry.website_short_description.toLowerCase().includes(q)
        )
      : allEntries;

    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;

    return {
      entries: filtered.slice(offset, offset + limit),
      total: filtered.length,
    };
  }
}

export const searchService = new SearchService();
