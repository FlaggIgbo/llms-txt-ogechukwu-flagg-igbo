import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateLlmsTxtFiles,
  cleanProjectTitle,
  formatLlmsTxt,
  formatLlmsFullTxt,
  getInitialIntervalForCategory,
  validateLlmsTxt,
  validateLlmsFullTxt,
  assertValidLlmsFiles,
  SiteCategory,
  SectionName,
} from './llmsGenerator.js';
import { computeNextCadence } from './cadenceCalculator.js';
import { checkExistingLlmsTxt } from './scraper.js';
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
        name: SectionName.DOCS,
        links: [
          {
            title: 'Quickstart',
            url: 'https://example.com/docs/quickstart',
            description: 'Get started in under 5 minutes.',
          },
        ],
      },
      {
        name: SectionName.OPTIONAL,
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
      {
        url: 'https://example.com/api/endpoints',
        title: 'API Endpoints',
        description: 'Endpoints reference.',
        markdownContent: '## API Endpoints\n\nAPI details.',
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
  assert.ok(llmsTxt.includes('(Not compiled into llms-full.txt)'));

  assert.ok(llmsFullTxt.startsWith('# Example Project\n\n> An open-source library for automated testing.'));
  assert.ok(llmsFullTxt.includes('## Overview'));
  assert.ok(llmsFullTxt.includes('Run `npm install`'));

  assert.equal(siteCategory, SiteCategory.API_DOCS);
});

test('formatLlmsFullTxt: renders failure placeholders when subpages fail to crawl', () => {
  const page: ScrapedPage = {
    url: 'https://example.com',
    title: 'Test App',
    description: 'A test app description.',
    textContent: 'Main content.',
    markdownContent: '## Main Page\n\nMain content.',
    links: [{ title: 'Auth', href: 'https://example.com/auth' }],
    subPages: [
      {
        url: 'https://example.com/auth',
        title: 'Authentication',
        description: '',
        markdownContent: '*[Content could not be automatically retrieved (HTTP 403 Forbidden)]*',
      },
    ],
  };

  const fullTxt = formatLlmsFullTxt(page.title, page.description, page);
  assert.ok(fullTxt.includes('## Authentication\nURL: https://example.com/auth'));
  assert.ok(fullTxt.includes('*[Content could not be automatically retrieved (HTTP 403 Forbidden)]*'));
});

test('SectionName: exports canonical llms.txt standard section names', () => {
  assert.equal(SectionName.DOCS, 'Docs');
  assert.equal(SectionName.API_REFERENCE, 'API Reference');
  assert.equal(SectionName.OPTIONAL, 'Optional');
});

test('getInitialIntervalForCategory: returns standard seed cadence intervals', () => {
  assert.equal(getInitialIntervalForCategory(SiteCategory.NEWS_MEDIA), 6);
  assert.equal(getInitialIntervalForCategory(SiteCategory.BLOG), 12);
  assert.equal(getInitialIntervalForCategory(SiteCategory.BLOG_ESSAYS), 24);
  assert.equal(getInitialIntervalForCategory(SiteCategory.SAAS_APPLICATION), 48);
  assert.equal(getInitialIntervalForCategory(SiteCategory.MARKETING), 72);
  assert.equal(getInitialIntervalForCategory(SiteCategory.SEARCH_ENGINE), 72);
  assert.equal(getInitialIntervalForCategory(SiteCategory.COMMUNITY_PLATFORM), 72);
  assert.equal(getInitialIntervalForCategory(SiteCategory.API_DOCS), 168);
  assert.equal(getInitialIntervalForCategory(SiteCategory.TECHNICAL_DOCS), 168);
  assert.equal(getInitialIntervalForCategory(SiteCategory.GOVERNMENT_PORTAL), 168);
  assert.equal(getInitialIntervalForCategory(SiteCategory.STANDARDS_SPECIFICATION), 336);
});

test('detectSiteCategory: classifies various site architectures accurately', async () => {
  const sites = [
    { url: 'https://docs.python.org/3/', title: 'Python 3 Documentation', expected: SiteCategory.TECHNICAL_DOCS },
    { url: 'https://developer.mozilla.org/en-US/', title: 'MDN Web Docs', expected: SiteCategory.TECHNICAL_DOCS },
    { url: 'https://www.w3.org/TR/', title: 'W3C Technical Reports and Standards', expected: SiteCategory.STANDARDS_SPECIFICATION },
    { url: 'https://www.docker.com/products/', title: 'Docker: Accelerated Container Application Development', expected: SiteCategory.TECHNICAL_DOCS },
    { url: 'https://www.nytimes.com/', title: 'The New York Times - Breaking News', expected: SiteCategory.NEWS_MEDIA },
    { url: 'https://www.bbc.com/news', title: 'BBC News', expected: SiteCategory.NEWS_MEDIA },
    { url: 'https://www.service.gov.uk/', title: 'GOV.UK Public Services', expected: SiteCategory.GOVERNMENT_PORTAL },
    { url: 'https://paulgraham.com/articles.html', title: 'Paul Graham Essays', expected: SiteCategory.BLOG_ESSAYS },
    { url: 'https://trello.com/home', title: 'Manage Your Team Projects From Anywhere | Trello', expected: SiteCategory.SAAS_APPLICATION },
    { url: 'https://www.ecosia.org/', title: 'Ecosia - The search engine that plants trees', expected: SiteCategory.SEARCH_ENGINE },
  ];

  for (const site of sites) {
    const page: ScrapedPage = {
      url: site.url,
      title: site.title,
      description: `Testing ${site.title}`,
      textContent: `Content for ${site.title}`,
      markdownContent: `# ${site.title}\n\nContent for ${site.title}`,
      links: [{ title: 'Home', href: site.url }],
      subPages: [],
    };
    const { siteCategory } = await generateLlmsTxtFiles(page);
    assert.equal(siteCategory, site.expected, `Expected ${site.url} to be categorized as ${site.expected}`);
  }
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

test('computeNextCadence: initializes category baseline without backoff on initial crawl', () => {
  // api_docs site starts at 168h
  const apiResult = computeNextCadence({
    isInitial: true,
    changed: false,
    currentIntervalHours: 168,
    unchangedStreak: 0,
  });
  assert.equal(apiResult.newIntervalHours, 168);
  assert.equal(apiResult.newStreak, 0);

  // marketing site starts at 72h
  const marketingResult = computeNextCadence({
    isInitial: true,
    changed: false,
    currentIntervalHours: 72,
    unchangedStreak: 0,
  });
  assert.equal(marketingResult.newIntervalHours, 72);
  assert.equal(marketingResult.newStreak, 0);

  // blog site starts at 12h
  const blogResult = computeNextCadence({
    isInitial: true,
    changed: false,
    currentIntervalHours: 12,
    unchangedStreak: 0,
  });
  assert.equal(blogResult.newIntervalHours, 12);
  assert.equal(blogResult.newStreak, 0);
});

test('checkExistingLlmsTxt: discovers official llms.txt on docs.[domain] subdomains', async () => {
  const result = await checkExistingLlmsTxt('https://perplexity.ai');
  assert.ok(result !== null);
  assert.ok(result.llmsTxt.includes('Perplexity'));
  assert.equal(result.llmsTxtUrl, 'https://docs.perplexity.ai/llms.txt');
  assert.ok(result.llmsFullTxt && result.llmsFullTxt.length > 0);
});
