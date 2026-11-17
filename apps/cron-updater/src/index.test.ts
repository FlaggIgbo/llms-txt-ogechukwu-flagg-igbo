import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkStaleSites } from './jobs/checkStaleSites.js';
import { startCronUpdater } from './index.js';

describe('Cron Updater Service', () => {
  it('checkStaleSites executes and returns an array of update logs', async () => {
    const logs = await checkStaleSites(10);
    assert.ok(Array.isArray(logs));
  });

  it('exports startCronUpdater function', () => {
    assert.equal(typeof startCronUpdater, 'function');
  });
});
