import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { searchService } from '../services/searchService.js';

export async function handleSearch(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/search', 'http://localhost');
  const q = url.searchParams.get('q') ?? '';
  const limit = Number(url.searchParams.get('limit') ?? 50);
  const offset = Number(url.searchParams.get('offset') ?? 0);

  const result = await searchService.searchEntries({ q, limit, offset });
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result));
}
