import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateLlmsTxtFiles,
  cleanProjectTitle,
  formatLlmsTxt,
  getInitialIntervalForCategory,
  validateLlmsTxt,
  validateLlmsFullTxt,
  assertValidLlmsFiles,
} from './llmsGenerator.js';
import { computeNextCadence } from './cadenceCalculator.js';
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

test('generateLlmsTxtFiles: builds compliant files and infers siteCategory', async () => {
  const mockScrapedPage: ScrapedPage = {
    url: 'https://example.com/docs',
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

  const { llmsTxt, llmsFullTxt, siteCategory } = await generateLlmsTxtFiles(mockScrapedPage);

  // Assert generated files pass strict validation.
  assertValidLlmsFiles(llmsTxt, llmsFullTxt);
  const txtValidation = validateLlmsTxt(llmsTxt);
  assert.equal(txtValidation.valid, true);
  assert.equal(txtValidation.errors.length, 0);

  const fullTxtValidation = validateLlmsFullTxt(llmsFullTxt);
  assert.equal(fullTxtValidation.valid, true);
  assert.equal(fullTxtValidation.errors.length, 0);

  assert.ok(llmsTxt.startsWith('# Example Project\n\n> An open-source library for automated testing.'));
  assert.ok(llmsTxt.includes('## Docs'));
  assert.ok(llmsTxt.includes('## API Reference'));
  assert.ok(llmsTxt.includes('## Optional'));
  assert.ok(llmsTxt.includes('- [Getting Started Guide](https://example.com/docs/getting-started):'));

  assert.ok(llmsFullTxt.startsWith('# Example Project\n\n> An open-source library for automated testing.'));
  assert.ok(llmsFullTxt.includes('## Overview'));
  assert.ok(llmsFullTxt.includes('Run `npm install`'));

  assert.equal(siteCategory, 'api_docs');
});

test('getInitialIntervalForCategory: returns standard seed cadence intervals', () => {
  assert.equal(getInitialIntervalForCategory('blog'), 12);
  assert.equal(getInitialIntervalForCategory('marketing'), 72);
  assert.equal(getInitialIntervalForCategory('api_docs'), 168);
});

test('computeNextCadence: handles adaptive backoff correctly', () => {
  // When changed: halve interval, reset streak to 0
  const changedResult = computeNextCadence({
    changed: true,
    currentIntervalHours: 24,
    unchangedStreak: 4,
  });
  assert.equal(changedResult.newIntervalHours, 12);
  assert.equal(changedResult.newStreak, 0);

  // When changed below floor: enforce 6 hours
  const floorResult = computeNextCadence({
    changed: true,
    currentIntervalHours: 8,
    unchangedStreak: 1,
  });
  assert.equal(floorResult.newIntervalHours, 6);
  assert.equal(floorResult.newStreak, 0);

  // When unchanged: multiply by 1.5, increment streak
  const unchangedResult = computeNextCadence({
    changed: false,
    currentIntervalHours: 24,
    unchangedStreak: 2,
  });
  assert.equal(unchangedResult.newIntervalHours, 36);
  assert.equal(unchangedResult.newStreak, 3);

  // When unchanged above ceiling: enforce 720 hours (30 days)
  const ceilingResult = computeNextCadence({
    changed: false,
    currentIntervalHours: 600,
    unchangedStreak: 10,
  });
  assert.equal(ceilingResult.newIntervalHours, 720);
  assert.equal(ceilingResult.newStreak, 11);
});
