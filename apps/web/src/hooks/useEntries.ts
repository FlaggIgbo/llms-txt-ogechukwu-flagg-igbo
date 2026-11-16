import type { SiteEntry, CreateSiteEntryRequest } from '@llmstxt/shared-types';

export interface UseEntriesResult {
  entries: SiteEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  submitEntry: (payload: CreateSiteEntryRequest) => Promise<unknown>;
}

export function useEntries(_searchQuery: string): UseEntriesResult {
  throw new Error('Not implemented');
}
