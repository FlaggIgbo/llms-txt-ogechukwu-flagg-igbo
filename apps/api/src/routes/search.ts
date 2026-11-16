import type { IncomingMessage, ServerResponse } from 'node:http';

export async function handleSearch(_req: IncomingMessage, _res: ServerResponse): Promise<void> {
  throw new Error('Not implemented');
}
