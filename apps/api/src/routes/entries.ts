import type { IncomingMessage, ServerResponse } from 'node:http';
import { db } from '@llmstxt/database';
import type { SiteEntry } from '@llmstxt/shared-types';
import { logError } from '../services/logger.js';
import { storageService } from '../services/storageService.js';

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

// Placeholder for adding a new entry.
export async function handlePostEntry(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.writeHead(501, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify({ error: 'Not implemented' }));
}
