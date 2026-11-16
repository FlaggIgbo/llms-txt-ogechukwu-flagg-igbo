import { db } from '@llmstxt/database';
import { generationQueue } from '@llmstxt/queue';
import { logError } from '@llmstxt/logger';
import type { GenerateJobPayload } from '@llmstxt/shared-types';
import { scrapeWebsite } from '../services/scraper.js';
import {
  generateLlmsTxtFiles,
  getInitialIntervalForCategory,
} from '../services/llmsGenerator.js';
import { uploadToStorage } from '../services/storageUpload.js';
import { probeWebsiteChanges, hashText } from '../services/siteProbe.js';
import { computeNextCadence } from '../services/cadenceCalculator.js';

// Process a single generation job.
export async function handleGenerateJob(payload: GenerateJobPayload): Promise<void> {
  const { entryId, websiteUrl, isScheduledUpdate } = payload;

  try {
    // Mark entry as processing.
    await db.updateEntry(entryId, { status: 'PROCESSING' });

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

        await db.updateEntry(entryId, { status: 'COMPLETED', is_updated_latest: true });
        return;
      }
    }

    // Full crawl and generation (for initial run or detected changes).
    const scraped = await scrapeWebsite(websiteUrl);
    const files = await generateLlmsTxtFiles(scraped);
    const uploaded = await uploadToStorage(websiteUrl, files.llmsTxt, files.llmsFullTxt);

    // Update main entry record.
    await db.updateEntry(entryId, {
      website_name: scraped.title,
      website_short_description: scraped.description || undefined,
      is_updated_latest: true,
      llms_txt_storage: uploaded.llmsTxtUri,
      llms_full_txt_storage: uploaded.llmsFullTxtUri,
      status: 'COMPLETED',
    });

    // Update cadence table with new interval and content hash.
    const cadence = await db.getCadenceBySiteId(entryId);
    const currentInterval = cadence?.check_interval_hours || getInitialIntervalForCategory(files.siteCategory);

    const next = computeNextCadence({
      changed: true,
      currentIntervalHours: currentInterval,
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
    await db.updateEntry(entryId, { status: 'FAILED' });
  }
}

// Listen for and process generation jobs.
export function startGenerateConsumer(): void {
  generationQueue.registerConsumer(handleGenerateJob);
}
