import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { type SiteEntry, EntryStatus } from '@llmstxt/shared-types';
import { SearchBar } from './components/SearchBar';
import { DirectoryCard } from './components/DirectoryCard';
import { DirectoryTable } from './components/DirectoryTable';
import { SubmissionForm } from './components/SubmissionForm';
import { PaginationControls } from './components/PaginationControls';
import { MOCK_SEED_ENTRIES } from './hooks/useEntries';
import './App.css';

const sampleCardStandard: SiteEntry = {
  id: 'card-standard',
  website_name: 'FastAPI',
  website_url: 'https://fastapi.tiangolo.com',
  website_short_description: 'FastAPI framework, high performance, easy to learn, fast to code, ready for production',
  is_updated_latest: true,
  llms_txt_storage: 'https://fastapi.tiangolo.com/llms.txt',
  llms_full_txt_storage: 'https://fastapi.tiangolo.com/llms-full.txt',
  status: EntryStatus.COMPLETED,
  created_at: '2026-11-01T10:00:00.000Z',
  updated_at: '2026-11-14T14:22:10.000Z',
};

const sampleCardMinimal: SiteEntry = {
  id: 'card-minimal',
  website_name: 'llmstxt.org',
  website_url: 'https://llmstxt.org',
  website_short_description: 'The official standard specification for /llms.txt and /llms-full.txt website discovery.',
  is_updated_latest: false,
  llms_txt_storage: 'https://llmstxt.org/llms.txt',
  llms_full_txt_storage: null,
  status: EntryStatus.COMPLETED,
  created_at: '2026-10-15T08:30:00.000Z',
  updated_at: '2026-11-12T18:45:00.000Z',
};

// Harness is used as an isolated component test bench and screenshot fixture
function Harness(): React.ReactElement {
  const [searchValue, setSearchValue] = useState('fastapi');

  return (
    <div style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto', background: '#ffffff' }}>
      <h1 style={{ fontSize: '1.75rem', marginBottom: '1.5rem', borderBottom: '1px solid #d0d7de', paddingBottom: '0.5rem' }}>
        Component Screenshot Harness
      </h1>

      {/* 1. Navigation Tabs Component */}
      <section style={{ marginBottom: '3rem' }}>
        <h2>Navigation Tabs</h2>
        <div id="harness-nav-tabs" style={{ background: '#ffffff', padding: '1rem', border: '1px solid #d0d7de', borderRadius: '6px' }}>
          <header className="directory-header" style={{ marginBottom: 0 }}>
            <nav className="nav-tabs" role="tablist" aria-label="Directory Navigation">
              <button role="tab" aria-selected="true" className="nav-tab active">
                Directory
              </button>
              <button role="tab" aria-selected="false" className="nav-tab">
                Add Entry
              </button>
              <button role="tab" aria-selected="false" className="nav-tab">
                Updates
                <span className="tab-badge">3</span>
              </button>
            </nav>
          </header>
        </div>
      </section>

      {/* 2. SearchBar Component */}
      <section style={{ marginBottom: '3rem' }}>
        <h2>Search Bar</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div id="harness-search-bar-empty" style={{ background: '#ffffff', padding: '1rem', border: '1px solid #d0d7de', borderRadius: '6px' }}>
            <SearchBar value="" onChange={() => { }} />
          </div>

          <div id="harness-search-bar-filled" style={{ background: '#ffffff', padding: '1rem', border: '1px solid #d0d7de', borderRadius: '6px' }}>
            <SearchBar value={searchValue} onChange={setSearchValue} />
          </div>
        </div>
      </section>

      {/* 3. DirectoryCard Component */}
      <section style={{ marginBottom: '3rem' }}>
        <h2>Directory Card</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          <div id="harness-directory-card-standard" style={{ padding: '0.5rem' }}>
            <DirectoryCard entry={sampleCardStandard} />
          </div>
          <div id="harness-directory-card-minimal" style={{ padding: '0.5rem' }}>
            <DirectoryCard entry={sampleCardMinimal} />
          </div>
        </div>
      </section>

      {/* 4. DirectoryTable Component */}
      <section style={{ marginBottom: '3rem' }}>
        <h2>Directory Table</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div>
            <h3>Populated Table</h3>
            <div id="harness-directory-table-populated" style={{ background: '#ffffff', padding: '0.5rem', border: '1px solid #d0d7de', borderRadius: '6px' }}>
              <DirectoryTable entries={MOCK_SEED_ENTRIES} loading={false} />
            </div>
          </div>

          <div>
            <h3>Loading State</h3>
            <div id="harness-directory-table-loading" style={{ background: '#ffffff', padding: '0.5rem', border: '1px solid #d0d7de', borderRadius: '6px' }}>
              <DirectoryTable entries={[]} loading={true} />
            </div>
          </div>

          <div>
            <h3>Empty State</h3>
            <div id="harness-directory-table-empty" style={{ background: '#ffffff', padding: '0.5rem', border: '1px solid #d0d7de', borderRadius: '6px' }}>
              <DirectoryTable entries={[]} loading={false} />
            </div>
          </div>
        </div>
      </section>

      {/* 5. SubmissionForm Component */}
      <section style={{ marginBottom: '3rem' }}>
        <h2>Submission Form</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div>
            <h3>Pristine / Empty Form</h3>
            <div id="harness-submission-form-empty" style={{ background: '#ffffff', padding: '1rem', border: '1px solid #d0d7de', borderRadius: '6px' }}>
              <SubmissionForm onSubmit={async () => { }} />
            </div>
          </div>

          <div>
            <h3>Form With Validation Error State</h3>
            <div id="harness-submission-form-validation" style={{ background: '#ffffff', padding: '1rem', border: '1px solid #d0d7de', borderRadius: '6px' }}>
              {/* Pre-populated form showing validation feedback */}
              <div className="submission-form-container">
                <form className="submission-form" onSubmit={(e) => e.preventDefault()}>
                  <div className="form-group">
                    <label htmlFor="harness-err-url" className="form-label">
                      Website URL <span className="required-star">*</span>
                    </label>
                    <input
                      id="harness-err-url"
                      type="url"
                      className="form-input input-error"
                      value="not-a-valid-url"
                      readOnly
                    />
                    <span className="field-error-message">
                      Please enter a valid URL starting with http:// or https:// (e.g., https://example.com).
                    </span>
                  </div>

                  <div className="form-group">
                    <label htmlFor="harness-err-name" className="form-label">
                      Product / Website Name
                    </label>
                    <input
                      id="harness-err-name"
                      type="text"
                      className="form-input"
                      value="My Project"
                      readOnly
                    />
                  </div>

                  <button type="submit" className="form-submit-button" disabled={false}>
                    Submit Website
                  </button>
                </form>
              </div>
            </div>
          </div>

          <div>
            <h3>Filled Form</h3>
            <div id="harness-submission-form-filled" style={{ background: '#ffffff', padding: '1rem', border: '1px solid #d0d7de', borderRadius: '6px' }}>
              <div className="submission-form-container">
                <form className="submission-form" onSubmit={(e) => e.preventDefault()}>
                  <div className="form-group">
                    <label htmlFor="harness-fill-url" className="form-label">
                      Website URL <span className="required-star">*</span>
                    </label>
                    <input
                      id="harness-fill-url"
                      type="url"
                      className="form-input"
                      value="https://mycoolsite.dev"
                      readOnly
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="harness-fill-name" className="form-label">
                      Product / Website Name
                    </label>
                    <input
                      id="harness-fill-name"
                      type="text"
                      className="form-input"
                      value="Cool Site"
                      readOnly
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="harness-fill-txt" className="form-label">
                      Direct llms.txt URL (optional)
                    </label>
                    <input
                      id="harness-fill-txt"
                      type="url"
                      className="form-input"
                      value="https://mycoolsite.dev/llms.txt"
                      readOnly
                    />
                  </div>

                  <button type="submit" className="form-submit-button" disabled={false}>
                    Submit Website
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. PaginationControls Component */}
      <section style={{ marginBottom: '3rem' }}>
        <h2>Pagination Controls</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div
            id="harness-pagination-controls"
            style={{
              background: '#ffffff',
              padding: '1rem',
              border: '1px solid #d0d7de',
              borderRadius: '6px',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <PaginationControls page={2} totalPages={5} onPageChange={() => { }} />
          </div>
        </div>
      </section>
    </div>
  );
}

const rootEl = document.getElementById('harness-root');
if (rootEl) {
  createRoot(rootEl).render(
    <React.StrictMode>
      <Harness />
    </React.StrictMode>
  );
}

