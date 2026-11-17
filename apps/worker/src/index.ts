import { logInfo, logError } from '@llmstxt/logger';
import { db } from '@llmstxt/database';
import { generationQueue } from '@llmstxt/queue';
import { startGenerateConsumer } from './consumers/generateConsumer.js';
import { putObjectToR2 } from './services/storageUpload.js';

// Sync any persisted PostgreSQL storage_files into Cloudflare R2 when R2 credentials are configured.
async function syncStorageFilesToR2(): Promise<void> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_LLMS_TXT_BUCKET || 'llmstxt-files-bucket';

  if (!accountId || !accessKeyId || !secretAccessKey) return;

  try {
    const files = await db.listStorageFiles();
    for (const file of files) {
      await putObjectToR2({
        accountId,
        accessKeyId,
        secretAccessKey,
        bucket,
        key: file.rel_path,
        body: file.content,
      }).catch(() => {});
    }
    if (files.length > 0) {
      logInfo(`[Worker] Synced ${files.length} stored files to Cloudflare R2 bucket "${bucket}".`);
    }
  } catch (err) {
    logError(err, { context: 'Worker_R2Sync' });
  }
}

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

  // Sync any existing stored files into Cloudflare R2.
  void syncStorageFilesToR2();

  // Run initial cadence check and poll every 5 minutes.
  pollScheduledSites();
  setInterval(pollScheduledSites, 5 * 60 * 1000);
}

// Start immediately if executed directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  startWorker();
}
