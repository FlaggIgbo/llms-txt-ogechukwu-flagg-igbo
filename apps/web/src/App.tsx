import React, { useState } from 'react';
import { SearchBar } from './components/SearchBar';
import { DirectoryTable } from './components/DirectoryTable';
import { useEntries } from './hooks/useEntries';
import './App.css';

export const App: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const { entries, loading, error, refresh } = useEntries(searchQuery);

  return (
    <main className="directory-container">
      <header className="directory-header">
        <h1 className="directory-title">llms.txt Directory</h1>
        <p className="directory-subtitle">
          A community directory of websites serving{' '}
          <code className="directory-code">/llms.txt</code> files for AI agents and LLMs.
        </p>
      </header>

      <section className="search-section">
        <SearchBar value={searchQuery} onChange={setSearchQuery} />
      </section>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button className="retry-button" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      )}

      <DirectoryTable entries={entries} loading={loading} error={error} />

      <footer className="directory-footer">
        <span>
          Showing {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </span>
        <button className="refresh-button" onClick={() => void refresh()}>
          Refresh entries
        </button>
      </footer>
    </main>
  );
};

export default App;
