import { db } from '@llmstxt/database';
import { generationQueue } from '@llmstxt/queue';
import {
  type SiteEntry,
  type CreateSiteEntryRequest,
  type CreateSiteEntryResponse,
  type GetEntriesRequest,
  type GetEntriesResponseMessage,
  type GetEntriesResponse,
  type PostEntryRequest,
  type PostEntryResponseMessage,
  type TypedApiRequest,
  type TypedApiResponse,
  ApiErrorCode,
  ApiErrorMessage,
} from '@llmstxt/shared-types';
import { logError } from '../services/logger.js';
import { storageService } from '../services/storageService.js';
import {
  getClientIp,
  checkIpRateLimit,
  recordIpSubmission,
  DAILY_ENTRY_LIMIT,
} from '../services/rateLimiter.js';

// Send a strongly-typed JSON payload over a TypedApiResponse.
export function sendJsonResponse<T>(
  res: TypedApiResponse<T>,
  statusCode: number,
  payload: T,
  extraHeaders: Record<string, string> = {}
): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

// Read JSON body from incoming typed HTTP request.
async function parseJsonBody<T>(req: TypedApiRequest<T>): Promise<T> {
  if (req.body !== undefined) {
    return req.body;
  }
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += String(chunk);
    });
    req.on('end', () => {
      try {
        resolve(body ? (JSON.parse(body) as T) : ({} as T));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// Resolve storage URLs for an entry.
export function formatEntryStorageUrls(entry: SiteEntry): SiteEntry {
  const downloadUrl = storageService.getDownloadUrl(entry.llms_txt_storage);
  const fullDownloadUrl = storageService.getDownloadUrl(entry.llms_full_txt_storage);

  let cleanWebsiteUrl = entry.website_url;
  while (cleanWebsiteUrl.endsWith('/')) {
    cleanWebsiteUrl = cleanWebsiteUrl.slice(0, -1);
  }

  const defaultTxtUrl = `${cleanWebsiteUrl}/llms.txt`;

  return {
    ...entry,
    llm_txt: downloadUrl || entry.llm_txt || defaultTxtUrl,
    llms_txt_storage: downloadUrl || entry.llms_txt_storage,
    llms_full_txt_storage: fullDownloadUrl || entry.llms_full_txt_storage,
  };
}

// Return directory entries filtered by status or default to completed entries.
export async function handleGetEntries(
  req: GetEntriesRequest,
  res: GetEntriesResponseMessage
): Promise<void> {
  try {
    const rawUrl = req.url || '/';
    const parsedUrl = new URL(rawUrl, `http://${req.headers.host || 'localhost'}`);
    const statusParam = req.query?.status ?? parsedUrl.searchParams.get('status');

    let entries = await db.listEntries();

    if (!statusParam) {
      // Default: only return completed / confirmed entries for the home page.
      entries = entries.filter((entry) => entry.status === 'COMPLETED');
    } else if (statusParam.toLowerCase() === 'pending' || statusParam.toLowerCase() === 'updating') {
      // Updates page: return entries in progress (PENDING, PROCESSING),
      // and user-submitted entries that failed (to show an error next to them).
      // Entries updated from the cron scheduler that failed are excluded.
      entries = entries.filter((entry) => {
        if (entry.status === 'PENDING' || entry.status === 'PROCESSING') {
          return true;
        }
        if (entry.status === 'FAILED' && !entry.is_scheduled_update) {
          return true;
        }
        return false;
      });
    } else {
      entries = entries.filter((entry) => entry.status.toLowerCase() === statusParam.toLowerCase());
    }

    const formatted: GetEntriesResponse = entries.map(formatEntryStorageUrls);
    sendJsonResponse(res, 200, formatted);
  } catch (error) {
    logError(error, { endpoint: 'GET /entries' });
    sendJsonResponse(res, 500, {
      error: ApiErrorMessage.GET_ENTRIES_FAILED,
      code: ApiErrorCode.DATABASE_ERROR,
    });
  }
}

// Create a new site entry with an initial cadence schedule.
export async function handlePostEntry(
  req: PostEntryRequest,
  res: PostEntryResponseMessage
): Promise<void> {
  try {
    // Check IP rate limit (max 20 entries per day per IP).
    const clientIp = getClientIp(req);
    const rateCheck = checkIpRateLimit(clientIp);

    if (!rateCheck.allowed) {
      sendJsonResponse<CreateSiteEntryResponse>(
        res,
        429,
        {
          error: ApiErrorMessage.RATE_LIMIT_EXCEEDED,
          code: ApiErrorCode.RATE_LIMIT_EXCEEDED,
          retryAfter: rateCheck.retryAfterSeconds,
        },
        {
          'Retry-After': String(rateCheck.retryAfterSeconds),
          'X-RateLimit-Limit': String(DAILY_ENTRY_LIMIT),
          'X-RateLimit-Remaining': '0',
        }
      );
      return;
    }

    const body = await parseJsonBody<CreateSiteEntryRequest>(req);

    if (!body.website_url) {
      sendJsonResponse(res, 400, {
        error: ApiErrorMessage.WEBSITE_URL_REQUIRED,
        code: ApiErrorCode.BAD_REQUEST,
      });
      return;
    }

    // Insert into site_entries and site_cadence in one transaction.
    const { entry } = await db.createEntryWithCadence(body);

    // Queue background generation job only if not already failed (e.g. duplicate URL).
    if (entry.status !== 'FAILED') {
      await generationQueue.enqueueGenerateJob({
        entryId: entry.id,
        websiteUrl: entry.website_url,
        isScheduledUpdate: false,
      });
    }

    // Record submission for rate limiter.
    recordIpSubmission(clientIp);

    sendJsonResponse(res, 201, formatEntryStorageUrls(entry), {
      'X-RateLimit-Limit': String(DAILY_ENTRY_LIMIT),
      'X-RateLimit-Remaining': String(Math.max(0, rateCheck.remaining - 1)),
    });
  } catch (error) {
    logError(error, { endpoint: 'POST /entries' });
    sendJsonResponse(res, 500, {
      error: ApiErrorMessage.CREATE_ENTRY_FAILED,
      code: ApiErrorCode.INTERNAL_ERROR,
    });
  }
}
