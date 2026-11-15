import { db } from '@llmstxt/database';
import { generationQueue } from '@llmstxt/queue';
import type { GenerateJobPayload } from '@llmstxt/shared-types';
import { scrapeWebsite } from '../services/scraper.js';
import { generateLlmsTxtFiles } from '../services/llmsGenerator.js';
import { uploadToS3 } from '../services/storageUpload.js';

export function startGenerateConsumer(): void {
  generationQueue.registerConsumer(async (payload: GenerateJobPayload) => {
    console.log(`[Worker] Processing generation job for entry ${payload.entryId} (${payload.websiteUrl})`);
    await db.updateEntry(payload.entryId, { status: 'PROCESSING' });

    try {
      const scraped = await scrapeWebsite(payload.websiteUrl);
      const { llmsTxt, llmsFullTxt } = generateLlmsTxtFiles(scraped);
      const { llmsTxtUri, llmsFullTxtUri } = await uploadToS3(
        payload.websiteUrl,
        llmsTxt,
        llmsFullTxt
      );

      await db.updateEntry(payload.entryId, {
        website_short_description: scraped.description,
        is_updated_latest: true,
        llms_txt_storage: llmsTxtUri,
        llms_full_txt_storage: llmsFullTxtUri,
        status: 'COMPLETED',
      });

      console.log(`[Worker] Completed generation for ${payload.websiteUrl}`);
    } catch (error) {
      console.error(`[Worker] Failed generation for ${payload.websiteUrl}:`, error);
      await db.updateEntry(payload.entryId, {
        status: 'FAILED',
        is_updated_latest: false,
      });
    }
  });
}
