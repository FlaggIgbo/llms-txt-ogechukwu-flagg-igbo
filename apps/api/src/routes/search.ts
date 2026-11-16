import type { IncomingMessage, ServerResponse } from 'node:http';
import { searchService } from '../services/searchService.js';
import { logError } from '../services/logger.js';
import { formatEntryStorageUrls } from './entries.js';

// Search entries using URL query parameters.
export async function handleSearch(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const q = url.searchParams.get('q') || '';
    const limit = Number(url.searchParams.get('limit') || '50');
    const offset = Number(url.searchParams.get('offset') || '0');

    const result = await searchService.searchEntries({ q, limit, offset });
    const formattedResult = {
      ...result,
      entries: result.entries.map(formatEntryStorageUrls),
    };

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(formattedResult));
  } catch (error) {
    logError(error, { endpoint: 'GET /search' });
    res.writeHead(500, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({ error: 'Search failed', entries: [], total: 0 }));
  }
}
