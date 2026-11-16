import type { IncomingMessage, ServerResponse } from 'node:http';
import { db } from '@llmstxt/database';
import { generationQueue } from '@llmstxt/queue';
import type { SiteEntry, CreateSiteEntryRequest } from '@llmstxt/shared-types';
import { logError } from '../services/logger.js';
import { storageService } from '../services/storageService.js';

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

// Return all directory entries.
export async function handleGetEntries(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const entries = await db.listEntries();
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

    // Queue initial background crawl and generation job.
    await generationQueue.enqueueGenerateJob({
      entryId: entry.id,
      websiteUrl: entry.website_url,
      isScheduledUpdate: false,
    });

    res.writeHead(201, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
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
