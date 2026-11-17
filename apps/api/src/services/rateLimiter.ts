import type { TypedApiRequest } from '@llmstxt/shared-types';

// Default maximum allowed entry additions per day per user IP.
export const DAILY_ENTRY_LIMIT = 20;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

// In-memory store for tracking IP submissions.
const ipSubmissionMap = new Map<string, RateLimitRecord>();

// Extract the client's IP address from incoming request headers or socket.
export function getClientIp<TBody = unknown, TQuery = Record<string, string | undefined>>(
  req: TypedApiRequest<TBody, TQuery>
): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

// Check if a client IP has exceeded their daily entry submission limit.
export function checkIpRateLimit(
  ip: string,
  limit: number = DAILY_ENTRY_LIMIT
): {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
} {
  const now = Date.now();
  const record = ipSubmissionMap.get(ip);

  // If no record exists or the 24-hour window expired, allow and reset.
  if (!record || now >= record.resetAt) {
    return {
      allowed: true,
      remaining: limit,
      retryAfterSeconds: 0,
      resetAt: now + ONE_DAY_MS,
    };
  }

  const remaining = Math.max(0, limit - record.count);
  const retryAfterSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));

  if (record.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
      resetAt: record.resetAt,
    };
  }

  return {
    allowed: true,
    remaining,
    retryAfterSeconds: 0,
    resetAt: record.resetAt,
  };
}

// Record a successful entry submission for a given client IP.
export function recordIpSubmission(ip: string, limit: number = DAILY_ENTRY_LIMIT): void {
  const now = Date.now();
  const record = ipSubmissionMap.get(ip);

  if (!record || now >= record.resetAt) {
    ipSubmissionMap.set(ip, {
      count: 1,
      resetAt: now + ONE_DAY_MS,
    });
    return;
  }

  record.count += 1;
}

// Reset rate limits (for test environments and queue bouncing).
export function resetRateLimits(): void {
  ipSubmissionMap.clear();
}

