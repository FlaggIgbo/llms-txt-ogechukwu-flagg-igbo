import type { IncomingMessage, ServerResponse } from 'node:http';
import { db } from '@llmstxt/database';

export async function handleGetEntries(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const entries = await db.listEntries();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(entries));
  } catch (error) {
    console.error('[API Gateway] handleGetEntries error:', error);
    res.writeHead(500, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({ error: 'Failed to retrieve site entries from database' }));
  }
}

export async function handlePostEntry(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.writeHead(501, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify({ error: 'Not implemented' }));
}
