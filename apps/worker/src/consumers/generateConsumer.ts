import { db } from '@llmstxt/database';
import { generationQueue, type DeadLetterJob } from '@llmstxt/queue';
import { logError } from '@llmstxt/logger';
import {
  type GenerateJobPayload,
  EntryStatus,
  EntryErrorCode,
  EntryErrorMessage,
} from '@llmstxt/shared-types';
import { scrapeWebsite } from '../services/scraper.js';
import {
  generateLlmsTxtFiles,
  getInitialIntervalForCategory,
} from '../services/llmsGenerator.js';
import { assertValidLlmsFiles } from '../services/llmsValidator.js';
import { uploadToStorage } from '../services/storageUpload.js';
import { probeWebsiteChanges, hashText } from '../services/siteProbe.js';
import { computeNextCadence } from '../services/cadenceCalculator.js';

// Process a single generation job.
export async function handleGenerateJob(payload: GenerateJobPayload): Promise<void> {
  const { entryId, websiteUrl, isScheduledUpdate } = payload;

  try {
    // Check if the URL already exists in site_entries under another entry ID.
    const existing = await db.getEntryByUrl(websiteUrl);
    if (existing && existing.id !== entryId && existing.status === EntryStatus.COMPLETED) {
      await db.updateEntry(entryId, {
        status: EntryStatus.FAILED,
        error_message: EntryErrorMessage.DUPLICATE_URL,
        error_code: EntryErrorCode.DUPLICATE_URL,
        is_scheduled_update: false,
      });
      return;
    }

    // Mark entry as processing and track whether it was triggered by cron.
    await db.updateEntry(entryId, {
      status: EntryStatus.PROCESSING,
      is_scheduled_update: Boolean(isScheduledUpdate),
    });

    // Handle scheduled periodic updates.
    if (isScheduledUpdate) {
      const cadence = await db.getCadenceBySiteId(entryId);

      // Run lightweight probe first (zero Playwright cost).
      const probe = await probeWebsiteChanges(
        websiteUrl,
        cadence?.etag,
        cadence?.last_modified,
        cadence?.last_content_hash
      );

      // Short-circuit if content has not changed.
      if (!probe.changed) {
        const next = computeNextCadence({
          changed: false,
          currentIntervalHours: cadence?.check_interval_hours || 24,
          unchangedStreak: cadence?.unchanged_streak || 0,
        });

        await db.updateCadenceResult(entryId, {
          newIntervalHours: next.newIntervalHours,
          newStreak: next.newStreak,
          nextCheckAt: next.nextCheckAt,
          etag: probe.etag,
          lastModified: probe.lastModified,
          contentHash: probe.contentHash,
        });

        await db.updateEntry(entryId, { status: EntryStatus.COMPLETED, is_updated_latest: true });
        return;
      }
    }

    // Full crawl and generation (for initial run or detected changes).
    const scraped = await scrapeWebsite(websiteUrl);
    const files = await generateLlmsTxtFiles(scraped);

    // Verify generated files adhere to standard structure and are not corrupted before upload.
    assertValidLlmsFiles(files.llmsTxt, files.llmsFullTxt);

    const uploaded = await uploadToStorage(websiteUrl, files.llmsTxt, files.llmsFullTxt);

    // Also persist generated files in PostgreSQL so API and worker containers share access.
    const folderName = websiteUrl
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '')
      .replace(/[^a-zA-Z0-9.-]/g, '_');
    await db.saveStorageFile(`${folderName}/llms.txt`, files.llmsTxt);
    await db.saveStorageFile(`${folderName}/llms-full.txt`, files.llmsFullTxt);

    // Update main entry record.
    await db.updateEntry(entryId, {
      website_name: scraped.title,
      website_short_description: scraped.description || undefined,
      is_updated_latest: true,
      llms_txt_storage: uploaded.llmsTxtUri,
      llms_full_txt_storage: uploaded.llmsFullTxtUri,
      status: EntryStatus.COMPLETED,
      error_message: null,
      is_scheduled_update: false,
    });

    // Update cadence table with new interval and content hash.
    const cadence = await db.getCadenceBySiteId(entryId);
    const isFirstCrawl = !cadence?.last_checked_at;
    const initialBaseInterval = isFirstCrawl
      ? getInitialIntervalForCategory(files.siteCategory)
      : (cadence?.check_interval_hours || getInitialIntervalForCategory(files.siteCategory));

    const next = computeNextCadence({
      isInitial: isFirstCrawl,
      changed: isFirstCrawl ? false : true, // Initial crawl establishes baseline, not a delta
      currentIntervalHours: initialBaseInterval,
      unchangedStreak: cadence?.unchanged_streak || 0,
    });

    const contentHash = hashText(scraped.textContent || scraped.markdownContent);

    await db.updateCadenceResult(entryId, {
      newIntervalHours: next.newIntervalHours,
      newStreak: next.newStreak,
      nextCheckAt: next.nextCheckAt,
      contentHash,
      siteCategory: files.siteCategory,
    });
  } catch (err) {
    logError(err, { websiteUrl, entryId, context: 'Worker' });
    // Rethrow so the queue performs retries (up to 3 times) before moving to DLQ.
    throw err;
  }
}

// Handle jobs that exhausted all 3 retries and entered the DLQ.
export async function handleDeadLetterJob(dlqJob: DeadLetterJob): Promise<void> {
  const { entryId, isScheduledUpdate } = dlqJob.payload;

  if (isScheduledUpdate) {
    // Cron-scheduled update failed: remove from the frontend "updates" queue.
    // Revert entry status back to COMPLETED so existing directory entry remains active.
    await db.updateEntry(entryId, {
      status: EntryStatus.COMPLETED,
      is_updated_latest: true,
      error_message: null,
      is_scheduled_update: true,
    });
  } else {
    // User-submitted entry failed: mark as FAILED with error message to show on updates page.
    await db.updateEntry(entryId, {
      status: EntryStatus.FAILED,
      error_message: dlqJob.error || EntryErrorMessage.GENERATION_FAILED,
      error_code: dlqJob.error ? EntryErrorCode.CRAWL_FAILED : EntryErrorCode.GENERATION_FAILED,
      is_scheduled_update: false,
    });
  }
}

let consumerRegistered = false;

// Listen for and process generation jobs.
export function startGenerateConsumer(): void {
  if (consumerRegistered) return;
  consumerRegistered = true;
  generationQueue.registerConsumer(handleGenerateJob);
  generationQueue.onDeadLetter(handleDeadLetterJob);
}
