import React from 'react';
import type { SiteEntry } from '@llmstxt/shared-types';
import { SearchBar } from '../components/SearchBar.js';
import { DirectoryCard } from '../components/DirectoryCard.js';

interface HomePageProps {
  entries: SiteEntry[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  entries,
  loading,
  error,
  searchQuery,
  onSearchChange,
}) => {
  return (
    <div>
      <SearchBar value={searchQuery} onChange={onSearchChange} />
      {loading && <p style={{ color: '#94a3b8' }}>Loading directory entries...</p>}
      {error && <p style={{ color: '#f87171' }}>Error: {error}</p>}
      {!loading && entries.length === 0 && (
        <p style={{ color: '#94a3b8' }}>No entries match your search.</p>
      )}
      <div style={{ display: 'grid', gap: '1rem' }}>
        {entries.map((entry) => (
          <DirectoryCard key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
};
