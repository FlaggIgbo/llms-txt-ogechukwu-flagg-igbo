import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { useEntries, MOCK_SEED_ENTRIES } from './useEntries.js';

describe('useEntries and MOCK_SEED_ENTRIES', () => {
  describe('MOCK_SEED_ENTRIES', () => {
    it('contains exactly 4 mock seed entries', () => {
      assert.equal(MOCK_SEED_ENTRIES.length, 4);
    });

    it('has all required fields for each mock entry', () => {
      for (const entry of MOCK_SEED_ENTRIES) {
        assert.ok(entry.id, 'Entry should have an id');
        assert.ok(entry.website_name, `Entry ${entry.id} should have website_name`);
        assert.ok(entry.website_url.startsWith('https://'), `Entry ${entry.id} should have a valid https URL`);
        assert.ok(entry.website_short_description, `Entry ${entry.id} should have a description`);
        assert.equal(entry.status, 'COMPLETED');
        assert.ok(entry.created_at, `Entry ${entry.id} should have created_at`);
        assert.ok(entry.updated_at, `Entry ${entry.id} should have updated_at`);
      }
    });

    it('contains expected known seed sites', () => {
      const names = MOCK_SEED_ENTRIES.map((e) => e.website_name);
      assert.ok(names.includes('FastAPI'));
      assert.ok(names.includes('Anthropic Docs'));
      assert.ok(names.includes('llmstxt.org'));
      assert.ok(names.includes('Hugging Face'));
    });
  });

  describe('useEntries hook', () => {
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

    it('filters entries case-insensitively by search query', () => {
      const q = 'anthropic';
      const filtered = MOCK_SEED_ENTRIES.filter((item) => {
        const name = (item.website_name ?? '').toLowerCase();
        const desc = (item.website_short_description ?? '').toLowerCase();
        const url = (item.website_url ?? '').toLowerCase();
        return name.includes(q) || desc.includes(q) || url.includes(q);
      });

      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].website_name, 'Anthropic Docs');
    });
  });
});

