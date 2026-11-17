import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { StorageService } from './storageService.js';
import { formatEntryStorageUrls } from '../routes/entries.js';
import { type SiteEntry, EntryStatus } from '@llmstxt/shared-types';

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

    it('routes through /storage/ proxy route if R2_PUBLIC_URL is unset', () => {
      process.env.STORAGE_PROVIDER = 'r2';
      process.env.PORT = '4000';

      const url = service.getDownloadUrl('r2://my-bucket/site/llms.txt');
      assert.equal(url, 'http://localhost:4000/storage/site/llms.txt');
    });

    it('converts private r2.cloudflarestorage.com endpoints to /storage/ proxy route', () => {
      process.env.STORAGE_PROVIDER = 'r2';
      process.env.PORT = '4000';

      const url = service.getDownloadUrl(
        'https://cf-acc-456.r2.cloudflarestorage.com/my-bucket/site/llms.txt'
      );
      assert.equal(url, 'http://localhost:4000/storage/site/llms.txt');
    });
  });

  describe('formatEntryStorageUrls (home page generated vs official file resolution)', () => {
    it('returns llms-full.txt URL for generated websites', () => {
      process.env.STORAGE_PROVIDER = 'r2';
      process.env.PORT = '4000';

      const generatedEntry: SiteEntry = {
        id: '12345678-1234-1234-1234-123456789abc',
        website_name: 'Generated Docs',
        website_url: 'https://docs.generated.com',
        website_short_description: 'Generated technical documentation',
        is_updated_latest: true,
        llms_txt_storage: 'r2://llmstxt-files-bucket/docs.generated.com/llms.txt',
        llms_full_txt_storage: 'r2://llmstxt-files-bucket/docs.generated.com/llms-full.txt',
        status: EntryStatus.COMPLETED,
        created_at: '2026-11-01T10:00:00.000Z',
        updated_at: '2026-11-14T14:22:10.000Z',
      };

      const formatted = formatEntryStorageUrls(generatedEntry);
      assert.equal(formatted.llm_txt, 'http://localhost:4000/storage/docs.generated.com/llms-full.txt');
      assert.equal(formatted.llms_txt_storage, 'http://localhost:4000/storage/docs.generated.com/llms.txt');
      assert.equal(formatted.llms_full_txt_storage, 'http://localhost:4000/storage/docs.generated.com/llms-full.txt');
    });

    it('falls back to normal llms.txt if something is wrong with llms.txt full', () => {
      process.env.STORAGE_PROVIDER = 'r2';
      process.env.PORT = '4000';

      const entryWithNullFull: SiteEntry = {
        id: '12345678-1234-1234-1234-123456789abc',
        website_name: 'Generated Docs',
        website_url: 'https://docs.generated.com',
        website_short_description: 'Generated technical documentation',
        is_updated_latest: true,
        llms_txt_storage: 'r2://llmstxt-files-bucket/docs.generated.com/llms.txt',
        llms_full_txt_storage: null,
        status: EntryStatus.COMPLETED,
        created_at: '2026-11-01T10:00:00.000Z',
        updated_at: '2026-11-14T14:22:10.000Z',
      };

      const formattedNull = formatEntryStorageUrls(entryWithNullFull);
      assert.equal(formattedNull.llm_txt, 'http://localhost:4000/storage/docs.generated.com/llms.txt');

      const entryWithEmptyFull: SiteEntry = {
        ...entryWithNullFull,
        llms_full_txt_storage: '   ',
      };

      const formattedEmpty = formatEntryStorageUrls(entryWithEmptyFull);
      assert.equal(formattedEmpty.llm_txt, 'http://localhost:4000/storage/docs.generated.com/llms.txt');
    });

    it('returns llms.txt for official websites where the site already has one', () => {
      const officialEntry: SiteEntry = {
        id: '00000000-0000-0000-0000-000000000001',
        website_name: 'FastAPI',
        website_url: 'https://fastapi.tiangolo.com',
        website_short_description: 'FastAPI framework',
        is_updated_latest: true,
        llms_txt_storage: 'https://fastapi.tiangolo.com/llms.txt',
        llms_full_txt_storage: 'https://fastapi.tiangolo.com/llms-full.txt',
        status: EntryStatus.COMPLETED,
        created_at: '2026-11-01T10:00:00.000Z',
        updated_at: '2026-11-14T14:22:10.000Z',
      };

      const formatted = formatEntryStorageUrls(officialEntry);
      assert.equal(formatted.llm_txt, 'https://fastapi.tiangolo.com/llms.txt');
      assert.equal(formatted.llms_txt_storage, 'https://fastapi.tiangolo.com/llms.txt');
      assert.equal(formatted.llms_full_txt_storage, 'https://fastapi.tiangolo.com/llms-full.txt');
    });
  });
});

