import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initSentry, logError, logInfo, logWarn, getSentryClient } from './index.js';

describe('Sentry Logger Integration', () => {
  it('returns null from initSentry if no SENTRY_DSN is provided', async () => {
    delete process.env.SENTRY_DSN;
    const client = await initSentry();
    assert.equal(client, null);
  });

  it('initializes Sentry when DSN is provided', async () => {
    const dummyDsn = 'https://1234567890abcdef1234567890abcdef@o123456.ingest.sentry.io/123456';
    const client = await initSentry(dummyDsn);
    assert.ok(client !== null);
    assert.equal(typeof client.captureException, 'function');
    assert.equal(typeof client.captureMessage, 'function');
    assert.equal(client.isInitialized(), true);
  });

  it('captures Error exceptions with context in Sentry', async () => {
    const sentry = await getSentryClient();
    let capturedEvent: any = null;

    sentry.init({
      dsn: 'https://1234567890abcdef1234567890abcdef@o123456.ingest.sentry.io/123456',
      beforeSend(event: any) {
        capturedEvent = event;
        return null;
      },
    });

    const testError = new Error('Database connection failed on /entries');
    logError(testError, { endpoint: 'GET /entries', statusCode: 500 });

    await sentry.flush(500);

    assert.ok(capturedEvent !== null, 'Sentry should capture the event');
    assert.equal(capturedEvent.exception?.values?.[0]?.value, 'Database connection failed on /entries');
    assert.deepEqual(capturedEvent.extra, { endpoint: 'GET /entries', statusCode: 500 });
  });

  it('captures string errors as Sentry messages with error level', async () => {
    const sentry = await getSentryClient();
    let capturedEvent: any = null;

    sentry.init({
      dsn: 'https://1234567890abcdef1234567890abcdef@o123456.ingest.sentry.io/123456',
      beforeSend(event: any) {
        capturedEvent = event;
        return null;
      },
    });

    logError('Raw error string failure');
    await sentry.flush(500);

    assert.ok(capturedEvent !== null);
    assert.equal(capturedEvent.message, 'Raw error string failure');
    assert.equal(capturedEvent.level, 'error');
  });

  it('handles logInfo and logWarn without crashing', () => {
    assert.doesNotThrow(() => {
      logInfo('Test info log');
      logWarn('Test warning log');
    });
  });
});
