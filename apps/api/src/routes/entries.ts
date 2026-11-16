import type { IncomingMessage, ServerResponse } from 'node:http';
import { db } from '@llmstxt/database';
import { generationQueue } from '@llmstxt/queue';
import type { SiteEntry, CreateSiteEntryRequest } from '@llmstxt/shared-types';
import { logError } from '../services/logger.js';
import { storageService } from '../services/storageService.js';
import {
  getClientIp,
  checkIpRateLimit,
  recordIpSubmission,
  DAILY_ENTRY_LIMIT,
} from '../services/rateLimiter.js';

// Read JSON body from incoming HTTP request.
async function parseJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
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
export async function handleGetEntries(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const rawUrl = req.url || '/';
    const parsedUrl = new URL(rawUrl, `http://${req.headers.host || 'localhost'}`);
    const statusParam = parsedUrl.searchParams.get('status');

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

    const formatted = entries.map(formatEntryStorageUrls);

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(formatted));
  } catch (error) {
    logError(error, { endpoint: 'GET /entries' });
    res.writeHead(500, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({ error: 'Failed to retrieve site entries from database' }));
  }
}

// Create a new site entry with an initial cadence schedule.
export async function handlePostEntry(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    // Check IP rate limit (max 20 entries per day per IP).
    const clientIp = getClientIp(req);
    const rateCheck = checkIpRateLimit(clientIp);

    if (!rateCheck.allowed) {
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Retry-After': String(rateCheck.retryAfterSeconds),
        'X-RateLimit-Limit': String(DAILY_ENTRY_LIMIT),
        'X-RateLimit-Remaining': '0',
      });
      res.end(
        JSON.stringify({
          error:
            'You have exceeded your allowed entry adds for today (maximum 20 entries per day). Please try again tomorrow.',
          retryAfter: rateCheck.retryAfterSeconds,
        })
      );
      return;
    }

    const body = await parseJsonBody<CreateSiteEntryRequest>(req);

    if (!body.website_url) {
      res.writeHead(400, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify({ error: 'website_url is required' }));
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

    res.writeHead(201, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'X-RateLimit-Limit': String(DAILY_ENTRY_LIMIT),
      'X-RateLimit-Remaining': String(Math.max(0, rateCheck.remaining - 1)),
    });
    res.end(JSON.stringify(formatEntryStorageUrls(entry)));
  } catch (error) {
    logError(error, { endpoint: 'POST /entries' });
    res.writeHead(500, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({ error: 'Failed to create site entry' }));
  }
}
