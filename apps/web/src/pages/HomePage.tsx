import React from 'react';
import type { SiteEntry } from '@llmstxt/shared-types';
import { SearchBar } from '../components/SearchBar';
import { DirectoryTable } from '../components/DirectoryTable';
import { PaginationControls } from '../components/PaginationControls';

// Props for the home page.
export interface HomePageProps {
  entries: SiteEntry[];
  loading: boolean;
  isSearching?: boolean;
  error: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onRefresh: () => Promise<void>;
  page?: number;
  totalPages?: number;
  total?: number;
  onPageChange?: (page: number) => void;
}

// Directory homepage displaying search and the directory table.
export function HomePage({
  entries,
  loading,
  isSearching = false,
  error,
  searchQuery,
  onSearchChange,
  onRefresh,
  page = 1,
  totalPages = 1,
  total,
  onPageChange,
}: HomePageProps): React.ReactElement {
  const totalCount = total !== undefined ? total : entries.length;
  const entryLabel = totalCount === 1 ? 'entry' : 'entries';

  return (
    <div className="home-page">
      <section className="search-section">
        <SearchBar
          value={searchQuery}
          onChange={onSearchChange}
          loading={isSearching}
        />
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
            <span className="directory-count">
              {total !== undefined
                ? `Showing ${entries.length} of ${totalCount} ${entryLabel}`
                : `Showing ${entries.length} ${entryLabel}`}
            </span>

            {onPageChange && (
              <PaginationControls
                page={page}
                totalPages={totalPages}
                onPageChange={onPageChange}
              />
            )}

            <button className="refresh-button" onClick={() => void onRefresh()}>
              Refresh entries
            </button>
          </footer>
        </>
      )}
    </div>
  );
}
