import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateLlmsTxt,
  validateLlmsFullTxt,
  assertValidLlmsFiles,
  LlmsValidationError,
} from './llmsValidator.js';
import { uploadToStorage, resolveStorageConfig } from './storageUpload.js';

const SAMPLE_VALID_LLMS_TXT = `# FastHTML

> FastHTML is a python library for building fast, modern web applications.

Important developer guidelines and conventions.

## Docs

- [Getting Started](https://fastht.ml/docs/quickstart): Quickstart guide in 5 minutes.
- [Tutorial](https://fastht.ml/docs/tutorial): Step by step instructions.

## API Reference

- [Core API](https://fastht.ml/api/core): Python API reference for Core.

## Optional

- [Community](https://fastht.ml/discord): Discord community server.
`;

const SAMPLE_VALID_FULL_TXT = `# FastHTML

> FastHTML is a python library for building fast, modern web applications.

## Overview
URL: https://fastht.ml/docs

FastHTML lets you write modern web applications with clean, simple Python code.

---

## Getting Started
URL: https://fastht.ml/docs/quickstart

Run \`pip install python-fasthtml\` to get started.
`;

test('validateLlmsTxt: accepts standard compliant llms.txt', () => {
  const result = validateLlmsTxt(SAMPLE_VALID_LLMS_TXT);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.stats.title, 'FastHTML');
  assert.equal(result.stats.sectionCount, 3);
  assert.equal(result.stats.linkCount, 4);
  assert.ok(result.stats.byteSize > 0);
});

test('validateLlmsTxt: catches empty or corrupted content', () => {
  const emptyResult = validateLlmsTxt('   ');
  assert.equal(emptyResult.valid, false);
  assert.ok(emptyResult.errors.some((e) => e.includes('empty')));

  const corruptResult = validateLlmsTxt('# Title\n\0> Summary\n## Docs\n- [Link](https://a.com)');
  assert.equal(corruptResult.valid, false);
  assert.ok(corruptResult.errors.some((e) => e.includes('null byte')));
});

test('validateLlmsTxt: enforces H1 header as first content', () => {
  const missingH1 = `> A summary without H1 title\n\n## Docs\n- [Link](https://example.com)`;
  const result = validateLlmsTxt(missingH1);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('H1 title')));

  const emptyH1 = `#    \n> Summary\n## Docs\n- [Link](https://example.com)`;
  const emptyResult = validateLlmsTxt(emptyH1);
  assert.equal(emptyResult.valid, false);
  assert.ok(emptyResult.errors.some((e) => e.includes('cannot be empty')));
});

test('validateLlmsTxt: enforces blockquote summary presence', () => {
  const missingQuote = `# FastHTML\n\n## Docs\n- [Link](https://example.com)`;
  const result = validateLlmsTxt(missingQuote);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('blockquote summary')));
});

test('validateLlmsTxt: enforces sections and valid link syntax', () => {
  const noSections = `# FastHTML\n\n> Summary\n\nSome text without sections`;
  const resultNoSections = validateLlmsTxt(noSections);
  assert.equal(resultNoSections.valid, false);
  assert.ok(resultNoSections.errors.some((e) => e.includes('No H2 sections')));

  const malformedLinks = `# FastHTML\n\n> Summary\n\n## Docs\n- Broken link [missing url]\n- [Bad Protocol](javascript:alert(1))`;
  const resultMalformed = validateLlmsTxt(malformedLinks);
  assert.equal(resultMalformed.valid, false);
  assert.ok(resultMalformed.errors.some((e) => e.includes('Malformed markdown link')));
  assert.ok(resultMalformed.errors.some((e) => e.includes('Invalid URL protocol')));
});

test('validateLlmsFullTxt: validates full documentation content', () => {
  const validResult = validateLlmsFullTxt(SAMPLE_VALID_FULL_TXT);
  assert.equal(validResult.valid, true);
  assert.equal(validResult.stats.title, 'FastHTML');
  assert.equal(validResult.stats.sectionCount, 2);

  const emptyResult = validateLlmsFullTxt('');
  assert.equal(emptyResult.valid, false);

  const missingTitle = validateLlmsFullTxt('Some docs without title');
  assert.equal(missingTitle.valid, false);
  assert.ok(missingTitle.errors.some((e) => e.includes('H1 title')));
});

test('assertValidLlmsFiles: succeeds for valid files and throws LlmsValidationError for invalid files', () => {
  assert.doesNotThrow(() => {
    assertValidLlmsFiles(SAMPLE_VALID_LLMS_TXT, SAMPLE_VALID_FULL_TXT);
  });

  assert.throws(
    () => {
      assertValidLlmsFiles('# Bad File\n', SAMPLE_VALID_FULL_TXT);
    },
    (err: unknown) => {
      assert.ok(err instanceof LlmsValidationError);
      assert.ok((err as LlmsValidationError).errors.length > 0);
      return true;
    }
  );
});

test('uploadToStorage: validates and prevents writing invalid files to storage', async () => {
  await assert.rejects(
    async () => {
      await uploadToStorage('https://invalid.example.com', 'corrupt content', 'corrupt content');
    },
    (err: unknown) => {
      assert.ok(err instanceof LlmsValidationError);
      return true;
    }
  );
});

test('resolveStorageConfig: accepts minio and configures S3/MinIO defaults', () => {
  const config = resolveStorageConfig({ STORAGE_PROVIDER: 'minio' });
  assert.equal(config.kind, 'r2');
  assert.equal(config.endpoint, 'http://localhost:9000');
  assert.equal(config.bucket, 'llmstxt-files-bucket');
  assert.equal(config.accessKeyId, 'minioadmin');
  assert.equal(config.secretAccessKey, 'minioadmin');
});

test('resolveStorageConfig: rejects local storage provider', () => {
  assert.throws(
    () => {
      resolveStorageConfig({ STORAGE_PROVIDER: 'local' });
    },
    /Unsupported STORAGE_PROVIDER "local" \(expected "minio" or "r2"\)/
  );
});

