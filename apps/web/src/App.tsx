import React, { useState, useEffect } from 'react';
import type { CreateSiteEntryRequest } from '@llmstxt/shared-types';
import { HomePage } from './pages/HomePage';
import { AddEntryPage } from './pages/AddEntryPage';
import { UpdatesPage } from './pages/UpdatesPage';
import { useEntries, useUpdatingEntries } from './hooks/useEntries';
import { ErrorBoundary } from './components/ErrorBoundary';

export type TabType = 'home' | 'add' | 'updates';

export const VALID_HASH_MAP: Record<string, TabType> = {
  '': 'home',
  '#': 'home',
  '#/': 'home',
  '#home': 'home',
  '#/home': 'home',
  '#add': 'add',
  '#/add': 'add',
  '#updates': 'updates',
  '#/updates': 'updates',
};

// Validate and parse route tab from URL hash using strict exact matching. Throws an error on unrecognized hash.
export function parseTabFromHash(rawHash: string): TabType {
  const hash = rawHash.toLowerCase().trim();
  const matchedTab = VALID_HASH_MAP[hash];
  if (!matchedTab) {
    throw new Error(
      `Invalid URL hash: "${rawHash}". Valid hashes are: #home, #add, #updates`
    );
  }
  return matchedTab;
}

// Read initial tab from URL hash with strict exact matching.
export function getInitialTab(): TabType {
  if (typeof window !== 'undefined' && window.location.hash) {
    return parseTabFromHash(window.location.hash);
  }
  return 'home';
}

// Main application content with tab navigation.
export function AppContent(): React.ReactElement {
  const [hash, setHash] = useState(() => (typeof window !== 'undefined' ? window.location.hash : ''));
  const activeTab = parseTabFromHash(hash);
  const [searchQuery, setSearchQuery] = useState('');
  const {
    entries,
    loading,
    isSearching,
    error,
    refresh,
    submitEntry,
    page,
    totalPages,
    total,
    setPage,
  } = useEntries(searchQuery);
  const {
    updatingEntries,
    loading: updatingLoading,
    error: updatingError,
    refresh: refreshUpdating,
  } = useUpdatingEntries();

  // Sync hash changes with activeTab.
  useEffect(() => {
    function onHashChange() {
      setHash(window.location.hash);
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Switch tab and update hash.
  function handleSelectTab(tab: TabType) {
    const newHash = tab === 'home' ? '' : `#${tab}`;
    setHash(newHash);
    if (typeof window !== 'undefined') {
      window.location.hash = newHash;
    }
  }

  // Handle entry submission and refresh both completed and pending entries.
  async function handleSubmitEntry(payload: CreateSiteEntryRequest) {
    await submitEntry(payload);
    await refreshUpdating();
  }

  // Count entries currently updating (excluding cron updates that failed).
  const updatingCount = updatingEntries.filter(
    (e) => !e.is_scheduled_update || e.status !== 'FAILED'
  ).length;

  return (
    <main className="directory-container">
      <header className="directory-header">
        <h1 className="directory-title">llms.txt Directory</h1>
        <p className="directory-subtitle">
          A community directory of websites serving{' '}
          <code className="directory-code">/llms.txt</code> files for AI agents and LLMs.
        </p>

        {/* Navigation Tabs */}
        <nav className="nav-tabs" role="tablist" aria-label="Directory Navigation">
          <button
            role="tab"
            aria-selected={activeTab === 'home'}
            className={`nav-tab ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => handleSelectTab('home')}
          >
            Directory
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'add'}
            className={`nav-tab ${activeTab === 'add' ? 'active' : ''}`}
            onClick={() => handleSelectTab('add')}
          >
            Add Entry
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'updates'}
            className={`nav-tab ${activeTab === 'updates' ? 'active' : ''}`}
            onClick={() => handleSelectTab('updates')}
          >
            Updates
            {updatingCount > 0 && <span className="tab-badge">{updatingCount}</span>}
          </button>
        </nav>
      </header>

      {/* Tab Panels */}
      {activeTab === 'home' && (
        <HomePage
          entries={entries}
          loading={loading}
          isSearching={isSearching}
          error={error}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onRefresh={refresh}
          page={page}
          totalPages={totalPages}
          total={total}
          onPageChange={setPage}
        />
      )}

      {activeTab === 'add' && (
        <AddEntryPage
          onSubmit={handleSubmitEntry}
          onNavigateToUpdates={() => handleSelectTab('updates')}
        />
      )}

      {activeTab === 'updates' && (
        <UpdatesPage
          entries={updatingEntries}
          loading={updatingLoading}
          error={updatingError}
          onRefresh={refreshUpdating}
          onNavigateToAdd={() => handleSelectTab('add')}
        />
      )}
    </main>
  );
}

// App root wrapped with ErrorBoundary.
export function App(): React.ReactElement {
  const [resetKey, setResetKey] = useState(0);

  return (
    <ErrorBoundary key={resetKey} onReset={() => setResetKey((k) => k + 1)}>
      <AppContent />
    </ErrorBoundary>
  );
}

export default App;
