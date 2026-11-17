import { initSentry, logInfo } from '@llmstxt/logger';
import { generationQueue } from '@llmstxt/queue';
import { startGenerateConsumer } from './consumers/generateConsumer.js';

initSentry();

let workerStarted = false;

// Entry point for the background worker.
export function startWorker(): void {
  if (workerStarted) return;
  workerStarted = true;
  logInfo('[Worker] Starting background generation worker...');
  startGenerateConsumer();

  // Poll PostgreSQL background_jobs table every 2 seconds for newly submitted sites.
  generationQueue.startDatabasePolling(2000);
}

// Start immediately if executed directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  startWorker();
}
