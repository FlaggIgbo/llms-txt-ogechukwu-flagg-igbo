import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { GenerationQueue, type DeadLetterJob } from './index.js';
import { db, MOCK_SEED_ENTRIES } from '@llmstxt/database';

describe('GenerationQueue with retries and DLQ', () => {
  let queue: GenerationQueue;

  beforeEach(() => {
    queue = new GenerationQueue({ maxRetries: 3, retryDelayMs: 10 });
  });

  it('successfully processes a job on the first attempt', async () => {
    let callCount = 0;
    queue.registerConsumer(async () => {
      callCount += 1;
    });

    await queue.enqueueGenerateJob({
      entryId: MOCK_SEED_ENTRIES[0].id,
      websiteUrl: 'https://example.com',
    });

    // Allow async execution
    await new Promise((r) => setTimeout(r, 60));

    assert.equal(callCount, 1);
    assert.equal(queue.getActiveJobsCount(), 0);
    assert.equal(queue.getDeadLetterQueue().length, 0);
  });

  it('retries up to 3 times and succeeds if an attempt passes', async () => {
    let attempts = 0;
    queue.registerConsumer(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error(`Temporary failure on attempt ${attempts}`);
      }
    });

    await queue.enqueueGenerateJob({
      entryId: MOCK_SEED_ENTRIES[1].id,
      websiteUrl: 'https://retry.example.com',
    });

    // Wait for retries to complete (10ms * 1 + 10ms * 2 = 30ms)
    await new Promise((r) => setTimeout(r, 150));

    assert.equal(attempts, 3);
    assert.equal(queue.getActiveJobsCount(), 0);
    assert.equal(queue.getDeadLetterQueue().length, 0);
  });

  it('moves job to DLQ and fires onDeadLetter when exceeding 3 attempts', async () => {
    let attempts = 0;
    let deadLetterReceived: DeadLetterJob | undefined;

    queue.onDeadLetter((dlqJob) => {
      deadLetterReceived = dlqJob;
    });

    queue.registerConsumer(async () => {
      attempts += 1;
      throw new Error(`Persistent failure ${attempts}`);
    });

    await queue.enqueueGenerateJob({
      entryId: MOCK_SEED_ENTRIES[2].id,
      websiteUrl: 'https://fail.example.com',
    });

    // Wait for all 3 retries and DLQ dispatch
    await new Promise((r) => setTimeout(r, 200));

    assert.equal(attempts, 3);
    assert.equal(queue.getActiveJobsCount(), 0);

    const dlq = queue.getDeadLetterQueue();
    assert.equal(dlq.length, 1);
    assert.equal(dlq[0].attempts, 3);
    assert.equal(dlq[0].payload.entryId, MOCK_SEED_ENTRIES[2].id);
    assert.ok(dlq[0].error.includes('Persistent failure'));
    assert.ok(dlq[0].instruction.includes('bounce the queue'));

    assert.ok(deadLetterReceived !== undefined);
    assert.equal(deadLetterReceived?.payload.entryId, MOCK_SEED_ENTRIES[2].id);
  });

  it('bounces the queue, clearing active and DLQ jobs', async () => {
    queue.registerConsumer(async () => {
      throw new Error('Fatal error');
    });

    await queue.enqueueGenerateJob({
      entryId: MOCK_SEED_ENTRIES[3].id,
      websiteUrl: 'https://bounce.example.com',
    });

    await new Promise((r) => setTimeout(r, 200));
    assert.equal(queue.getDeadLetterQueue().length, 1);

    await queue.bounceQueue();
    assert.equal(queue.getDeadLetterQueue().length, 0);
    assert.equal(queue.getActiveJobsCount(), 0);
  });

  describe('PostgreSQL background_jobs table (Option B)', () => {
    beforeEach(async () => {
      let leftover = await db.claimNextBackgroundJob();
      while (leftover) {
        await db.completeBackgroundJob(leftover.id);
        leftover = await db.claimNextBackgroundJob();
      }
    });

    it('creates and claims queued jobs with FOR UPDATE SKIP LOCKED', async () => {
      const job = await db.createBackgroundJob({
        entryId: MOCK_SEED_ENTRIES[0].id,
        websiteUrl: 'https://pg-queue.example.com',
      });

      assert.equal(job.status, 'QUEUED');
      assert.equal(job.attempts, 0);
      assert.equal(job.max_attempts, 3);

      const claimed = await db.claimNextBackgroundJob();
      assert.ok(claimed !== null);
      assert.equal(claimed?.status, 'PROCESSING');
      assert.ok(claimed!.attempts >= 1);

      await db.completeBackgroundJob(claimed!.id);
    });

    it('retries when attempts < max_attempts and transitions to DEAD_LETTER when attempts reach 3', async () => {
      const job = await db.createBackgroundJob({
        entryId: MOCK_SEED_ENTRIES[1].id,
        websiteUrl: 'https://dlq.example.com',
      });

      // Claim attempt 1
      const claimed1 = await db.claimNextBackgroundJob();
      assert.ok(claimed1 !== null);
      const fail1 = await db.failBackgroundJob(claimed1!.id, 'Error 1');
      assert.equal(fail1.isDeadLetter, false);
      assert.equal(fail1.job.status, 'QUEUED');

      // Claim attempt 2
      const claimed2 = await db.claimNextBackgroundJob();
      assert.ok(claimed2 !== null);
      const fail2 = await db.failBackgroundJob(claimed2!.id, 'Error 2');
      assert.equal(fail2.isDeadLetter, false);
      assert.equal(fail2.job.status, 'QUEUED');

      // Claim attempt 3
      const claimed3 = await db.claimNextBackgroundJob();
      assert.ok(claimed3 !== null);
      const fail3 = await db.failBackgroundJob(claimed3!.id, 'Fatal error 3');
      assert.equal(fail3.isDeadLetter, true);
      assert.equal(fail3.job.status, 'DEAD_LETTER');
      assert.ok(fail3.job.failed_at !== null);

      const dlqJobs = await db.getDeadLetterJobs();
      assert.ok(dlqJobs.some((j) => j.id === job.id));
    });
  });
});

