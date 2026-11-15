import type { IncomingMessage, ServerResponse } from 'node:http';
import { db } from '@llmstxt/database';
import { generationQueue } from '@llmstxt/queue';
import type { CreateSiteEntryRequest } from '@llmstxt/shared-types';
import { storageService } from '../services/storageService.js';

export async function handleGetEntries(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const entries = await db.listEntries();
  const enriched = entries.map((e) => ({
    ...e,
    llms_txt_download_url: storageService.getDownloadUrl(e.llms_txt_storage),
    llms_full_txt_download_url: storageService.getDownloadUrl(e.llms_full_txt_storage),
  }));
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ entries: enriched }));
}

export async function handlePostEntry(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
  }

  let payload: CreateSiteEntryRequest;
  try {
    payload = JSON.parse(body) as CreateSiteEntryRequest;
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
    return;
  }

  if (!payload.website_url || !payload.website_url.startsWith('http')) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'A valid website_url starting with http/https is required' }));
    return;
  }

  const entry = await db.createEntry(payload);
  const { jobId } = await generationQueue.enqueueGenerateJob({
    entryId: entry.id,
    websiteUrl: entry.website_url,
  });

  res.writeHead(202, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ entry, jobId, message: 'Entry queued for llms.txt generation' }));
}
