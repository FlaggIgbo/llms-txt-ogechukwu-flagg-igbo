import { useState, useEffect, useRef } from 'react';
import { type SiteEntry, type CreateSiteEntryRequest, EntryStatus } from '@llmstxt/shared-types';

// State and actions returned by useEntries.
export interface UseEntriesResult {
  entries: SiteEntry[];
  allEntries: SiteEntry[];
  loading: boolean;
  isSearching: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  submitEntry: (payload: CreateSiteEntryRequest) => Promise<unknown>;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  setPage: (page: number) => void;
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
    status: EntryStatus.COMPLETED,
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
    status: EntryStatus.COMPLETED,
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
    status: EntryStatus.COMPLETED,
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
    status: EntryStatus.COMPLETED,
    created_at: '2026-11-05T16:20:00.000Z',
    updated_at: '2026-11-15T19:00:00.000Z',
  },
];

const env = (import.meta as any).env || {};
const rawApiBase = String(env.VITE_API_URL || env.VITE_API_BASE_URL || 'http://localhost:4000').trim();

// Format API base URL, converting Render internal hostnames (e.g. "llmstxt-api-5yok") to full public URLs.
export function resolveApiBaseUrl(raw: string): string {
  let base = (raw || '').trim();
  if (!base || base === 'undefined' || base === 'null') {
    return 'http://localhost:4000';
  }
  if (!base.startsWith('http://') && !base.startsWith('https://')) {
    if (!base.includes('.') && !base.includes('localhost')) {
      base = `https://${base}.onrender.com`;
    } else {
      base = `https://${base}`;
    }
  }
  return base.replace(/\/+$/, '');
}

const API_BASE = resolveApiBaseUrl(rawApiBase);

// Check if an entry matches the search text.
export function matchesSearch(item: SiteEntry, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;

  const name = (item.website_name || '').toLowerCase();
  const desc = (item.website_short_description || '').toLowerCase();
  const url = (item.website_url || '').toLowerCase();

  return name.includes(q) || desc.includes(q) || url.includes(q);
}

// Fetch, filter, search, paginate, and submit directory entries.
export function useEntries(searchQuery = '', initialPage = 1, pageSize = 50): UseEntriesResult {
  const [entries, setEntries] = useState<SiteEntry[]>([]);
  const [allEntries, setAllEntries] = useState<SiteEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Reset to page 1 whenever search query changes.
  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  // Load entries from the API using /search with pagination and abort controller.
  async function fetchEntries(query = searchQuery, targetPage = page): Promise<void> {
    // Abort pending search/fetch requests to prevent out-of-order race conditions.
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsSearching(true);
    const offset = Math.max(0, (targetPage - 1) * pageSize);

    try {
      const trimmedQuery = query.trim();
      const endpoint = trimmedQuery
        ? `${API_BASE}/search?q=${encodeURIComponent(trimmedQuery)}&limit=${pageSize}&offset=${offset}`
        : `${API_BASE}/search?limit=${pageSize}&offset=${offset}`;

      const response = await fetch(endpoint, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data = await response.json();
      let pagedList: SiteEntry[] = [];
      let totalCount = 0;

      if (data && Array.isArray(data.entries)) {
        pagedList = data.entries;
        totalCount = typeof data.total === 'number' ? data.total : data.entries.length;
      } else if (Array.isArray(data)) {
        pagedList = data.slice(offset, offset + pageSize);
        totalCount = data.length;
      }

      setEntries(pagedList);
      setAllEntries(pagedList);
      setTotal(totalCount);
      setError(null);
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        // Request was aborted by subsequent search keystroke; ignore silently.
        return;
      }

      // Dev and offline fallback using mock data.
      const q = query.toLowerCase().trim();
      const matched = MOCK_SEED_ENTRIES.filter((item) => matchesSearch(item, q));
      const pagedFallback = matched.slice(offset, offset + pageSize);

      setEntries(pagedFallback);
      setAllEntries(pagedFallback);
      setTotal(matched.length);

      const message = err instanceof Error ? err.message : 'Failed to fetch';
      if (typeof window !== 'undefined' && window.location.hostname && !window.location.hostname.includes('localhost')) {
        setError(message);
      } else {
        setError(null);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        setIsSearching(false);
        setLoading(false);
      }
    }
  }

  // Fetch when search query or page changes.
  useEffect(() => {
    void fetchEntries(searchQuery, page);
  }, [searchQuery, page]);

  // Clean up abort controller on unmount.
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Send a new entry to the API.
  async function submitEntry(payload: CreateSiteEntryRequest): Promise<unknown> {
    const response = await fetch(`${API_BASE}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errorMsg = `Failed to create entry: HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData?.error) {
          errorMsg = errorData.error;
        }
      } catch {
        // Fall back to HTTP status message.
      }
      throw new Error(errorMsg);
    }

    const result = await response.json();
    await fetchEntries(searchQuery, page);
    return result;
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    entries,
    allEntries,
    loading,
    isSearching,
    error,
    refresh: () => fetchEntries(searchQuery, page),
    submitEntry,
    page,
    pageSize,
    total,
    totalPages,
    setPage,
  };
}

// State and actions returned by useUpdatingEntries.
export interface UseUpdatingEntriesResult {
  updatingEntries: SiteEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

// Fetch entries that are currently pending, processing, or failed user submissions.
export function useUpdatingEntries(): UseUpdatingEntriesResult {
  const [updatingEntries, setUpdatingEntries] = useState<SiteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchUpdating(): Promise<void> {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/entries?status=Pending`, {
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

      setUpdatingEntries(rawList);
      setError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch updating entries';
      setError(message);
      setUpdatingEntries([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchUpdating();
  }, []);

  return {
    updatingEntries,
    loading,
    error,
    refresh: fetchUpdating,
  };
}
