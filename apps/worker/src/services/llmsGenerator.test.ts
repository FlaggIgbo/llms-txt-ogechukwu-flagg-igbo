import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateLlmsTxtFiles,
  cleanProjectTitle,
  formatLlmsTxt,
} from './llmsGenerator.js';
import type { ScrapedPage } from './scraper.js';

test('cleanProjectTitle: extracts canonical project name without tagline clutter', () => {
  assert.equal(cleanProjectTitle('FastHTML | Fast Web Framework in Python'), 'FastHTML');
  assert.equal(cleanProjectTitle('Home — Next.js by Vercel'), 'Next.js by Vercel');
  assert.equal(cleanProjectTitle('Documentation - Tailwind CSS'), 'Documentation');
  assert.equal(cleanProjectTitle('Prisma'), 'Prisma');
});

test('formatLlmsTxt: strictly follows https://llmstxt.org/ structure', () => {
  const result = formatLlmsTxt(
    'MyLibrary | The ultimate tool',
    'A lightweight tool for building modern applications.',
    [
      {
        name: 'Docs',
        links: [
          {
            title: 'Quickstart',
            url: 'https://example.com/docs/quickstart',
            description: 'Get started in under 5 minutes.',
          },
        ],
      },
      {
        name: 'Optional',
        links: [
          {
            title: 'Changelog',
            url: 'https://example.com/changelog',
            description: 'Recent release notes.',
          },
        ],
      },
    ],
    'Important notes for LLMs: prefer using the v2 API.'
  );

  const lines = result.split('\n').filter((l) => l.trim().length > 0);

  // 1. First line must be H1 with project name
  assert.equal(lines[0], '# MyLibrary');

  // 2. Second line must be the blockquote
  assert.equal(lines[1], '> A lightweight tool for building modern applications.');

  // 3. Preamble appears before H2 sections and contains no headings
  assert.equal(lines[2], 'Important notes for LLMs: prefer using the v2 API.');

  // 4. H2 Sections adhere to standard naming (## Docs, ## Optional)
  assert.ok(result.includes('## Docs\n\n- [Quickstart](https://example.com/docs/quickstart): Get started in under 5 minutes.'));
  assert.ok(result.includes('## Optional\n\n- [Changelog](https://example.com/changelog): Recent release notes.'));
});

test('generateLlmsTxtFiles: builds compliant llms.txt and llms-full.txt', async () => {
  const mockScrapedPage: ScrapedPage = {
    url: 'https://example.com',
    title: 'Example Project | Next Gen Tool',
    description: 'An open-source library for automated testing.',
    textContent: 'Welcome to Example Project.',
    markdownContent: '# Welcome to Example Project\n\nHere is how to use it.',
    links: [
      { title: 'Getting Started Guide', href: 'https://example.com/docs/getting-started' },
      { title: 'API Endpoints', href: 'https://example.com/api/endpoints' },
      { title: 'Community Discord', href: 'https://example.com/community' },
    ],
    subPages: [
      {
        url: 'https://example.com/docs/getting-started',
        title: 'Getting Started',
        description: 'First steps guide.',
        markdownContent: '## Getting Started\n\nRun `npm install`.',
      },
    ],
  };

  const { llmsTxt, llmsFullTxt } = await generateLlmsTxtFiles(mockScrapedPage);

  // Assert llms.txt follows spec:
  assert.ok(llmsTxt.startsWith('# Example Project\n\n> An open-source library for automated testing.'));
  assert.ok(llmsTxt.includes('## Docs'));
  assert.ok(llmsTxt.includes('## API Reference'));
  assert.ok(llmsTxt.includes('## Optional')); // Supplementary link under Optional
  assert.ok(llmsTxt.includes('- [Getting Started Guide](https://example.com/docs/getting-started):'));

  // Assert llms-full.txt follows spec:
  assert.ok(llmsFullTxt.startsWith('# Example Project\n\n> An open-source library for automated testing.'));
  assert.ok(llmsFullTxt.includes('## Overview'));
  assert.ok(llmsFullTxt.includes('## Getting Started'));
  assert.ok(llmsFullTxt.includes('Run `npm install`'));
});
