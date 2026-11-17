import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { useEntries, useUpdatingEntries, matchesSearch, MOCK_SEED_ENTRIES } from './useEntries.js';
import { resolveLlmTxtUrl, DirectoryTable } from '../components/DirectoryTable.js';
import { DirectoryCard } from '../components/DirectoryCard.js';
import { SearchBar } from '../components/SearchBar.js';
import {
  isValidUrl,
  SubmissionForm,
  DAILY_ENTRY_LIMIT,
  RATE_LIMIT_STORAGE_KEY,
  getSessionSubmissionCount,
  recordSessionSubmission,
  isSessionRateLimited,
} from '../components/SubmissionForm.js';
import {
  checkIpRateLimit,
  recordIpSubmission,
  resetRateLimits,
} from '../../../../apps/api/src/services/rateLimiter.js';
import { db, DuplicateEntryError } from '@llmstxt/database';
import { HomePage } from '../pages/HomePage.js';
import { AddEntryPage } from '../pages/AddEntryPage.js';
import { UpdatesPage } from '../pages/UpdatesPage.js';
import {
  EntryStatus,
  EntryErrorCode,
  EntryErrorMessage,
  ApiErrorCode,
  ApiErrorMessage,
} from '@llmstxt/shared-types';
import { handlePostEntry } from '../../../../apps/api/src/routes/entries.js';
import { App, parseTabFromHash, getInitialTab } from '../App.js';
import { ErrorBoundary } from '../components/ErrorBoundary.js';

describe('useEntries and MOCK_SEED_ENTRIES', () => {
  describe('MOCK_SEED_ENTRIES', () => {
    // Verify seed count.
    it('contains exactly 4 mock seed entries', () => {
      assert.equal(MOCK_SEED_ENTRIES.length, 4);
    });

    // Verify required fields on each seed entry.
    it('has all required fields for each mock entry', () => {
      for (const entry of MOCK_SEED_ENTRIES) {
        assert.ok(entry.id, 'Entry should have an id');
        assert.ok(entry.website_name, `Entry ${entry.id} should have website_name`);
        assert.ok(entry.website_url.startsWith('https://'), `Entry ${entry.id} should have a valid https URL`);
        assert.ok(entry.website_short_description, `Entry ${entry.id} should have a description`);
        assert.equal(entry.status, EntryStatus.COMPLETED);
        assert.ok(entry.created_at, `Entry ${entry.id} should have created_at`);
        assert.ok(entry.updated_at, `Entry ${entry.id} should have updated_at`);
      }
    });

    // Verify expected website names.
    it('contains expected known seed sites', () => {
      const names = MOCK_SEED_ENTRIES.map((e) => e.website_name);
      assert.ok(names.includes('FastAPI'));
      assert.ok(names.includes('Anthropic Docs'));
      assert.ok(names.includes('llmstxt.org'));
      assert.ok(names.includes('Hugging Face'));
    });
  });

  describe('useEntries hook', () => {
    // Verify initial hook state.
    it('initializes with loading state when rendered', () => {
      let hookOutput: ReturnType<typeof useEntries> | undefined;

      function TestComponent() {
        hookOutput = useEntries();
        return React.createElement('div', null, hookOutput.loading ? 'loading' : 'done');
      }

      const html = renderToString(React.createElement(TestComponent));

      assert.ok(html.includes('loading'));
      assert.ok(hookOutput !== undefined);
      assert.equal(hookOutput.loading, true);
      assert.deepEqual(hookOutput.entries, []);
      assert.equal(hookOutput.error, null);
      assert.equal(typeof hookOutput.refresh, 'function');
      assert.equal(typeof hookOutput.submitEntry, 'function');
    });

    // Verify case-insensitive search filtering.
    it('filters entries case-insensitively by search query', () => {
      const filtered = [];
      for (const item of MOCK_SEED_ENTRIES) {
        if (matchesSearch(item, 'anthropic')) {
          filtered.push(item);
        }
      }

      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].website_name, 'Anthropic Docs');
    });
  });

  describe('resolveLlmTxtUrl and DirectoryCard', () => {
    it('resolves stored txt URLs from entry.llms_txt_storage', () => {
      const entry = {
        ...MOCK_SEED_ENTRIES[0],
        llm_txt: null,
        llms_txt_storage: 'https://cdn.example.com/llms.txt',
      };
      assert.equal(resolveLlmTxtUrl(entry), 'https://cdn.example.com/llms.txt');
    });

    it('renders DirectoryCard with hyperlinked URL pointing to .txt file', () => {
      const entry = {
        ...MOCK_SEED_ENTRIES[0],
        llm_txt: 'https://r2.example.com/fastapi/llms.txt',
      };
      const html = renderToString(React.createElement(DirectoryCard, { entry }));
      assert.ok(html.includes('href="https://r2.example.com/fastapi/llms.txt"'));
      assert.ok(html.includes('FastAPI'));
    });
  });

  describe('DirectoryTable', () => {
    it('returns empty output (null) when error is present', () => {
      const html = renderToString(
        React.createElement(DirectoryTable, {
          entries: [],
          error: 'Failed to fetch (localhost:4000)',
        })
      );
      assert.equal(html, '');
    });

    it('renders table when error is null', () => {
      const html = renderToString(
        React.createElement(DirectoryTable, {
          entries: MOCK_SEED_ENTRIES,
          error: null,
        })
      );
      assert.ok(html.includes('directory-table'));
      assert.ok(html.includes('table-wrapper'));
    });
  });

  describe('isValidUrl', () => {
    it('accepts valid http and https URLs', () => {
      assert.equal(isValidUrl('https://example.com'), true);
      assert.equal(isValidUrl('http://example.com/llms.txt'), true);
      assert.equal(isValidUrl('https://sub.domain.org/path?q=1'), true);
    });

    it('rejects invalid or non-http URLs', () => {
      assert.equal(isValidUrl(''), false);
      assert.equal(isValidUrl('not-a-url'), false);
      assert.equal(isValidUrl('ftp://example.com'), false);
      assert.equal(isValidUrl('javascript:alert(1)'), false);
    });
  });

  describe('SubmissionForm & AddEntryPage', () => {
    it('renders all 5 specified fields and submit button', () => {
      const html = renderToString(
        React.createElement(AddEntryPage, {
          onSubmit: async () => {},
        })
      );

      // Verify page and fields
      assert.ok(html.includes('Product Name'));
      assert.ok(html.includes('Website URL'));
      assert.ok(html.includes('llms.txt URL'));
      assert.ok(html.includes('llms-full.txt URL'));
      assert.ok(html.includes('Additional Notes'));
      assert.ok(html.includes('Submit Entry'));
      assert.ok(html.includes('Daily submission limit: 20 entries per day'));
    });

    it('enforces rate limiting of 20 entries per day via sessionStorage', () => {
      // Mock window.sessionStorage
      const mockStorage: { [key: string]: string } = {};
      const today = new Date().toISOString().slice(0, 10);
      mockStorage[RATE_LIMIT_STORAGE_KEY] = JSON.stringify({ date: today, count: 20 });

      (globalThis as any).window = {
        sessionStorage: {
          getItem: (key: string) => mockStorage[key] || null,
          setItem: (key: string, val: string) => {
            mockStorage[key] = val;
          },
        },
      };

      assert.equal(getSessionSubmissionCount(), 20);
      assert.equal(isSessionRateLimited(), true);

      // Rendering when rate limited shows warning and disables submit
      const html = renderToString(
        React.createElement(SubmissionForm, {
          onSubmit: async () => {},
        })
      );

      assert.ok(html.includes('exceeded your allowed entry adds'));
      assert.ok(html.includes('Daily Limit Reached'));

      delete (globalThis as any).window;
    });
  });

  describe('IP Rate Limiter (backend)', () => {
    it('allows up to 20 submissions per day and blocks the 21st', () => {
      resetRateLimits();
      const testIp = '192.168.1.100';

      for (let i = 0; i < 20; i++) {
        const check = checkIpRateLimit(testIp);
        assert.equal(check.allowed, true, `Submission ${i + 1} should be allowed`);
        assert.equal(check.remaining, 20 - i);
        recordIpSubmission(testIp);
      }

      // 21st attempt should be blocked with rate limit
      const blockedCheck = checkIpRateLimit(testIp);
      assert.equal(blockedCheck.allowed, false, '21st submission should be blocked');
      assert.equal(blockedCheck.remaining, 0);
      assert.ok(blockedCheck.retryAfterSeconds > 0);

      resetRateLimits();
    });
  });

  describe('UpdatesPage', () => {
    it('renders empty state when no entries are updating', () => {
      const html = renderToString(
        React.createElement(UpdatesPage, {
          entries: MOCK_SEED_ENTRIES, // all COMPLETED & is_updated_latest = true
          onRefresh: async () => {},
        })
      );

      assert.ok(html.includes('No entries currently updating'));
      assert.ok(!html.includes('updates-table'));
    });

    it('renders updating entries when status is PENDING or PROCESSING', () => {
      const pendingEntry = {
        ...MOCK_SEED_ENTRIES[0],
        id: 'updating-1',
        website_name: 'Queued Website',
        website_url: 'https://queued.example.com',
        status: EntryStatus.PENDING,
        is_updated_latest: false,
      };

      const html = renderToString(
        React.createElement(UpdatesPage, {
          entries: [...MOCK_SEED_ENTRIES, pendingEntry],
          onRefresh: async () => {},
        })
      );

      assert.ok(html.includes('updates-table'));
      assert.ok(html.includes('Queued Website'));
      assert.ok(html.includes('Queued'));
    });

    it('shows failed status icon next to failed user submissions without error banner', () => {
      const failedUserEntry = {
        ...MOCK_SEED_ENTRIES[0],
        id: 'failed-user-1',
        website_name: 'Failed Site',
        website_url: 'https://failed.example.com',
        status: EntryStatus.FAILED,
        error_message: 'Failed to crawl website: HTTP 404',
        is_scheduled_update: false,
      };

      const html = renderToString(
        React.createElement(UpdatesPage, {
          entries: [failedUserEntry],
          onRefresh: async () => {},
        })
      );

      assert.ok(html.includes('updates-table'));
      assert.ok(html.includes('Failed Site'));
      assert.ok(html.includes('Failed'));
      assert.ok(html.includes('status-failed-icon'));
      assert.ok(html.includes('Failed to crawl website: HTTP 404'));
      assert.ok(!html.includes('entry-error-tag'));
    });

    it('shows failed status badge with error tag along with icon when duplicate URL entry already exists in db', () => {
      const duplicateEntry = {
        ...MOCK_SEED_ENTRIES[0],
        id: 'dup-1',
        website_name: 'FastAPI Clone',
        website_url: 'https://fastapi.tiangolo.com',
        status: EntryStatus.FAILED,
        error_code: EntryErrorCode.DUPLICATE_URL,
        error_message: EntryErrorMessage.DUPLICATE_URL,
        is_scheduled_update: false,
      };

      const html = renderToString(
        React.createElement(UpdatesPage, {
          entries: [duplicateEntry],
          onRefresh: async () => {},
        })
      );

      assert.ok(html.includes('updates-table'));
      assert.ok(html.includes('FastAPI Clone'));
      assert.ok(html.includes('status-failed'));
      assert.ok(html.includes('status-failed-icon'));
      assert.ok(html.includes('Website URL already exists in site_entries table'));
      assert.ok(html.includes('entry-error-tag'));
      assert.ok(html.includes('error-duplicate-url'));
    });

    it('excludes cron-scheduled failed entries from the updates queue', () => {
      const failedCronEntry = {
        ...MOCK_SEED_ENTRIES[0],
        id: 'failed-cron-1',
        website_name: 'Cron Failed Site',
        website_url: 'https://cron-failed.example.com',
        status: EntryStatus.FAILED,
        error_message: 'Probe timeout',
        is_scheduled_update: true,
      };

      const html = renderToString(
        React.createElement(UpdatesPage, {
          entries: [failedCronEntry],
          onRefresh: async () => {},
        })
      );

      // Should show empty state since cron failure was filtered out of updates queue
      assert.ok(html.includes('No entries currently updating'));
      assert.ok(!html.includes('Cron Failed Site'));
    });
  });

  describe('useUpdatingEntries hook', () => {
    it('initializes with loading state when rendered', () => {
      let hookOutput: ReturnType<typeof useUpdatingEntries> | undefined;

      function TestUpdatingComponent() {
        hookOutput = useUpdatingEntries();
        return React.createElement('div', null, hookOutput.loading ? 'loading' : 'done');
      }

      const html = renderToString(React.createElement(TestUpdatingComponent));

      assert.ok(html.includes('loading'));
      assert.ok(hookOutput !== undefined);
      assert.equal(hookOutput.loading, true);
      assert.deepEqual(hookOutput.updatingEntries, []);
      assert.equal(hookOutput.error, null);
      assert.equal(typeof hookOutput.refresh, 'function');
    });
  });

  describe('SearchBar Component', () => {
    it('renders input wrapper and hides spinner when loading is false', () => {
      const html = renderToString(
        React.createElement(SearchBar, {
          value: 'test',
          onChange: () => {},
          loading: false,
        })
      );

      assert.ok(html.includes('search-bar-wrapper'));
      assert.ok(html.includes('value="test"'));
      assert.ok(!html.includes('search-spinner'));
    });

    it('renders search-spinner inside wrapper when loading is true', () => {
      const html = renderToString(
        React.createElement(SearchBar, {
          value: 'fast',
          onChange: () => {},
          loading: true,
        })
      );

      assert.ok(html.includes('search-bar-wrapper'));
      assert.ok(html.includes('search-spinner'));
      assert.ok(html.includes('search-loading'));
    });
  });

  describe('HomePage', () => {
    it('hides table and footer when error banner is shown', () => {
      const html = renderToString(
        React.createElement(HomePage, {
          entries: [],
          loading: false,
          error: 'Failed to fetch (localhost:4000)',
          searchQuery: '',
          onSearchChange: () => {},
          onRefresh: async () => {},
        })
      );

      assert.ok(html.includes('error-banner'));
      assert.ok(html.includes('Failed to fetch (localhost:4000)'));
      assert.ok(!html.includes('table-wrapper'));
      assert.ok(!html.includes('directory-footer'));
    });

    it('renders pagination controls when totalPages > 1', () => {
      const html = renderToString(
        React.createElement(HomePage, {
          entries: MOCK_SEED_ENTRIES.slice(0, 2),
          loading: false,
          error: null,
          searchQuery: '',
          onSearchChange: () => {},
          onRefresh: async () => {},
          page: 1,
          totalPages: 2,
          total: 4,
          onPageChange: () => {},
        })
      );

      assert.ok(html.includes('pagination-controls'));
      assert.ok(html.includes('Previous'));
      assert.ok(html.includes('Page 1 of 2'));
      assert.ok(html.includes('Next'));
      assert.ok(html.includes('Showing 2 of 4 entries'));
    });
  });

  describe('App with three tabs and hash routing', () => {
    it('renders three navigation tabs at the top', () => {
      const html = renderToString(React.createElement(App));

      assert.ok(html.includes('nav-tabs'));
      assert.ok(html.includes('Directory'));
      assert.ok(html.includes('Add Entry'));
      assert.ok(html.includes('Updates'));
    });

    it('resolves valid URL hashes accurately with strict exact matching', () => {
      assert.equal(parseTabFromHash(''), 'home');
      assert.equal(parseTabFromHash('#'), 'home');
      assert.equal(parseTabFromHash('#home'), 'home');
      assert.equal(parseTabFromHash('#/home'), 'home');
      assert.equal(parseTabFromHash('#add'), 'add');
      assert.equal(parseTabFromHash('#/add'), 'add');
      assert.equal(parseTabFromHash('#updates'), 'updates');
      assert.equal(parseTabFromHash('#/updates'), 'updates');
    });

    it('throws an error for unrecognized URL hash such as #address', () => {
      assert.throws(
        () => parseTabFromHash('#address'),
        /Invalid URL hash: "#address". Valid hashes are: #home, #add, #updates/
      );
    });

    it('reads initial tab from window.location.hash with getInitialTab()', () => {
      (globalThis as any).window = {
        location: { hash: '#add' },
      };
      assert.equal(getInitialTab(), 'add');

      (globalThis as any).window = {
        location: { hash: '#address' },
      };
      assert.throws(
        () => getInitialTab(),
        /Invalid URL hash: "#address"/
      );

      delete (globalThis as any).window;
    });

    it('renders ErrorBoundary with "Return to Directory" button when an error is caught', () => {
      const boundary = new ErrorBoundary({ children: null });
      const derivedState = ErrorBoundary.getDerivedStateFromError(
        new Error('Invalid URL hash: "#address". Valid hashes are: #home, #add, #updates')
      );
      assert.equal(derivedState.hasError, true);
      assert.equal(
        derivedState.error?.message,
        'Invalid URL hash: "#address". Valid hashes are: #home, #add, #updates'
      );

      boundary.state = derivedState;
      const html = renderToString(boundary.render() as React.ReactElement);
      assert.ok(html.includes('Something went wrong'));
      assert.ok(html.includes('Invalid URL hash:'));
      assert.ok(html.includes('#address'));
      assert.ok(html.includes('Return to Directory'));
    });

    it('clears window.location.hash and triggers onReset when Return to Directory is clicked', () => {
      let resetCalled = false;
      const boundary = new ErrorBoundary({
        children: null,
        onReset: () => {
          resetCalled = true;
        },
      });
      (globalThis as any).window = {
        location: {
          hash: '#address',
        },
      };

      boundary.handleReturnToDirectory();

      assert.equal((globalThis as any).window.location.hash, '');
      assert.equal(resetCalled, true);

      delete (globalThis as any).window;
    });
  });

  describe('Duplicate URL detection in site_entries', () => {
    it('throws DuplicateEntryError and writes nothing when URL already exists with COMPLETED status', async () => {
      const initialSeedCount = MOCK_SEED_ENTRIES.length;

      await assert.rejects(
        async () => {
          await db.createEntryWithCadence({
            website_url: 'https://fastapi.tiangolo.com', // Already in MOCK_SEED_ENTRIES with COMPLETED status
            website_name: 'FastAPI Clone',
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof DuplicateEntryError || (err as Error).name === 'DuplicateEntryError');
          assert.equal((err as Error).message, ApiErrorMessage.DUPLICATE_URL);
          return true;
        }
      );

      // Verify no phantom entry was created in mock seed data
      assert.equal(MOCK_SEED_ENTRIES.length, initialSeedCount);
    });

    it('returns HTTP 409 Conflict rest response on POST /entries when URL already exists', async () => {
      let statusCode = 0;
      let responseBody = '';
      const headers: Record<string, string> = {};

      const mockReq: any = {
        headers: { 'x-forwarded-for': '127.0.0.1' },
        body: {
          website_url: 'https://fastapi.tiangolo.com',
          website_name: 'FastAPI Duplicate',
        },
      };

      const mockRes: any = {
        writeHead: (code: number, hdrs: Record<string, string>) => {
          statusCode = code;
          Object.assign(headers, hdrs);
        },
        end: (data: string) => {
          responseBody = data;
        },
      };

      await handlePostEntry(mockReq, mockRes);

      assert.equal(statusCode, 409);
      const parsed = JSON.parse(responseBody);
      assert.equal(parsed.error, ApiErrorMessage.DUPLICATE_URL);
      assert.equal(parsed.code, ApiErrorCode.CONFLICT);
    });
  });

  describe('saveStorageFile and getStorageFile storage operations', () => {
    it('persists and retrieves storage file via dev fallback', async () => {
      const testPath = 'test-org/docs/llms.txt';
      const testContent = '# Test Docs\n\n> Summary';

      await db.saveStorageFile(testPath, testContent);
      const retrieved = await db.getStorageFile(testPath);

      assert.equal(retrieved, testContent);
    });

    it('returns null when storage file does not exist', async () => {
      const retrieved = await db.getStorageFile('non-existent-path/llms.txt');
      assert.equal(retrieved, null);
    });
  });
});
