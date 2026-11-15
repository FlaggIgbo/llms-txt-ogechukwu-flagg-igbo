import http from 'node:http';
import { handleGetEntries, handlePostEntry } from './routes/entries.js';
import { handleSearch } from './routes/search.js';

const PORT = Number(process.env.API_PORT ?? 4000);

const server = http.createServer(async (req, res) => {
  // CORS headers for React frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const pathname = (req.url ?? '/').split('?')[0];

  try {
    if (pathname === '/entries' && req.method === 'GET') {
      await handleGetEntries(req, res);
      return;
    }
    if (pathname === '/entries' && req.method === 'POST') {
      await handlePostEntry(req, res);
      return;
    }
    if (pathname === '/search' && req.method === 'GET') {
      await handleSearch(req, res);
      return;
    }
    if (pathname === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'api-gateway' }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  } catch (err) {
    console.error('[API Gateway] Unhandled error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal Server Error' }));
  }
});

server.listen(PORT, () => {
  console.log(`[API Gateway] Listening on http://localhost:${PORT}`);
});
