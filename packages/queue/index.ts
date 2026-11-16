import type { GenerateJobPayload } from '@llmstxt/shared-types';

export interface QueueConfig {
  redisHost: string;
  redisPort: number;
  queueName: string;
}

export type JobHandler = (payload: GenerateJobPayload) => Promise<void>;

export class GenerationQueue {
  async enqueueGenerateJob(_payload: GenerateJobPayload): Promise<{ jobId: string }> {
    throw new Error('Not implemented');
  }

  registerConsumer(_handler: JobHandler): void {
    throw new Error('Not implemented');
  }
}

export const generationQueue = new GenerationQueue();
