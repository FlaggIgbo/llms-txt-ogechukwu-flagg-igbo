import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { db, DuplicateEntryError, MOCK_SEED_ENTRIES } from './index.js';

describe('Database Client and Utilities', () => {
  it('exports db singleton instance', () => {
    assert.ok(db);
    assert.equal(typeof db.listEntries, 'function');
    assert.equal(typeof db.getEntryByUrl, 'function');
  });

  it('instantiates DuplicateEntryError with expected code and message', () => {
    const error = new DuplicateEntryError('https://example.com');
    assert.equal(error.name, 'DuplicateEntryError');
    assert.equal(error.code, 'CONFLICT');
    assert.ok(error.message.includes('https://example.com'));
  });

  it('contains expected seed entries in MOCK_SEED_ENTRIES', () => {
    assert.ok(MOCK_SEED_ENTRIES.length >= 4);
    for (const entry of MOCK_SEED_ENTRIES) {
      assert.ok(entry.id);
      assert.ok(entry.website_url);
      assert.ok(entry.website_name);
    }
  });
});
