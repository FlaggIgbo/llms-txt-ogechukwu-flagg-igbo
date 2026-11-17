import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { StorageService } from './storageService.js';

describe('StorageService (getDownloadUrl)', () => {
  const service = new StorageService();
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.STORAGE_PROVIDER;
    delete process.env.R2_PUBLIC_URL;
    delete process.env.S3_PUBLIC_URL;
    delete process.env.S3_ENDPOINT;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns null if uri is null or empty', () => {
    assert.equal(service.getDownloadUrl(null), null);
    assert.equal(service.getDownloadUrl(''), null);
  });

  it('returns direct http/https URLs untouched', () => {
    assert.equal(
      service.getDownloadUrl('https://example.com/llms.txt'),
      'https://example.com/llms.txt'
    );
    assert.equal(
      service.getDownloadUrl('http://cdn.org/data/file.txt'),
      'http://cdn.org/data/file.txt'
    );
  });

  describe('When STORAGE_PROVIDER=minio', () => {
    it('ignores R2_PUBLIC_URL and CLOUDFLARE_ACCOUNT_ID, defaulting to MinIO endpoint', () => {
      process.env.STORAGE_PROVIDER = 'minio';
      process.env.R2_PUBLIC_URL = 'https://prod-r2.example.com';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'cloudflare-account-123';

      const url = service.getDownloadUrl('r2://llmstxt-files-bucket/test-site/llms.txt');
      assert.equal(url, 'http://localhost:9000/llmstxt-files-bucket/test-site/llms.txt');
    });

    it('uses S3_PUBLIC_URL when provided', () => {
      process.env.STORAGE_PROVIDER = 'minio';
      process.env.R2_PUBLIC_URL = 'https://prod-r2.example.com';
      process.env.S3_PUBLIC_URL = 'http://127.0.0.1:9000';

      const url = service.getDownloadUrl('s3://my-bucket/site/llms.txt');
      assert.equal(url, 'http://127.0.0.1:9000/my-bucket/site/llms.txt');
    });

    it('uses S3_ENDPOINT when S3_PUBLIC_URL is not set', () => {
      process.env.STORAGE_PROVIDER = 'minio';
      process.env.S3_ENDPOINT = 'http://minio-server:9000';

      const url = service.getDownloadUrl('r2://my-bucket/site/llms.txt');
      assert.equal(url, 'http://minio-server:9000/my-bucket/site/llms.txt');
    });
  });

  describe('When STORAGE_PROVIDER=r2', () => {
    it('uses R2_PUBLIC_URL for download links', () => {
      process.env.STORAGE_PROVIDER = 'r2';
      process.env.R2_PUBLIC_URL = 'https://pub-abc123.r2.dev';

      const url = service.getDownloadUrl('r2://my-bucket/site/llms.txt');
      assert.equal(url, 'https://pub-abc123.r2.dev/my-bucket/site/llms.txt');
    });

    it('falls back to CLOUDFLARE_ACCOUNT_ID if R2_PUBLIC_URL is unset', () => {
      process.env.STORAGE_PROVIDER = 'r2';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'cf-acc-456';

      const url = service.getDownloadUrl('r2://my-bucket/site/llms.txt');
      assert.equal(url, 'https://cf-acc-456.r2.cloudflarestorage.com/my-bucket/site/llms.txt');
    });
  });
});

