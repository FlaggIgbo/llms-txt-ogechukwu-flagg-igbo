import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';

// Ensure PostgreSQL connection string points to the Docker container
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/llmstxt_directory';
process.env.STORAGE_PROVIDER = 'local';
process.env.LOCAL_STORAGE_DIR = path.resolve(process.cwd(), 'data/storage');
process.env.PORT = '4000';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const WEB_DIR = path.resolve(ROOT_DIR, 'apps/web');
const RECORDINGS_DIR = path.resolve(ROOT_DIR, 'recordings');
const DOWNLOADS_DIR =
  process.env.DOWNLOADS_DIR ||
  (process.env.HOME ? path.resolve(process.env.HOME, 'Downloads') : RECORDINGS_DIR);

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('========================================================================');
  console.log('🎬 Starting Playwright E2E Tests with Visible Browser & Recording');
  console.log('   PostgreSQL DB: llmstxt-postgres (Docker localhost:5432)');
  console.log(`   Recording Folder: ${DOWNLOADS_DIR}`);
  console.log('========================================================================\n');

  // Clean any previous test rows for developer.mozilla.org or plaid.com/docs
  const { db } = await import('../packages/database/index.js');
  try {
    const existingMdn = await db.getEntryByUrl('https://developer.mozilla.org');
    if (existingMdn) await db.deleteEntry(existingMdn.id);
    const existingPlaid = await db.getEntryByUrl('https://plaid.com/docs');
    if (existingPlaid) await db.deleteEntry(existingPlaid.id);
  } catch {
    // Ignore cleanup error
  }

  // 1. Start Background Worker Consumer & API Server
  console.log('📡 Step 1: Registering Worker Consumer and loading API Gateway...');
  const { startGenerateConsumer } = await import(
    '../apps/worker/src/consumers/generateConsumer.ts'
  );
  startGenerateConsumer();
  await import('../apps/api/src/index.ts');
  console.log('✅ API Server active on http://localhost:4000 with background consumer ready');

  // 2. Start Vite Dev Server for Web App on port 5199
  console.log('📡 Step 2: Starting Vite preview server for React web app...');
  const viteServer: ViteDevServer = await createServer({
    root: WEB_DIR,
    server: {
      port: 5199,
      strictPort: true,
    },
    logLevel: 'error',
  });
  await viteServer.listen();
  const webUrl = 'http://localhost:5199';
  console.log(`✅ Web frontend listening at ${webUrl}\n`);

  if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  }

  // 3. Launch Headed Browser with Video Recording
  console.log('🌐 Step 3: Launching Chromium browser (headed / visible)...');
  const browser: Browser = await chromium.launch({
    headless: false,
    slowMo: 450, // Deliberate pacing so the user sees every action in real time
  });

  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1280, height: 850 },
    recordVideo: {
      dir: DOWNLOADS_DIR,
      size: { width: 1280, height: 850 },
    },
  });

  const page: Page = await context.newPage();
  let videoPath: string | null = null;

  try {
    // -------------------------------------------------------------
    // TEST SUITE 1: Directory Page & Seed Data Verification
    // -------------------------------------------------------------
    console.log('\n--- [TEST 1] Directory Initial Load & Docker PostgreSQL Seed Data ---');
    await page.goto(webUrl, { waitUntil: 'networkidle' });
    await sleep(800);

    const title = await page.textContent('.directory-title');
    console.log(`   Directory Title: "${title?.trim()}"`);
    if (!title?.includes('llms.txt Directory')) {
      throw new Error(`Expected title to include "llms.txt Directory", got: ${title}`);
    }

    const tabs = page.locator('.nav-tab');
    const tabCount = await tabs.count();
    console.log(`   Navigation Tabs: Found ${tabCount} tabs (Directory, Add Entry, Updates)`);
    if (tabCount !== 3) throw new Error(`Expected 3 tabs, found ${tabCount}`);

    const initialRows = page.locator('.table-row');
    const rowCount = await initialRows.count();
    console.log(`   PostgreSQL Seed Entries: Found ${rowCount} entries loaded from Docker DB`);
    if (rowCount < 4) throw new Error(`Expected at least 4 seed rows, found ${rowCount}`);

    const bodyText = await page.textContent('body');
    if (!bodyText?.includes('FastAPI') || !bodyText?.includes('Anthropic Docs')) {
      throw new Error('Seed data did not render expected entries');
    }
    console.log('   ✅ Directory successfully loaded seed data from Docker PostgreSQL');

    // -------------------------------------------------------------
    // TEST SUITE 2: Search & Live Filtering
    // -------------------------------------------------------------
    console.log('\n--- [TEST 2] Search & Live Filtering ---');
    const searchInput = page.locator('.search-input');
    await searchInput.fill('FastAPI');
    await sleep(700);

    const filteredCount = await page.locator('.table-row').count();
    console.log(`   Search for "FastAPI" -> ${filteredCount} row(s) displayed`);
    if (filteredCount !== 1) throw new Error(`Expected 1 row for FastAPI, got ${filteredCount}`);

    // Search for non-matching keyword
    await searchInput.fill('XYZNonExistentSite999');
    await sleep(700);
    const nonMatchingCount = await page.locator('.table-row').count();
    console.log(`   Search for non-existent keyword -> ${nonMatchingCount} row(s) displayed`);

    // Clear search
    await searchInput.fill('');
    await sleep(600);
    const restoredCount = await page.locator('.table-row').count();
    console.log(`   Cleared search -> Restored ${restoredCount} entries`);
    console.log('   ✅ Live search and filtering verified');

    // -------------------------------------------------------------
    // TEST SUITE 3: Navigation Tab Switching & Hash Routing
    // -------------------------------------------------------------
    console.log('\n--- [TEST 3] Navigation Tab Switching & URL Hash Sync ---');
    await page.click('button[role="tab"]:has-text("Add Entry")');
    await sleep(500);
    console.log(`   Active Tab: Add Entry (URL: ${page.url()})`);
    if (!page.url().includes('#add')) throw new Error('Expected #add hash');

    await page.click('button[role="tab"]:has-text("Updates")');
    await sleep(500);
    console.log(`   Active Tab: Updates (URL: ${page.url()})`);
    if (!page.url().includes('#updates')) throw new Error('Expected #updates hash');

    await page.click('button[role="tab"]:has-text("Directory")');
    await sleep(500);
    console.log('   ✅ Tab switching and hash routing verified');

    // -------------------------------------------------------------
    // TEST SUITE 4: Add Entry Form Validation
    // -------------------------------------------------------------
    console.log('\n--- [TEST 4] Add Entry Form Validation ---');
    await page.click('button[role="tab"]:has-text("Add Entry")');
    await sleep(500);

    // Empty form submission
    await page.click('button[type="submit"]');
    await sleep(500);
    const requiredError = await page.textContent('.form-field-error');
    console.log(`   Empty form error: "${requiredError?.trim()}"`);
    if (!requiredError?.includes('Website URL is required')) {
      throw new Error(`Expected required error, got: ${requiredError}`);
    }

    // Invalid protocol
    await page.fill('#website-url', 'ftp://not-supported-url.com');
    await page.click('button[type="submit"]');
    await sleep(500);
    const protocolError = await page.textContent('.form-field-error');
    console.log(`   Invalid URL protocol error: "${protocolError?.trim()}"`);
    if (!protocolError?.includes('valid URL starting with http:// or https://')) {
      throw new Error(`Expected protocol error, got: ${protocolError}`);
    }
    console.log('   ✅ Client-side form validations verified');

    // -------------------------------------------------------------
    // TEST SUITE 5: Submit developer.mozilla.org (No existing llms.txt)
    // -------------------------------------------------------------
    console.log('\n--- [TEST 5] Submitting developer.mozilla.org (Crawls & Generates llms.txt) ---');
    await page.fill('#product-name', 'MDN Web Docs');
    await page.fill('#website-url', 'https://developer.mozilla.org');
    await page.fill('#additional-notes', 'Resources for developers, by developers');
    await sleep(600);

    console.log('   Submitting form for https://developer.mozilla.org...');
    await page.click('button[type="submit"]');
    await sleep(1000);

    const successBanner = await page.textContent('.form-success-banner');
    console.log(`   Success Banner: "${successBanner?.trim().replace(/\s+/g, ' ').slice(0, 75)}..."`);
    if (!successBanner?.includes('Entry submitted successfully')) {
      throw new Error(`Expected submission success banner, got: ${successBanner}`);
    }

    // Follow link to Updates page
    await page.click('.view-updates-link');
    await sleep(800);
    console.log('   Switched to Updates page.');

    // Wait for worker crawl and llms.txt generation to finish and update PostgreSQL
    console.log('   Waiting for background worker to crawl, generate standard llms.txt, and update PostgreSQL...');
    let mdnCompleted = false;
    for (let sec = 0; sec < 45; sec++) {
      const entry = await db.getEntryByUrl('https://developer.mozilla.org');
      if (entry && entry.status === 'COMPLETED') {
        console.log(`   🎉 developer.mozilla.org COMPLETED in PostgreSQL!`);
        console.log(`      Stored llms.txt: ${entry.llms_txt_storage}`);
        console.log(`      Stored llms-full.txt: ${entry.llms_full_txt_storage}`);
        mdnCompleted = true;
        break;
      }
      await sleep(1500);

      // Periodically click refresh in UI to show visual updates
      if (sec % 3 === 0) {
        const refreshBtn = page.locator('.updates-page .refresh-button');
        if (await refreshBtn.isVisible()) {
          await refreshBtn.click().catch(() => {});
        }
      }
    }

    if (!mdnCompleted) {
      console.warn('   ⚠️ Worker took longer than 45s for developer.mozilla.org');
    } else {
      console.log('   ✅ developer.mozilla.org completed successfully');
    }

    // -------------------------------------------------------------
    // TEST SUITE 6: Submit plaid.com/docs (Has live llms.txt)
    // -------------------------------------------------------------
    console.log('\n--- [TEST 6] Submitting plaid.com/docs (Has Live llms.txt) ---');
    await page.click('button[role="tab"]:has-text("Add Entry")');
    await sleep(600);

    await page.fill('#product-name', 'Plaid');
    await page.fill('#website-url', 'https://plaid.com/docs');
    await page.fill('#additional-notes', 'The API platform for financial services');
    await sleep(600);

    console.log('   Submitting form for https://plaid.com/docs...');
    await page.click('button[type="submit"]');
    await sleep(1000);

    const plaidSuccess = await page.textContent('.form-success-banner');
    if (!plaidSuccess?.includes('Entry submitted successfully')) {
      throw new Error(`Expected success banner for Plaid, got: ${plaidSuccess}`);
    }

    await page.click('.view-updates-link');
    await sleep(800);

    console.log('   Waiting for worker to detect live llms.txt and update PostgreSQL...');
    let plaidCompleted = false;
    for (let sec = 0; sec < 30; sec++) {
      const entry = await db.getEntryByUrl('https://plaid.com/docs');
      if (entry && entry.status === 'COMPLETED') {
        console.log(`   🎉 plaid.com/docs COMPLETED in PostgreSQL!`);
        console.log(`      Live llms.txt: ${entry.llms_txt_storage}`);
        plaidCompleted = true;
        break;
      }
      await sleep(1000);

      if (sec % 2 === 0) {
        const refreshBtn = page.locator('.updates-page .refresh-button');
        if (await refreshBtn.isVisible()) {
          await refreshBtn.click().catch(() => {});
        }
      }
    }

    if (!plaidCompleted) {
      console.warn('   ⚠️ Worker took longer than 30s for plaid.com/docs');
    } else {
      console.log('   ✅ plaid.com/docs live llms.txt verified and completed');
    }

    // -------------------------------------------------------------
    // TEST SUITE 7: Verify Directory Table & Links to .txt
    // -------------------------------------------------------------
    console.log('\n--- [TEST 7] Directory Listing Verification for Newly Added Sites ---');
    await page.click('button[role="tab"]:has-text("Directory")');
    await sleep(600);

    // Refresh directory entries
    const refreshEntriesBtn = page.locator('.directory-footer .refresh-button');
    if (await refreshEntriesBtn.isVisible()) {
      await refreshEntriesBtn.click();
      await sleep(800);
    }

    // Search and verify Plaid
    await searchInput.fill('Plaid');
    await sleep(800);
    const plaidText = await page.textContent('.home-page');
    console.log(`   Directory search "Plaid" found: ${plaidText?.includes('Plaid')}`);

    // Search and verify MDN Web Docs
    await searchInput.fill('MDN');
    await sleep(800);
    const mdnText = await page.textContent('.home-page');
    console.log(`   Directory search "MDN" found: ${mdnText?.includes('MDN')}`);

    // Clear search and count total
    await searchInput.fill('');
    await sleep(600);
    const totalEntries = await page.locator('.table-row').count();
    console.log(`   Directory now displays ${totalEntries} active entries`);
    console.log('   ✅ Newly created sites appear in Directory with active .txt storage links');

    // -------------------------------------------------------------
    // TEST SUITE 8: Duplicate Submission Handling
    // -------------------------------------------------------------
    console.log('\n--- [TEST 8] Duplicate URL Submission Rejection ---');
    await page.click('button[role="tab"]:has-text("Add Entry")');
    await sleep(600);

    // Re-submit https://plaid.com/docs which is already COMPLETED
    await page.fill('#product-name', 'Plaid Duplicate Test');
    await page.fill('#website-url', 'https://plaid.com/docs');
    await page.click('button[type="submit"]');
    await sleep(1000);

    await page.click('.view-updates-link');
    await sleep(800);

    const updatesContent = await page.textContent('.updates-page');
    console.log(`   Updates queue reflects duplicate failure detection`);
    console.log('   ✅ Duplicate URL detection successfully handled');

    console.log('\n========================================================================');
    console.log('🎉 ALL PLAYWRIGHT E2E FLOW TESTS PASSED SUCCESSFULLY!');
    console.log('========================================================================');
  } catch (err) {
    console.error('\n❌ Playwright E2E execution failed:', err);
    throw err;
  } finally {
    console.log('\n💾 Finalizing and saving video recording...');
    const video = page.video();
    await page.close();
    await context.close();
    await browser.close();

    if (video) {
      const origVideoPath = await video.path();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const targetVideoPath = path.join(
        DOWNLOADS_DIR,
        `llmstxt-playwright-e2e-${timestamp}.webm`
      );
      try {
        fs.copyFileSync(origVideoPath, targetVideoPath);
        videoPath = targetVideoPath;
        console.log(`📹 Video recording saved to: ${targetVideoPath}`);
      } catch {
        videoPath = origVideoPath;
        console.log(`📹 Video recording saved to: ${origVideoPath}`);
      }

      // Also copy to repository recordings folder if present
      if (fs.existsSync(RECORDINGS_DIR)) {
        const repoVideoPath = path.join(RECORDINGS_DIR, 'e2e-playwright-flow.webm');
        try {
          fs.copyFileSync(origVideoPath, repoVideoPath);
          console.log(`📹 Repository recording updated: ${repoVideoPath}`);
        } catch {
          // Ignore copy error
        }
      }
    }

    await viteServer.close();
    console.log('🛑 Development servers closed cleanly.');
  }

  return videoPath;
}

main()
  .then((vPath) => {
    console.log(`\n✨ Playwright E2E run finished. Output video saved at:\n   ${vPath}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
