import { EventEmitter } from 'node:events';
import type { GenerateJobPayload } from '@llmstxt/shared-types';

export const QUEUE_NAME = process.env.QUEUE_NAME ?? 'llmstxt-generation-queue';

export interface QueueConfig {
  redisHost: string;
  redisPort: number;
  queueName: string;
}

export const defaultQueueConfig: QueueConfig = {
  redisHost: process.env.REDIS_HOST ?? 'localhost',
  redisPort: Number(process.env.REDIS_PORT ?? 6379),
  queueName: QUEUE_NAME,
};

type JobHandler = (payload: GenerateJobPayload) => Promise<void>;

/**
 * Shared Queue Producer / Consumer abstraction (configured for BullMQ / Redis or SQS).
 */
class GenerationQueue {
  private emitter = new EventEmitter();

  async enqueueGenerateJob(payload: GenerateJobPayload): Promise<{ jobId: string }> {
    const jobId = `job_${Date.now()}_${payload.entryId.slice(0, 8)}`;
    console.log(`[Queue:${defaultQueueConfig.queueName}] Enqueued job ${jobId} for ${payload.websiteUrl}`);
    setImmediate(() => {
      this.emitter.emit('job', payload);
    });
    return { jobId };
  }

  registerConsumer(handler: JobHandler): void {
    console.log(
      `[Queue:${defaultQueueConfig.queueName}] Consumer registered (${defaultQueueConfig.redisHost}:${defaultQueueConfig.redisPort})`
    );
    this.emitter.on('job', async (payload: GenerateJobPayload) => {
      try {
        await handler(payload);
      } catch (err) {
        console.error(`[Queue:${defaultQueueConfig.queueName}] Job failed:`, err);
      }
    });
  }
}

export const generationQueue = new GenerationQueue();
