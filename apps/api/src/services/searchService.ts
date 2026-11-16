import type { SearchQuery, SearchResult, SiteEntry } from '@llmstxt/shared-types';

const ELASTICSEARCH_NODE = process.env.ELASTICSEARCH_NODE ?? 'http://localhost:9200';
const PRIMARY_INDEX = process.env.ELASTICSEARCH_INDEX ?? 'site_entries';

export class SearchService {
  private formatHit(hit: any): SiteEntry {
    const source = hit._source ?? {};
    return {
      id: source.id ?? hit._id ?? '',
      website_name: source.website_name ?? '',
      website_url: source.website_url ?? '',
      website_short_description: source.website_short_description ?? '',
      is_updated_latest: Boolean(source.is_updated_latest),
      llms_txt_storage: source.llms_txt_storage ?? null,
      llms_full_txt_storage: source.llms_full_txt_storage ?? null,
      llm_txt:
        source.llm_txt ??
        source.llms_txt_storage ??
        (source.website_url ? `${source.website_url.replace(/\/+$/, '')}/llms.txt` : null),
      status: source.status ?? 'COMPLETED',
      created_at: source.created_at ?? new Date().toISOString(),
      updated_at: source.updated_at ?? new Date().toISOString(),
    };
  }

  async getAllEntries(): Promise<SiteEntry[]> {
    const candidateIndices = [PRIMARY_INDEX, 'site_entries', 'llmstxt_entries'];
    const uniqueIndices = Array.from(new Set(candidateIndices));

    for (const index of uniqueIndices) {
      try {
        const response = await fetch(`${ELASTICSEARCH_NODE}/${index}/_search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: { match_all: {} },
            size: 1000,
          }),
        });

        if (response.status === 404) {
          // Index does not exist
          continue;
        }

        if (!response.ok) {
          continue;
        }

        const data: any = await response.json();
        const hits = data?.hits?.hits;
        if (Array.isArray(hits)) {
          return hits.map((hit: any) => this.formatHit(hit));
        }
      } catch {
        // Continue to next candidate or return empty
      }
    }

    return [];
  }

  async searchEntries(query: SearchQuery): Promise<SearchResult> {
    try {
      const q = query.q?.trim() ?? '';
      const response = await fetch(`${ELASTICSEARCH_NODE}/${PRIMARY_INDEX}/_search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q
            ? {
                multi_match: {
                  query: q,
                  fields: ['website_name^2', 'website_short_description', 'website_url'],
                  fuzziness: 'AUTO',
                },
              }
            : { match_all: {} },
          size: query.limit ?? 50,
          from: query.offset ?? 0,
        }),
      });

      if (!response.ok) {
        return { entries: [], total: 0 };
      }

      const data: any = await response.json();
      const hits = data?.hits?.hits ?? [];
      const total = typeof data?.hits?.total === 'number' ? data.hits.total : data?.hits?.total?.value ?? hits.length;

      return {
        entries: hits.map((hit: any) => this.formatHit(hit)),
        total,
      };
    } catch {
      return { entries: [], total: 0 };
    }
  }
}

export const searchService = new SearchService();
