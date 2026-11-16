import { logInfo, logError } from '@llmstxt/logger';
import { checkStaleSites } from './jobs/checkStaleSites.js';

// Start the scheduled updater service.
export async function startCronUpdater(): Promise<void> {
  logInfo('[CronUpdater] Starting scheduled updater service...');

  // Run initial check on startup.
  try {
    const logs = await checkStaleSites();
    logInfo(`[CronUpdater] Initial check completed. Queued ${logs.length} sites.`);
  } catch (err) {
    logError(err, { context: 'CronUpdater_Initial' });
  }

  // Periodic polling every 5 minutes.
  const intervalMs = 5 * 60 * 1000;
  setInterval(async () => {
    try {
      const logs = await checkStaleSites();
      if (logs.length > 0) {
        logInfo(`[CronUpdater] Polled cadence table. Queued ${logs.length} sites.`);
      }
    } catch (err) {
      logError(err, { context: 'CronUpdater_Polling' });
    }
  }, intervalMs);
}

// Start immediately if executed directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  startCronUpdater();
}
