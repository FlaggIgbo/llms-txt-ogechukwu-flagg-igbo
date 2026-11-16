import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { handleGetEntries, handlePostEntry } from './routes/entries.js';
import { handleSearch } from './routes/search.js';
import { initSentry, logInfo } from './services/logger.js';

initSentry();

const PORT = Number(process.env.PORT || process.env.API_PORT || 4000);

// Start the HTTP server.
export function startApiServer(port: number = PORT): void {
  const server = http.createServer(async (req, res) => {
    // Set CORS headers.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests.
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Get path without query string.
    const rawUrl = req.url || '/';
    const pathname = rawUrl.split('?')[0];

    // Route requests.
    if (pathname === '/entries' && req.method === 'GET') {
      return handleGetEntries(req, res);
    }
    if (pathname === '/entries' && req.method === 'POST') {
      return handlePostEntry(req, res);
    }
    if (pathname === '/search' && req.method === 'GET') {
      return handleSearch(req, res);
    }

    // Serve local files in development.
    if (pathname.startsWith('/storage/') && req.method === 'GET') {
      const relPath = pathname.slice('/storage/'.length);
      const storageDir = path.resolve(process.env.LOCAL_STORAGE_DIR || './data/storage');
      const safePath = path.normalize(path.join(storageDir, relPath));

      // Block paths outside the storage folder.
      if (!safePath.startsWith(storageDir)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden' }));
        return;
      }

      // Send file contents.
      try {
        const content = await fs.readFile(safePath, 'utf-8');
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(content);
        return;
      } catch {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'File not found' }));
        return;
      }
    }

    // Default health check response.
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'api-gateway' }));
  });

  server.listen(port, () => {
    logInfo(`[API Gateway] Listening on http://localhost:${port}`);
  });
}

startApiServer();
