import { useState, useEffect, useCallback } from 'react';
import type { SiteEntry, CreateSiteEntryRequest } from '@llmstxt/shared-types';

const API_BASE_URL = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ?? 'http://localhost:4000';

export function useEntries(searchQuery: string) {
  const [entries, setEntries] = useState<SiteEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    try {
      setLoading(true);
      const endpoint = searchQuery.trim()
        ? `${API_BASE_URL}/search?q=${encodeURIComponent(searchQuery.trim())}`
        : `${API_BASE_URL}/entries`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { entries: SiteEntry[] };
      setEntries(data.entries ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch entries');
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const submitEntry = async (payload: CreateSiteEntryRequest) => {
    const res = await fetch(`${API_BASE_URL}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(errBody.error ?? 'Failed to submit entry');
    }
    await fetchEntries();
    return res.json();
  };

  return { entries, loading, error, refresh: fetchEntries, submitEntry };
}
