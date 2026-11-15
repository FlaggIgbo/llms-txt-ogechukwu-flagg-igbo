import { checkStaleSites } from './jobs/checkStaleSites.js';

const CRON_INTERVAL_MS = Number(process.env.CRON_INTERVAL_MS ?? 60_000 * 60 * 24); // default 24h

async function startCronUpdater(): Promise<void> {
  console.log('[CronUpdater] Starting scheduled updater service...');
  await checkStaleSites();

  setInterval(() => {
    checkStaleSites().catch((err) => {
      console.error('[CronUpdater] Error during scheduled check:', err);
    });
  }, CRON_INTERVAL_MS);
}

startCronUpdater().catch((err) => {
  console.error('[CronUpdater] Fatal startup error:', err);
  process.exit(1);
});
