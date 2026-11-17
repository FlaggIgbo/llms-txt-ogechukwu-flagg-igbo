import { randomUUID } from 'node:crypto';
import { db } from '@llmstxt/database';
import { generationQueue } from '@llmstxt/queue';
import type { UpdateLog } from '@llmstxt/shared-types';

// Find due websites and queue background refresh jobs.
export async function checkStaleSites(batchSize: number = 50): Promise<UpdateLog[]> {
  const dueSites = await db.claimDueCadenceSites(batchSize);
  const logs: UpdateLog[] = [];

  for (const site of dueSites) {
    await generationQueue.enqueueGenerateJob({
      entryId: site.site_id,
      websiteUrl: site.url,
      isScheduledUpdate: true,
    });

    logs.push({
      id: randomUUID(),
      entry_id: site.site_id,
      website_url: site.url,
      checked_at: new Date().toISOString(),
      was_stale: true,
      regenerated: false,
      r2_log_key: `logs/${site.site_id}/${Date.now()}.json`,
    });
  }

  return logs;
}
