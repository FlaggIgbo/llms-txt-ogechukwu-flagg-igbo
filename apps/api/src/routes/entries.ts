import type { IncomingMessage, ServerResponse } from 'node:http';

export async function handleGetEntries(_req: IncomingMessage, _res: ServerResponse): Promise<void> {
  throw new Error('Not implemented');
}

export async function handlePostEntry(_req: IncomingMessage, _res: ServerResponse): Promise<void> {
  throw new Error('Not implemented');
}
