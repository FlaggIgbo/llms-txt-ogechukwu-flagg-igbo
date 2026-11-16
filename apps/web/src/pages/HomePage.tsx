import React from 'react';
import type { SiteEntry } from '@llmstxt/shared-types';
import { SearchBar } from '../components/SearchBar';
import { DirectoryTable } from '../components/DirectoryTable';

// Props for the home page.
export interface HomePageProps {
  entries: SiteEntry[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onRefresh: () => Promise<void>;
}

// Directory homepage displaying search and the directory table.
export function HomePage({
  entries,
  loading,
  error,
  searchQuery,
  onSearchChange,
  onRefresh,
}: HomePageProps): React.ReactElement {
  const entryLabel = entries.length === 1 ? 'entry' : 'entries';

  return (
    <div className="home-page">
      <section className="search-section">
        <SearchBar value={searchQuery} onChange={onSearchChange} />
      </section>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button className="retry-button" onClick={() => void onRefresh()}>
            Retry
          </button>
        </div>
      )}

      {!error && (
        <>
          <DirectoryTable entries={entries} loading={loading} error={error} />

          <footer className="directory-footer">
            <span>
              Showing {entries.length} {entryLabel}
            </span>
            <button className="refresh-button" onClick={() => void onRefresh()}>
              Refresh entries
            </button>
          </footer>
        </>
      )}
    </div>
  );
}
