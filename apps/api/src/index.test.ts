import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validatePublicUrl, isPrivateOrReservedIp } from './services/urlValidator.js';
import { getClientIp, checkIpRateLimit, recordIpSubmission } from './services/rateLimiter.js';
import { searchService } from './services/searchService.js';
import type { TypedApiRequest } from '@llmstxt/shared-types';

describe('SSRF Protection (validatePublicUrl)', () => {
  it('blocks localhost and loopback IPv4/IPv6', async () => {
    assert.equal((await validatePublicUrl('http://localhost')).valid, false);
    assert.equal((await validatePublicUrl('http://localhost:3000')).valid, false);
    assert.equal((await validatePublicUrl('http://127.0.0.1')).valid, false);
    assert.equal((await validatePublicUrl('http://127.0.0.50:8080/secret')).valid, false);
    assert.equal((await validatePublicUrl('http://[::1]')).valid, false);
  });

  it('blocks cloud metadata endpoint (169.254.169.254)', async () => {
    assert.equal((await validatePublicUrl('http://169.254.169.254/latest/meta-data/')).valid, false);
    assert.equal((await validatePublicUrl('http://169.254.1.1')).valid, false);
  });

  it('blocks RFC 1918 private IPv4 subnets', async () => {
    assert.equal((await validatePublicUrl('http://10.0.0.1/admin')).valid, false);
    assert.equal((await validatePublicUrl('http://172.16.0.1/')).valid, false);
    assert.equal((await validatePublicUrl('http://172.31.255.255/')).valid, false);
    assert.equal((await validatePublicUrl('http://192.168.1.1/setup')).valid, false);
  });

  it('blocks non-HTTP/HTTPS protocols', async () => {
    assert.equal((await validatePublicUrl('file:///etc/passwd')).valid, false);
    assert.equal((await validatePublicUrl('ftp://ftp.example.com/file')).valid, false);
    assert.equal((await validatePublicUrl('gopher://example.com')).valid, false);
    assert.equal((await validatePublicUrl('javascript:alert(1)')).valid, false);
  });

  it('identifies private and reserved IP addresses directly', () => {
    assert.equal(isPrivateOrReservedIp('127.0.0.1'), true);
    assert.equal(isPrivateOrReservedIp('10.254.0.1'), true);
    assert.equal(isPrivateOrReservedIp('169.254.169.254'), true);
    assert.equal(isPrivateOrReservedIp('192.168.0.1'), true);
    assert.equal(isPrivateOrReservedIp('172.20.0.1'), true);
    assert.equal(isPrivateOrReservedIp('8.8.8.8'), false);
    assert.equal(isPrivateOrReservedIp('1.1.1.1'), false);
  });

  it('permits valid public URLs', async () => {
    assert.equal((await validatePublicUrl('https://example.com')).valid, true);
    assert.equal((await validatePublicUrl('https://docs.github.com/en')).valid, true);
    assert.equal((await validatePublicUrl('http://fastapi.tiangolo.com')).valid, true);
  });

  it('permits localhost and internal URLs when allowLocal is explicitly enabled', async () => {
    assert.equal((await validatePublicUrl('http://localhost:3000', { allowLocal: true })).valid, true);
    assert.equal((await validatePublicUrl('http://127.0.0.1:8080/docs', { allowLocal: true })).valid, true);
  });
});

describe('Rate Limiter Anti-Spoofing & Limits', () => {
  it('extracts rightmost IP from X-Forwarded-For to prevent client spoofing', () => {
    const req = {
      headers: {
        'x-forwarded-for': 'spoofed.attacker.ip, 203.0.113.195',
      },
      socket: { remoteAddress: '10.0.0.1' },
    } as unknown as TypedApiRequest<unknown>;

    assert.equal(getClientIp(req), '203.0.113.195');
  });

  it('prioritizes CF-Connecting-IP over X-Forwarded-For', () => {
    const req = {
      headers: {
        'cf-connecting-ip': '198.51.100.42',
        'x-forwarded-for': 'spoofed.ip',
      },
      socket: { remoteAddress: '10.0.0.1' },
    } as unknown as TypedApiRequest<unknown>;

    assert.equal(getClientIp(req), '198.51.100.42');
  });

  it('prioritizes Render-Client-IP if present', () => {
    const req = {
      headers: {
        'render-client-ip': '198.51.100.99',
        'x-forwarded-for': 'spoofed.ip',
      },
      socket: { remoteAddress: '10.0.0.1' },
    } as unknown as TypedApiRequest<unknown>;

    assert.equal(getClientIp(req), '198.51.100.99');
  });

  it('enforces limit of 20 entries per day and blocks the 21st', () => {
    const testIp = '198.51.100.77';

    for (let i = 0; i < 20; i++) {
      const check = checkIpRateLimit(testIp, 20);
      assert.equal(check.allowed, true);
      recordIpSubmission(testIp);
    }

    const blockedCheck = checkIpRateLimit(testIp, 20);
    assert.equal(blockedCheck.allowed, false);
    assert.equal(blockedCheck.remaining, 0);
  });
});

describe('Search Service & Pagination', () => {
  it('fetches entries with pagination using searchService.getAllEntries', async () => {
    const result = await searchService.getAllEntries(2, 0);
    assert.ok(Array.isArray(result.entries));
    assert.ok(result.entries.length <= 2);
    assert.ok(typeof result.total === 'number');
  });

  it('searches entries with query and offset', async () => {
    const result = await searchService.searchEntries({ q: 'FastAPI', limit: 10, offset: 0 });
    assert.ok(Array.isArray(result.entries));
    assert.ok(typeof result.total === 'number');
  });
});

describe('Sentry API Error Interception', () => {
  it('captures API endpoint errors in Sentry with request context', async () => {
    const { getSentryClient, logError } = await import('@llmstxt/logger');
    const sentry = await getSentryClient();
    let capturedEvent: any = null;

    sentry.init({
      dsn: 'https://1234567890abcdef1234567890abcdef@o123456.ingest.sentry.io/123456',
      beforeSend(event: any) {
        capturedEvent = event;
        return null;
      },
    });

    logError(new Error('Internal database failure on /entries'), {
      endpoint: 'GET /entries',
      url: '/entries?status=Pending',
      method: 'GET',
    });

    await sentry.flush(500);

    assert.ok(capturedEvent !== null, 'Sentry should capture the API error');
    assert.equal(capturedEvent.exception?.values?.[0]?.value, 'Internal database failure on /entries');
    assert.equal(capturedEvent.extra?.endpoint, 'GET /entries');
    assert.equal(capturedEvent.extra?.url, '/entries?status=Pending');
  });

  it('captures real handlePostEntry errors (e.g. malformed JSON) in Sentry', async () => {
    const { Readable } = await import('node:stream');
    const { getSentryClient } = await import('@llmstxt/logger');
    const { handlePostEntry } = await import('./routes/entries.js');
    const sentry = await getSentryClient();
    let capturedEvent: any = null;

    sentry.init({
      dsn: 'https://1234567890abcdef1234567890abcdef@o123456.ingest.sentry.io/123456',
      beforeSend(event: any) {
        capturedEvent = event;
        return null;
      },
    });

    const req = Object.assign(Readable.from(['{invalid_json']), {
      method: 'POST',
      url: '/entries',
      headers: { 'x-forwarded-for': '198.51.100.123' },
      socket: { remoteAddress: '198.51.100.123' },
    }) as any;

    let responseStatus = 0;
    const res = {
      writeHead(status: number) {
        responseStatus = status;
      },
      end() {},
    } as any;

    await handlePostEntry(req, res);
    await sentry.flush(500);

    assert.equal(responseStatus, 500);
    assert.ok(capturedEvent !== null, 'Sentry should capture the route error');
    assert.equal(capturedEvent.extra?.endpoint, 'POST /entries');
  });
});
