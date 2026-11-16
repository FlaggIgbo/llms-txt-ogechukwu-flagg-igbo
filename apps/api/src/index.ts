import http from 'node:http';
import * as Sentry from '@sentry/node';
import { handleGetEntries, handlePostEntry } from './routes/entries.js';
import { handleSearch } from './routes/search.js';
import { initSentry, logInfo } from './services/logger.js';

initSentry();

const PORT = Number(process.env.API_PORT ?? 4000);

export function startApiServer(port: number = PORT): void {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const pathname = (req.url ?? '/').split('?')[0];

    if (pathname === '/entries' && req.method === 'GET') {
      return handleGetEntries(req, res);
    }
    if (pathname === '/entries' && req.method === 'POST') {
      return handlePostEntry(req, res);
    }
    if (pathname === '/search' && req.method === 'GET') {
      return handleSearch(req, res);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'api-gateway' }));
  });

  server.listen(port, () => {
    logInfo(`[API Gateway] Listening on http://localhost:${port}`);
  });
}

startApiServer();
