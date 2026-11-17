import http from 'node:http';
import path from 'node:path';
import { ApiErrorCode, ApiErrorMessage } from '@llmstxt/shared-types';
import { handleGetEntries, handlePostEntry } from './routes/entries.js';
import { handleSearch } from './routes/search.js';
import { storageService } from './services/storageService.js';
import { initSentry, logInfo, logError } from './services/logger.js';

initSentry();

process.on('unhandledRejection', (reason) => {
  logError(reason, { source: 'unhandledRejection' });
});

process.on('uncaughtException', (error) => {
  logError(error, { source: 'uncaughtException' });
});

const PORT = Number(process.env.PORT || process.env.API_PORT || 4000);

// Start the HTTP server.
export function startApiServer(port: number = PORT): void {
  const server = http.createServer(async (req, res) => {
    try {
      // Set CORS headers.
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      // Handle the permission check for a  browser.
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
      if ((pathname === '/queue/bounce' || pathname === '/bounce') && (req.method === 'POST' || req.method === 'GET')) {
        const { generationQueue } = await import('@llmstxt/queue');
        await generationQueue.bounceQueue();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', message: 'Queue bounced successfully. Dead letter jobs cleared and failed entries re-enqueued.' }));
        return;
      }

      // Serve stored .txt files via Cloudflare R2 / S3 redirect.
      if (pathname.startsWith('/storage/') && req.method === 'GET') {
        const relPath = pathname.slice('/storage/'.length);

        // Block paths with directory traversal or absolute paths.
        if (relPath.includes('..') || path.isAbsolute(relPath)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: ApiErrorMessage.FORBIDDEN,
              code: ApiErrorCode.FORBIDDEN,
            })
          );
          return;
        }

        // Direct legacy / stale plaid.com_docs storage requests to official Plaid docs
        if (relPath.startsWith('plaid.com_docs/')) {
          const subPath = relPath.slice('plaid.com_docs/'.length);
          const target = subPath === 'llms-full.txt'
            ? 'https://plaid.com/docs/llms-full.txt'
            : 'https://plaid.com/docs/llms.txt';
          res.writeHead(301, {
            Location: target,
            'Access-Control-Allow-Origin': '*',
          });
          res.end();
          return;
        }

        // If Cloudflare R2 / MinIO / S3 is configured with a public CDN, redirect
        const isMinio = (process.env.STORAGE_PROVIDER || 'minio').trim().toLowerCase() === 'minio';
        const s3Base = isMinio
          ? (process.env.S3_PUBLIC_URL || process.env.S3_ENDPOINT || 'http://localhost:9000')
          : (process.env.R2_PUBLIC_URL || process.env.S3_PUBLIC_URL);
        const s3Bucket = process.env.R2_LLMS_TXT_BUCKET || 'llmstxt-files-bucket';

        if (s3Base && !s3Base.includes('r2.cloudflarestorage.com')) {
          const cleanBase = s3Base.endsWith('/') ? s3Base.slice(0, -1) : s3Base;
          const targetUrl = cleanBase.endsWith(`/${s3Bucket}`)
            ? `${cleanBase}/${relPath}`
            : `${cleanBase}/${s3Bucket}/${relPath}`;
          res.writeHead(302, {
            Location: targetUrl,
            'Access-Control-Allow-Origin': '*',
          });
          res.end();
          return;
        }

        // Otherwise proxy and serve the file directly
        try {
          const fileContent = await storageService.fetchFile(relPath);
          if (fileContent !== null) {
            res.writeHead(200, {
              'Content-Type': 'text/plain; charset=utf-8',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=3600',
            });
            res.end(fileContent);
            return;
          }
        } catch (fetchErr) {
          logError(fetchErr, { path: relPath, context: 'StorageProxy' });
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: ApiErrorMessage.NOT_FOUND,
            code: ApiErrorCode.NOT_FOUND,
          })
        );
        return;
      }

      // Default health check response.
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'api-gateway' }));
    } catch (unhandledError) {
      logError(unhandledError, {
        url: req.url,
        method: req.method,
        source: 'unhandled_api_request',
      });
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: ApiErrorMessage.CREATE_ENTRY_FAILED,
            code: ApiErrorCode.INTERNAL_ERROR,
          })
        );
      }
    }
  });

  server.listen(port, () => {
    logInfo(`[API Gateway] Listening on http://localhost:${port}`);
    // Ensure background queue polling is active so queued jobs are processed even if worker container is building/restarting.
    const workerModulePath = '../../worker/src/index.js';
    void import(workerModulePath)
      .then((m) => {
        if (typeof m.startWorker === 'function') {
          m.startWorker();
        }
      })
      .catch(() => { });
  });
}

startApiServer();
