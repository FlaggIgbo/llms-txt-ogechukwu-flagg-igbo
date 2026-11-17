import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

// Handles URLs for Cloudflare R2 and MinIO S3 storage.
export class StorageService {
  // Convert a storage path to a download URL.
  getDownloadUrl(storageUri: string | null): string | null {
    if (!storageUri) {
      return null;
    }

    const apiPort = process.env.PORT || process.env.API_PORT || '4000';
    const apiBase =
      process.env.RENDER_EXTERNAL_URL ||
      process.env.VITE_API_BASE_URL ||
      `http://localhost:${apiPort}`;
    const cleanApiBase = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;

    // Convert private r2.cloudflarestorage.com endpoints to API gateway storage URLs
    if (storageUri.includes('r2.cloudflarestorage.com')) {
      try {
        const parsed = new URL(storageUri);
        const pathSegments = parsed.pathname.replace(/^\/+/, '').split('/');
        // Format is /bucket/folder/llms.txt
        const key = pathSegments.slice(1).join('/');
        return `${cleanApiBase}/storage/${key}`;
      } catch {
        // fallback
      }
    }

    // Return direct external web links (e.g. https://docs.langchain.com/llms.txt) as is.
    if (storageUri.startsWith('http://') || storageUri.startsWith('https://')) {
      return storageUri;
    }

    // Handle Cloudflare R2 / MinIO / S3 paths (r2://bucket/key or s3://bucket/key).
    if (storageUri.startsWith('r2://') || storageUri.startsWith('s3://')) {
      const isMinio = (process.env.STORAGE_PROVIDER || 'minio').trim().toLowerCase() === 'minio';
      const publicBase = isMinio
        ? process.env.S3_PUBLIC_URL
        : (process.env.R2_PUBLIC_URL || process.env.S3_PUBLIC_URL);
      const pathWithoutPrefix = storageUri.replace(/^(r2|s3):\/\//, '');
      const parts = pathWithoutPrefix.split('/');
      const bucket = parts[0];
      const key = parts.slice(1).join('/');

      // Only use publicBase if it is a genuine public CDN domain, not the private SigV4 endpoint
      if (publicBase && !publicBase.includes('r2.cloudflarestorage.com')) {
        const cleanBase = publicBase.endsWith('/') ? publicBase.slice(0, -1) : publicBase;
        if (cleanBase.endsWith(`/${bucket}`)) {
          return `${cleanBase}/${key}`;
        }
        return `${cleanBase}/${bucket}/${key}`;
      }

      if (isMinio) {
        const s3Endpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
        const cleanEndpoint = s3Endpoint.endsWith('/') ? s3Endpoint.slice(0, -1) : s3Endpoint;
        return `${cleanEndpoint}/${bucket}/${key}`;
      }

      // Default: serve via API gateway /storage/ route
      return `${cleanApiBase}/storage/${key}`;
    }

    const cleanPath = storageUri.startsWith('/') ? storageUri.slice(1) : storageUri;
    return `${cleanApiBase}/storage/${cleanPath}`;
  }

  // Fetch file content from Cloudflare R2, MinIO, or local disk.
  async fetchFile(keyPath: string): Promise<string | null> {
    const isMinio = (process.env.STORAGE_PROVIDER || 'minio').trim().toLowerCase() === 'minio';

    if (isMinio) {
      const endpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
      const bucket = process.env.R2_LLMS_TXT_BUCKET || 'llmstxt-files-bucket';
      const cleanEndpoint = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
      try {
        const res = await fetch(`${cleanEndpoint}/${bucket}/${keyPath.replace(/^\/+/, '')}`);
        if (res.ok) {
          return await res.text();
        }
      } catch {}
    } else {
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || 'e1a9e4e85b017c89fe63a98aced25201';
      const bucket = process.env.R2_LLMS_TXT_BUCKET || 'llmstxt-files-bucket';
      const accessKeyId = process.env.R2_ACCESS_KEY_ID || '22ed9cdca0f33a2c349cb2695de0dd50';
      const secretAccessKey =
        process.env.R2_SECRET_ACCESS_KEY ||
        '99977fb34722e19788056149382a0f835c1bb3735a805044668b944709f54356';

      if (accountId && accessKeyId && secretAccessKey) {
        try {
          const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
          const text = await this.fetchFromR2({
            endpoint,
            bucket,
            key: keyPath.replace(/^\/+/, ''),
            accessKeyId,
            secretAccessKey,
          });
          if (text !== null) {
            return text;
          }
        } catch {}
      }
    }

    // Local disk fallback
    const baseDir = path.resolve(process.env.LOCAL_STORAGE_DIR || './data/storage');
    const localPath = path.join(baseDir, keyPath);
    try {
      return await fs.readFile(localPath, 'utf-8');
    } catch {
      return null;
    }
  }

  private async fetchFromR2(opts: {
    endpoint: string;
    bucket: string;
    key: string;
    accessKeyId: string;
    secretAccessKey: string;
  }): Promise<string | null> {
    const { endpoint, bucket, key, accessKeyId, secretAccessKey } = opts;
    const { host, protocol } = new URL(endpoint);
    const service = 's3';
    const algorithm = 'AWS4-HMAC-SHA256';

    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const canonicalUri = `/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const payloadHash = crypto.createHash('sha256').update('').digest('hex');

    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const canonicalRequest = ['GET', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

    const credentialScope = `${dateStamp}/auto/${service}/aws4_request`;
    const stringToSign = [
      algorithm,
      amzDate,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const hmac = (k: string | Buffer, d: string) => crypto.createHmac('sha256', k).update(d).digest();
    const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
    const kRegion = hmac(kDate, 'auto');
    const kService = hmac(kRegion, service);
    const kSigning = hmac(kService, 'aws4_request');
    const signature = hmac(kSigning, stringToSign).toString('hex');

    const res = await fetch(`${protocol}//${host}${canonicalUri}`, {
      method: 'GET',
      headers: {
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        Authorization: `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return null;
    }
    return await res.text();
  }
}

export const storageService = new StorageService();
