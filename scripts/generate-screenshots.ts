import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { EntryStatus } from '../packages/shared-types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const WEB_DIR = path.resolve(ROOT_DIR, 'apps/web');
const SCREENSHOTS_DIR = path.resolve(ROOT_DIR, 'screenshots');
const COMPONENTS_DIR = path.resolve(SCREENSHOTS_DIR, 'components');
const PAGES_DIR = path.resolve(SCREENSHOTS_DIR, 'pages');

const MOCK_ENTRIES = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    website_name: 'FastAPI',
    website_url: 'https://fastapi.tiangolo.com',
    website_short_description: 'FastAPI framework, high performance, easy to learn, fast to code, ready for production',
    is_updated_latest: true,
    llms_txt_storage: 'https://fastapi.tiangolo.com/llms.txt',
    llms_full_txt_storage: 'https://fastapi.tiangolo.com/llms-full.txt',
    status: EntryStatus.COMPLETED,
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-14T14:22:10.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    website_name: 'Anthropic Docs',
    website_url: 'https://docs.anthropic.com',
    website_short_description: 'Anthropic API, Claude models documentation, guides, and SDK reference.',
    is_updated_latest: true,
    llms_txt_storage: 'https://docs.anthropic.com/llms.txt',
    llms_full_txt_storage: 'https://docs.anthropic.com/llms-full.txt',
    status: EntryStatus.COMPLETED,
    created_at: '2026-11-02T12:00:00.000Z',
    updated_at: '2026-11-15T09:15:30.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    website_name: 'llmstxt.org',
    website_url: 'https://llmstxt.org',
    website_short_description: 'The official standard specification for /llms.txt and /llms-full.txt website discovery.',
    is_updated_latest: true,
    llms_txt_storage: 'https://llmstxt.org/llms.txt',
    llms_full_txt_storage: null,
    status: EntryStatus.COMPLETED,
    created_at: '2026-10-15T08:30:00.000Z',
    updated_at: '2026-11-12T18:45:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    website_name: 'Hugging Face',
    website_url: 'https://huggingface.co',
    website_short_description: 'The platform where the machine learning community collaborates on models, datasets, and applications.',
    is_updated_latest: true,
    llms_txt_storage: 'https://huggingface.co/llms.txt',
    llms_full_txt_storage: 'https://huggingface.co/llms-full.txt',
    status: EntryStatus.COMPLETED,
    created_at: '2026-11-05T16:20:00.000Z',
    updated_at: '2026-11-15T19:00:00.000Z',
  },
];

const MOCK_UPDATING_ENTRIES = [
  {
    id: 'upd-1',
    website_name: 'Supabase Documentation',
    website_url: 'https://supabase.com/docs',
    website_short_description: 'The open source Firebase alternative documentation.',
    is_updated_latest: false,
    llms_txt_storage: 'https://supabase.com/docs/llms.txt',
    llms_full_txt_storage: null,
    status: EntryStatus.PROCESSING,
    created_at: '2026-11-16T18:00:00.000Z',
    updated_at: '2026-11-16T18:05:00.000Z',
  },
  {
    id: 'upd-2',
    website_name: 'Stripe API',
    website_url: 'https://stripe.com/docs',
    website_short_description: 'Online payment processing for internet businesses.',
    is_updated_latest: false,
    llms_txt_storage: null,
    llms_full_txt_storage: null,
    status: EntryStatus.PENDING,
    created_at: '2026-11-16T18:10:00.000Z',
    updated_at: '2026-11-16T18:10:00.000Z',
  },
  {
    id: 'upd-3',
    website_name: 'Invalid Example Site',
    website_url: 'https://broken-example-site.invalid',
    website_short_description: null,
    is_updated_latest: false,
    llms_txt_storage: null,
    llms_full_txt_storage: null,
    status: EntryStatus.FAILED,
    error_message: 'Failed to fetch /llms.txt: 404 Not Found',
    created_at: '2026-11-16T17:50:00.000Z',
    updated_at: '2026-11-16T17:52:00.000Z',
  },
  {
    id: 'upd-4',
    website_name: 'FastAPI Clone',
    website_url: 'https://fastapi.tiangolo.com',
    website_short_description: null,
    is_updated_latest: false,
    llms_txt_storage: null,
    llms_full_txt_storage: null,
    status: EntryStatus.FAILED,
    error_message: 'Website URL already exists in site_entries table',
    created_at: '2026-11-16T17:40:00.000Z',
    updated_at: '2026-11-16T17:42:00.000Z',
  },
];

// Injects styles to freeze animations and hide blinking carets for deterministic screenshots
async function applyDeterministicStyles(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
    `,
  });
}

async function setupApiMockRoutes(page: Page, updatingEntries = MOCK_UPDATING_ENTRIES): Promise<void> {
  // Handle any API calls to /entries
  await page.route('**/entries*', (route) => {
    const url = route.request().url();
    if (url.includes('status=')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(updatingEntries),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_ENTRIES),
    });
  });
}

export async function generateScreenshots(): Promise<string[]> {
  console.log('🚀 Starting screenshot generation...');

  // Ensure directories exist
  mkdirSync(COMPONENTS_DIR, { recursive: true });
  mkdirSync(PAGES_DIR, { recursive: true });

  // 1. Start ephemeral Vite dev server on an available port
  const server: ViteDevServer = await createServer({
    root: WEB_DIR,
    server: {
      port: 0, // Let OS pick an available ephemeral port to avoid collisions
    },
    logLevel: 'warn',
  });
  await server.listen();
  const address = server.httpServer?.address();
  const serverPort = typeof address === 'object' && address ? address.port : 5198;
  const baseUrl = `http://localhost:${serverPort}`;
  console.log(`📡 Local preview server running at ${baseUrl}`);

  const savedFiles: string[] = [];

  // 2. Launch Chromium
  const browser: Browser = await chromium.launch();

  try {
    // ----------------------------------------------------
    // Section A: Component Screenshots via harness.html
    // ----------------------------------------------------
    console.log('📸 Capturing frontend components...');
    const componentPage = await browser.newPage({
      viewport: { width: 1280, height: 1600 },
      deviceScaleFactor: 2, // HiDPI for crisp GitHub image diffs
      timezoneId: 'America/New_York',
      locale: 'en-US',
    });

    await componentPage.goto(`${baseUrl}/harness.html`, { waitUntil: 'networkidle' });
    await applyDeterministicStyles(componentPage);

    const componentTargets = [
      { id: '#harness-nav-tabs', filename: 'navigation-tabs.png' },
      { id: '#harness-search-bar-empty', filename: 'search-bar-empty.png' },
      { id: '#harness-search-bar-filled', filename: 'search-bar-filled.png' },
      { id: '#harness-directory-card-standard', filename: 'directory-card-standard.png' },
      { id: '#harness-directory-card-minimal', filename: 'directory-card-minimal.png' },
      { id: '#harness-directory-table-populated', filename: 'directory-table-populated.png' },
      { id: '#harness-directory-table-loading', filename: 'directory-table-loading.png' },
      { id: '#harness-directory-table-empty', filename: 'directory-table-empty.png' },
      { id: '#harness-submission-form-empty', filename: 'submission-form-empty.png' },
      { id: '#harness-submission-form-validation', filename: 'submission-form-validation.png' },
      { id: '#harness-submission-form-filled', filename: 'submission-form-filled.png' },
    ];

    for (const target of componentTargets) {
      const locator = componentPage.locator(target.id);
      await locator.waitFor({ state: 'visible' });
      const outPath = path.join(COMPONENTS_DIR, target.filename);
      await locator.screenshot({ path: outPath });
      savedFiles.push(`screenshots/components/${target.filename}`);
      console.log(`  ✓ ${target.filename}`);
    }

    await componentPage.close();

    // ----------------------------------------------------
    // Section B: Desktop Page Screenshots (1280x800)
    // ----------------------------------------------------
    console.log('📸 Capturing desktop pages (1280x800)...');
    const desktopPage = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
      timezoneId: 'America/New_York',
      locale: 'en-US',
    });
    await setupApiMockRoutes(desktopPage, MOCK_UPDATING_ENTRIES);

    // 1. Home Page
    await desktopPage.goto(`${baseUrl}/#home`, { waitUntil: 'networkidle' });
    await applyDeterministicStyles(desktopPage);
    await desktopPage.waitForSelector('.directory-table');
    const homePath = path.join(PAGES_DIR, 'home-page.png');
    await desktopPage.screenshot({ path: homePath, fullPage: true });
    savedFiles.push('screenshots/pages/home-page.png');
    console.log('  ✓ home-page.png');

    // 2. Home Page Filtered (search query "fastapi")
    const searchInput = desktopPage.locator('.search-input');
    await searchInput.fill('fastapi');
    await applyDeterministicStyles(desktopPage);
    const homeFilteredPath = path.join(PAGES_DIR, 'home-page-filtered.png');
    await desktopPage.screenshot({ path: homeFilteredPath, fullPage: true });
    savedFiles.push('screenshots/pages/home-page-filtered.png');
    console.log('  ✓ home-page-filtered.png');

    // 3. Home Page Empty (search query "nonexistent")
    await searchInput.fill('xyz-no-matches-found');
    await applyDeterministicStyles(desktopPage);
    const homeEmptyPath = path.join(PAGES_DIR, 'home-page-empty.png');
    await desktopPage.screenshot({ path: homeEmptyPath, fullPage: true });
    savedFiles.push('screenshots/pages/home-page-empty.png');
    console.log('  ✓ home-page-empty.png');

    // 4. Add Entry Page
    await desktopPage.goto(`${baseUrl}/#add`, { waitUntil: 'networkidle' });
    await applyDeterministicStyles(desktopPage);
    await desktopPage.waitForSelector('.submission-form');
    const addEntryPath = path.join(PAGES_DIR, 'add-entry-page.png');
    await desktopPage.screenshot({ path: addEntryPath, fullPage: true });
    savedFiles.push('screenshots/pages/add-entry-page.png');
    console.log('  ✓ add-entry-page.png');

    // 5. Updates Page (with active updates)
    await desktopPage.goto(`${baseUrl}/#updates`, { waitUntil: 'networkidle' });
    await applyDeterministicStyles(desktopPage);
    await desktopPage.waitForSelector('.updates-table');
    const updatesPath = path.join(PAGES_DIR, 'updates-page.png');
    await desktopPage.screenshot({ path: updatesPath, fullPage: true });
    savedFiles.push('screenshots/pages/updates-page.png');
    console.log('  ✓ updates-page.png');

    // 6. Updates Page (empty state)
    const emptyUpdatesPage = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
      timezoneId: 'America/New_York',
      locale: 'en-US',
    });
    await setupApiMockRoutes(emptyUpdatesPage, []);
    await emptyUpdatesPage.goto(`${baseUrl}/#updates`, { waitUntil: 'networkidle' });
    await applyDeterministicStyles(emptyUpdatesPage);
    await emptyUpdatesPage.waitForSelector('.updates-empty-card');
    const updatesEmptyPath = path.join(PAGES_DIR, 'updates-page-empty.png');
    await emptyUpdatesPage.screenshot({ path: updatesEmptyPath, fullPage: true });
    savedFiles.push('screenshots/pages/updates-page-empty.png');
    console.log('  ✓ updates-page-empty.png');
    await emptyUpdatesPage.close();

    await desktopPage.close();

    // ----------------------------------------------------
    // Section C: Mobile Page Screenshots (390x844)
    // ----------------------------------------------------
    console.log('📸 Capturing mobile pages (390x844)...');
    const mobilePage = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      timezoneId: 'America/New_York',
      locale: 'en-US',
    });
    await setupApiMockRoutes(mobilePage, MOCK_UPDATING_ENTRIES);

    // Mobile Home
    await mobilePage.goto(`${baseUrl}/#home`, { waitUntil: 'networkidle' });
    await applyDeterministicStyles(mobilePage);
    await mobilePage.waitForSelector('.directory-table');
    const mobileHomePath = path.join(PAGES_DIR, 'home-page-mobile.png');
    await mobilePage.screenshot({ path: mobileHomePath, fullPage: true });
    savedFiles.push('screenshots/pages/home-page-mobile.png');
    console.log('  ✓ home-page-mobile.png');

    // Mobile Add Entry
    await mobilePage.goto(`${baseUrl}/#add`, { waitUntil: 'networkidle' });
    await applyDeterministicStyles(mobilePage);
    await mobilePage.waitForSelector('.submission-form');
    const mobileAddPath = path.join(PAGES_DIR, 'add-entry-page-mobile.png');
    await mobilePage.screenshot({ path: mobileAddPath, fullPage: true });
    savedFiles.push('screenshots/pages/add-entry-page-mobile.png');
    console.log('  ✓ add-entry-page-mobile.png');

    // Mobile Updates
    await mobilePage.goto(`${baseUrl}/#updates`, { waitUntil: 'networkidle' });
    await applyDeterministicStyles(mobilePage);
    await mobilePage.waitForSelector('.updates-table');
    const mobileUpdatesPath = path.join(PAGES_DIR, 'updates-page-mobile.png');
    await mobilePage.screenshot({ path: mobileUpdatesPath, fullPage: true });
    savedFiles.push('screenshots/pages/updates-page-mobile.png');
    console.log('  ✓ updates-page-mobile.png');

    await mobilePage.close();
  } finally {
    await browser.close();
    await server.close();
  }

  console.log(`\n🎉 Successfully captured ${savedFiles.length} screenshots!`);
  return savedFiles;
}

// Direct execution
if (process.argv[1] && process.argv[1].endsWith('generate-screenshots.ts')) {
  generateScreenshots()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Failed to generate screenshots:', err);
      process.exit(1);
    });
}

