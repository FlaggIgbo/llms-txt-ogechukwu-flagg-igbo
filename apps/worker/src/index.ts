import { logInfo } from '@llmstxt/logger';
import { startGenerateConsumer } from './consumers/generateConsumer.js';

// Entry point for the background worker.
export function startWorker(): void {
  logInfo('[Worker] Starting background generation worker...');
  startGenerateConsumer();
}

// Start immediately if executed directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  startWorker();
}
