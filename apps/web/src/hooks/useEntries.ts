import { useState, useEffect } from 'react';
import type { SiteEntry, CreateSiteEntryRequest } from '@llmstxt/shared-types';

// State and actions returned by useEntries.
export interface UseEntriesResult {
  entries: SiteEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  submitEntry: (payload: CreateSiteEntryRequest) => Promise<unknown>;
}

// Sample entries for tests and fallback.
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

const env = (import.meta as any).env || {};
const API_BASE = env.VITE_API_URL || 'http://localhost:4000';

// Check if an entry matches the search text.
export function matchesSearch(item: SiteEntry, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;

  const name = (item.website_name || '').toLowerCase();
  const desc = (item.website_short_description || '').toLowerCase();
  const url = (item.website_url || '').toLowerCase();

  return name.includes(q) || desc.includes(q) || url.includes(q);
}

// Fetch, filter, and submit directory entries.
export function useEntries(searchQuery = ''): UseEntriesResult {
  const [allEntries, setAllEntries] = useState<SiteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load entries from the API.
  async function fetchEntries(): Promise<void> {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/entries`, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data = await response.json();
      let rawList: SiteEntry[] = [];
      if (Array.isArray(data)) {
        rawList = data;
      } else if (data && Array.isArray(data.entries)) {
        rawList = data.entries;
      }

      setAllEntries(rawList);
      setError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch';
      setError(message);
      setAllEntries([]);
    } finally {
      setLoading(false);
    }
  }

  // Fetch once on mount.
  useEffect(() => {
    void fetchEntries();
  }, []);

  // Send a new entry to the API.
  async function submitEntry(payload: CreateSiteEntryRequest): Promise<unknown> {
    const response = await fetch(`${API_BASE}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Failed to create entry: HTTP ${response.status}`);
    }

    const result = await response.json();
    await fetchEntries();
    return result;
  }

  // Filter entries by search query.
  const filteredEntries: SiteEntry[] = [];
  for (const item of allEntries) {
    if (matchesSearch(item, searchQuery)) {
      filteredEntries.push(item);
    }
  }

  return {
    entries: filteredEntries,
    loading,
    error,
    refresh: fetchEntries,
    submitEntry,
  };
}
