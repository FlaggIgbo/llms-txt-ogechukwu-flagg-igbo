import React, { useState } from 'react';
import { useEntries } from './hooks/useEntries.js';
import { HomePage } from './pages/HomePage.js';
import { AddEntryPage } from './pages/AddEntryPage.js';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'home' | 'add'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const { entries, loading, error, submitEntry } = useEntries(searchQuery);

  return (
    <div style={{ maxWidth: '880px', margin: '0 auto', padding: '2rem 1.25rem' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem',
          borderBottom: '1px solid #1e293b',
          paddingBottom: '1rem',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem' }}>llms.txt Directory</h1>
          <p style={{ margin: '0.25rem 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>
            Curated index & automated generator for LLM-friendly website indexes
          </p>
        </div>
        <nav style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => setActiveTab('home')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              border: '1px solid #334155',
              background: activeTab === 'home' ? '#0284c7' : '#1e293b',
              color: '#f8fafc',
              cursor: 'pointer',
            }}
          >
            Browse Directory
          </button>
          <button
            onClick={() => setActiveTab('add')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              border: '1px solid #334155',
              background: activeTab === 'add' ? '#0284c7' : '#1e293b',
              color: '#f8fafc',
              cursor: 'pointer',
            }}
          >
            + Add Entry
          </button>
        </nav>
      </header>

      {activeTab === 'home' ? (
        <HomePage
          entries={entries}
          loading={loading}
          error={error}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
      ) : (
        <AddEntryPage
          onSubmit={async (payload) => {
            await submitEntry(payload);
            setActiveTab('home');
          }}
        />
      )}
    </div>
  );
};

export default App;
