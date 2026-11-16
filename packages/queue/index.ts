import type { GenerateJobPayload } from '@llmstxt/shared-types';
import { logError } from '@llmstxt/logger';

// Redis queue settings.
export interface QueueConfig {
  redisHost: string;
  redisPort: number;
  queueName: string;
}

// Function type for processing a job.
export type JobHandler = (payload: GenerateJobPayload) => Promise<void>;

// Manages background generation jobs.
export class GenerationQueue {
  private handlers: JobHandler[] = [];
  private jobCounter = 0;

  // Add a job to the queue.
  async enqueueGenerateJob(payload: GenerateJobPayload): Promise<{ jobId: string }> {
    this.jobCounter += 1;
    const jobId = `job_${Date.now()}_${this.jobCounter}`;

    // Dispatch job asynchronously to registered consumers.
    for (const handler of this.handlers) {
      setTimeout(() => {
        handler(payload).catch((err) => {
          logError(err, { jobId, context: 'Queue' });
        });
      }, 0);
    }

    return { jobId };
  }

  // Listen for new jobs on the queue.
  registerConsumer(handler: JobHandler): void {
    this.handlers.push(handler);
  }
}

export const generationQueue = new GenerationQueue();
