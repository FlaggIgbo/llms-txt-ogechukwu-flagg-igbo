import { randomUUID } from 'node:crypto';
import { db } from '@llmstxt/database';
import { generationQueue } from '@llmstxt/queue';
import type { UpdateLog } from '@llmstxt/shared-types';

const LOGS_BUCKET = process.env.S3_UPDATE_LOGS_BUCKET ?? 'llmstxt-update-logs-bucket';

/**
 * Queries PostgreSQL for stale sites, re-enqueues generation jobs, and writes logs to the Update Logs S3 Bucket.
 */
export async function checkStaleSites(): Promise<UpdateLog[]> {
  console.log('[CronUpdater] Checking database for stale site entries...');
  const entries = await db.listEntries();
  const logs: UpdateLog[] = [];

  for (const entry of entries) {
    const now = new Date().toISOString();
    const isStale = !entry.is_updated_latest;

    if (isStale) {
      await generationQueue.enqueueGenerateJob({
        entryId: entry.id,
        websiteUrl: entry.website_url,
        isScheduledUpdate: true,
      });
    }

    const logRecord: UpdateLog = {
      id: randomUUID(),
      entry_id: entry.id,
      website_url: entry.website_url,
      checked_at: now,
      was_stale: isStale,
      regenerated: isStale,
      s3_log_key: `s3://${LOGS_BUCKET}/logs/${now.slice(0, 10)}/${entry.id}.json`,
    };

    logs.push(logRecord);
    console.log(
      `[CronUpdater] Logged check for ${entry.website_url} (stale=${isStale}) -> ${logRecord.s3_log_key}`
    );
  }

  return logs;
}
