import type { GenerateJobPayload } from '@llmstxt/shared-types';

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
  // Add a job to the queue.
  async enqueueGenerateJob(_payload: GenerateJobPayload): Promise<{ jobId: string }> {
    throw new Error('Not implemented');
  }

  // Listen for new jobs on the queue.
  registerConsumer(_handler: JobHandler): void {
    throw new Error('Not implemented');
  }
}

export const generationQueue = new GenerationQueue();
