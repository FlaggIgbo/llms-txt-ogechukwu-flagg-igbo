import type { GenerateJobPayload, BackgroundJob } from '@llmstxt/shared-types';
import { logError, logWarn } from '@llmstxt/logger';
import { db } from '@llmstxt/database';

// Redis/Database queue settings.
export interface QueueConfig {
  redisHost: string;
  redisPort: number;
  queueName: string;
}

// Function type for processing a job.
export type JobHandler = (payload: GenerateJobPayload) => Promise<void>;

// Job stored in the queue with attempt tracking.
export interface QueueJob {
  id: string;
  payload: GenerateJobPayload;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  lastError?: string;
}

// Dead letter job record after exhausting all retries.
export interface DeadLetterJob {
  jobId: string;
  payload: GenerateJobPayload;
  attempts: number;
  failedAt: string;
  error: string;
  instruction: string;
}

// Callback invoked when a job enters the Dead Letter Queue.
export type DeadLetterHandler = (job: DeadLetterJob) => Promise<void> | void;

// Manages background generation jobs with automatic retries and DLQ backed by PostgreSQL background_jobs table.
export class GenerationQueue {
  private handlers: JobHandler[] = [];
  private deadLetterHandlers: DeadLetterHandler[] = [];
  private deadLetterQueue: DeadLetterJob[] = [];
  private activeJobs = new Map<string, QueueJob>();
  private jobCounter = 0;
  private maxRetries = 3;
  private retryDelayMs = 100;
  private dbPollingTimer: ReturnType<typeof setInterval> | null = null;
  private isPollingDb = false;
  private executionChain: Promise<void> = Promise.resolve();

  constructor(options?: { maxRetries?: number; retryDelayMs?: number }) {
    if (options?.maxRetries !== undefined) {
      this.maxRetries = options.maxRetries;
    }
    if (options?.retryDelayMs !== undefined) {
      this.retryDelayMs = options.retryDelayMs;
    }
  }

  // Add a job to the queue and insert into Postgres background_jobs table.
  async enqueueGenerateJob(payload: GenerateJobPayload): Promise<{ jobId: string }> {
    let jobId = `job_${Date.now()}_${++this.jobCounter}`;
    let persistedInDb = false;

    try {
      const dbJob = await db.createBackgroundJob(payload, this.maxRetries);
      if (dbJob?.id) {
        jobId = dbJob.id;
        persistedInDb = true;
      }
    } catch (err) {
      logWarn(`[GenerationQueue] Database job creation fallback: ${err}`);
    }

    const job: QueueJob = {
      id: jobId,
      payload,
      attempts: 0,
      maxAttempts: this.maxRetries,
      createdAt: new Date().toISOString(),
    };

    // If database polling is active and the job was persisted in Postgres, let the DB poller claim and process it sequentially.
    if (this.dbPollingTimer && persistedInDb && this.handlers.length > 0) {
      setTimeout(() => {
        void this.pollDatabaseQueue();
      }, 0);
      return { jobId };
    }

    this.activeJobs.set(jobId, job);

    // Dispatch job sequentially with retry logic to registered consumers.
    for (const handler of this.handlers) {
      this.executionChain = this.executionChain
        .then(() => this.executeJobWithRetries(job, handler))
        .catch(() => {});
    }

    return { jobId };
  }

  // Start polling the PostgreSQL background_jobs table for QUEUED jobs using FOR UPDATE SKIP LOCKED.
  startDatabasePolling(intervalMs: number = 2000): void {
    if (this.dbPollingTimer) return;
    void this.pollDatabaseQueue();
    this.dbPollingTimer = setInterval(() => {
      void this.pollDatabaseQueue();
    }, intervalMs);
  }

  // Claim and process queued jobs from PostgreSQL sequentially (one at a time to prevent memory spikes).
  async pollDatabaseQueue(): Promise<void> {
    if (this.isPollingDb || this.handlers.length === 0) return;
    this.isPollingDb = true;

    try {
      while (true) {
        const claimed = await db.claimNextBackgroundJob();
        if (!claimed) break;

        const payload: GenerateJobPayload = {
          entryId: claimed.entry_id,
          websiteUrl: claimed.website_url,
          isScheduledUpdate: claimed.is_scheduled_update,
        };

        const job: QueueJob = {
          id: claimed.id,
          payload,
          attempts: claimed.attempts,
          maxAttempts: claimed.max_attempts,
          createdAt: claimed.created_at,
        };

        this.activeJobs.set(job.id, job);

        try {
          for (const handler of this.handlers) {
            await handler(payload);
          }
          this.activeJobs.delete(job.id);
          await db.completeBackgroundJob(claimed.id);
        } catch (err: unknown) {
          this.activeJobs.delete(job.id);
          const errorMsg = err instanceof Error ? err.message : String(err);
          job.lastError = errorMsg;

          const failResult = await db
            .failBackgroundJob(claimed.id, errorMsg, claimed.attempts)
            .catch(() => ({ isDeadLetter: claimed.attempts >= claimed.max_attempts }));

          if (!failResult.isDeadLetter) {
            logWarn(
              `[GenerationQueue] DB Job ${claimed.id} failed attempt ${claimed.attempts}/${claimed.max_attempts} for ${claimed.website_url}: ${errorMsg}. Will retry...`
            );
          } else {
            await this.moveToDeadLetterQueue(job, err);
          }
        }
      }
    } catch (err) {
      logWarn(`[GenerationQueue] Error polling database queue: ${err}`);
    } finally {
      this.isPollingDb = false;
    }
  }

  // Execute a job with up to maxRetries attempts, updating background_jobs table.
  private async executeJobWithRetries(job: QueueJob, handler: JobHandler): Promise<void> {
    while (job.attempts < job.maxAttempts) {
      job.attempts += 1;
      try {
        await handler(job.payload);
        // Completed successfully, remove from active jobs and mark COMPLETED in DB.
        this.activeJobs.delete(job.id);
        await db.completeBackgroundJob(job.id).catch(() => {});
        return;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        job.lastError = errorMsg;

        const isDeadLetter = job.attempts >= job.maxAttempts;
        await db.failBackgroundJob(job.id, errorMsg, job.attempts).catch(() => {});

        if (!isDeadLetter) {
          logWarn(
            `[GenerationQueue] Job ${job.id} failed attempt ${job.attempts}/${job.maxAttempts} for ${job.payload.websiteUrl}: ${errorMsg}. Retrying...`
          );
          if (this.retryDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * job.attempts));
          }
        } else {
          // Exceeded max retries (3 at most): remove from active queue and move to DLQ.
          await this.moveToDeadLetterQueue(job, err);
          return;
        }
      }
    }
  }

  // Remove a permanently failed job from active queue, record in DLQ, and notify Sentry.
  private async moveToDeadLetterQueue(job: QueueJob, finalError: unknown): Promise<void> {
    this.activeJobs.delete(job.id);

    const errorMessage = finalError instanceof Error ? finalError.message : String(finalError);
    const instruction = 'Investigate failure root cause and bounce the queue once resolved.';

    const deadLetterJob: DeadLetterJob = {
      jobId: job.id,
      payload: job.payload,
      attempts: job.attempts,
      failedAt: new Date().toISOString(),
      error: errorMessage,
      instruction,
    };

    this.deadLetterQueue.push(deadLetterJob);

    // Fire alert to Sentry instructing an engineer to investigate and bounce queue.
    const sentryError = new Error(
      `[DLQ Alert] Job ${job.id} for "${job.payload.websiteUrl}" failed after ${job.attempts} attempts and was moved to Dead Letter Queue (DLQ). Action required: investigate failure and bounce the queue.`
    );

    logError(sentryError, {
      jobId: job.id,
      websiteUrl: job.payload.websiteUrl,
      entryId: job.payload.entryId,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      failedAt: deadLetterJob.failedAt,
      lastError: errorMessage,
      instruction,
      queueState: {
        activeCount: this.activeJobs.size,
        dlqCount: this.deadLetterQueue.length,
      },
    });

    // Notify registered DLQ listeners (e.g. updating database state).
    for (const dlqHandler of this.deadLetterHandlers) {
      try {
        await dlqHandler(deadLetterJob);
      } catch (handlerErr) {
        logError(handlerErr, { context: 'DLQ_Handler', jobId: job.id });
      }
    }
  }

  // Listen for new jobs on the queue.
  registerConsumer(handler: JobHandler): void {
    this.handlers.push(handler);
  }

  // Register a listener for jobs that enter the Dead Letter Queue.
  onDeadLetter(handler: DeadLetterHandler): void {
    this.deadLetterHandlers.push(handler);
  }

  // Get all dead letter jobs from memory or database.
  getDeadLetterQueue(): DeadLetterJob[] {
    return [...this.deadLetterQueue];
  }

  // Fetch all dead letter jobs directly from the PostgreSQL background_jobs table.
  async getDeadLetterJobsFromDb(): Promise<BackgroundJob[]> {
    return db.getDeadLetterJobs();
  }

  // Clear the Dead Letter Queue.
  clearDeadLetterQueue(): void {
    this.deadLetterQueue = [];
  }

  // Bounce/reset the queue: resets active jobs and clears dead letter items in memory and DB.
  async bounceQueue(): Promise<void> {
    this.activeJobs.clear();
    this.deadLetterQueue = [];
    await db.bounceJobQueue().catch(() => {});
    logWarn('[GenerationQueue] Queue has been bounced by operator.');
  }

  // Reprocess all dead letter jobs back into the active queue.
  async reprocessDeadLetterJobs(): Promise<number> {
    await db.reprocessDeadLetterJobs().catch(() => {});
    const jobsToRetry = [...this.deadLetterQueue];
    this.deadLetterQueue = [];

    for (const dlqJob of jobsToRetry) {
      await this.enqueueGenerateJob(dlqJob.payload);
    }

    return jobsToRetry.length;
  }

  // Get count of currently active in-flight jobs.
  getActiveJobsCount(): number {
    return this.activeJobs.size;
  }
}

export const generationQueue = new GenerationQueue();
