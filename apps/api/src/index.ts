import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '@llmstxt/database';
import { ApiErrorCode, ApiErrorMessage } from '@llmstxt/shared-types';
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

    // Serve stored .txt files from MinIO/S3 cluster, local disk, or PostgreSQL storage_files fallback.
    if (pathname.startsWith('/storage/') && req.method === 'GET') {
      const relPath = pathname.slice('/storage/'.length);

      // If MinIO / S3 cluster is configured, redirect directly to S3 / MinIO
      const s3Base = process.env.S3_PUBLIC_URL || process.env.R2_PUBLIC_URL || process.env.S3_ENDPOINT;
      const s3Bucket = process.env.R2_LLMS_TXT_BUCKET || process.env.S3_BUCKET || 'llmstxt-files-bucket';
      if (s3Base) {
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

      const storageDir = path.resolve(process.env.LOCAL_STORAGE_DIR || './data/storage');
      const safePath = path.normalize(path.join(storageDir, relPath));

      // Block paths outside the storage folder.
      if (!safePath.startsWith(storageDir)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: ApiErrorMessage.FORBIDDEN,
            code: ApiErrorCode.FORBIDDEN,
          })
        );
        return;
      }

      // Send file contents from local disk first, falling back to PostgreSQL storage_files.
      try {
        const content = await fs.readFile(safePath, 'utf-8');
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(content);
        return;
      } catch {
        try {
          const dbContent = await db.getStorageFile(relPath);
          if (dbContent !== null) {
            res.writeHead(200, {
              'Content-Type': 'text/plain; charset=utf-8',
              'Access-Control-Allow-Origin': '*',
            });
            res.end(dbContent);
            return;
          }

          // File truly does not exist
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: ApiErrorMessage.NOT_FOUND,
              code: ApiErrorCode.NOT_FOUND,
            })
          );
          return;
        } catch {
          // Database failure occurred while fetching storage file
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: ApiErrorMessage.INTERNAL_ERROR,
              code: ApiErrorCode.DATABASE_ERROR,
            })
          );
          return;
        }
      }
    }

    // Default health check response.
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'api-gateway' }));
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
      .catch(() => {});
  });
}

startApiServer();
