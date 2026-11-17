import { logInfo, logError } from '@llmstxt/logger';
import { db } from '@llmstxt/database';
import { generationQueue } from '@llmstxt/queue';
import { startGenerateConsumer } from './consumers/generateConsumer.js';

// Poll database for sites due for scheduled refresh.
async function pollScheduledSites(): Promise<void> {
  try {
    const dueSites = await db.claimDueCadenceSites(50);
    for (const site of dueSites) {
      await generationQueue.enqueueGenerateJob({
        entryId: site.site_id,
        websiteUrl: site.url,
        isScheduledUpdate: true,
      });
    }
    if (dueSites.length > 0) {
      logInfo(`[Worker] Queued ${dueSites.length} scheduled sites for refresh.`);
    }
  } catch (err) {
    logError(err, { context: 'Worker_CadencePolling' });
  }
}

let workerStarted = false;

// Entry point for the background worker.
export function startWorker(): void {
  if (workerStarted) return;
  workerStarted = true;
  logInfo('[Worker] Starting background generation worker...');
  startGenerateConsumer();

  // Poll PostgreSQL background_jobs table every 2 seconds for newly submitted sites.
  generationQueue.startDatabasePolling(2000);

  // Run initial cadence check and poll every 5 minutes.
  pollScheduledSites();
  setInterval(pollScheduledSites, 5 * 60 * 1000);
}

// Start immediately if executed directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  startWorker();
}
