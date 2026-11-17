import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { logWarn } from '@llmstxt/logger';
import { assertValidLlmsFiles } from './llmsValidator.js';

// Upload results with storage paths.
export interface UploadResult {
  llmsTxtUri: string;
  llmsFullTxtUri: string;
}

// Everything needed to talk to an R2 bucket.
export interface R2Config {
  endpoint: string; // e.g. https://<accountId>.r2.cloudflarestorage.com
  region: string; // "auto" for Cloudflare R2
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export type StorageConfig = { kind: 'local' } | ({ kind: 'r2' } & R2Config);

const MAX_FOLDER_NAME_LENGTH = 200;
const PUT_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const hmacSha256 = (key: string | Buffer, data: string): Buffer =>
  crypto.createHmac('sha256', key).update(data, 'utf8').digest();

const sha256Hex = (data: string): string =>
  crypto.createHash('sha256').update(data, 'utf8').digest('hex');

// Convert a website URL into a safe folder name.
export function cleanUrlForFolder(url: string): string {
  const name = url
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .replace(/[^a-zA-Z0-9.-]/g, '_');

  // Never produce "", "." or ".." (path traversal out of the storage dir).
  if (!name || /^\.+$/.test(name)) return `_${name || 'site'}`;

  // Keep well under the 255-character filename limit.
  if (name.length > MAX_FOLDER_NAME_LENGTH) {
    return `${name.slice(0, MAX_FOLDER_NAME_LENGTH - 9)}-${sha256Hex(name).slice(0, 8)}`;
  }
  return name;
}

// RFC 3986 percent-encoding of each path segment, as SigV4 requires.
const encodeObjectKey = (key: string): string =>
  key
    .split('/')
    .map((segment) =>
      encodeURIComponent(segment).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    )
    .join('/');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Read storage settings from the environment once. Pure apart from the `env`
// argument, so it can be tested without touching process.env.
//
//   STORAGE_PROVIDER      "local" (default) or "r2"
//   CLOUDFLARE_ACCOUNT_ID used to build the R2 endpoint
//   R2_ENDPOINT           optional endpoint override (e.g. a local emulator)
//   R2_REGION             optional, defaults to "auto"
//   R2_LLMS_TXT_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
export function resolveStorageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const provider = (env.STORAGE_PROVIDER || 'local').trim().toLowerCase();
  if (provider === 'local') return { kind: 'local' };
  if (provider !== 'r2') {
    throw new Error(`Unsupported STORAGE_PROVIDER "${provider}" (expected "local" or "r2")`);
  }

  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const endpoint =
    env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
  const bucket = env.R2_LLMS_TXT_BUCKET;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;

  const missing: string[] = [];
  if (!endpoint) missing.push('CLOUDFLARE_ACCOUNT_ID (or R2_ENDPOINT)');
  if (!bucket) missing.push('R2_LLMS_TXT_BUCKET');
  if (!accessKeyId) missing.push('R2_ACCESS_KEY_ID');
  if (!secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(`STORAGE_PROVIDER=r2 but missing configuration: ${missing.join(', ')}`);
  }

  return {
    kind: 'r2',
    endpoint,
    region: env.R2_REGION || 'auto',
    bucket,
    accessKeyId,
    secretAccessKey,
  };
}

// ---------------------------------------------------------------------------
// R2 upload (AWS Signature Version 4 over the S3-compatible API)
// ---------------------------------------------------------------------------

// Upload a single text object. Throws on any failure.
export async function putObject(config: R2Config, key: string, body: string): Promise<void> {
  const { host, protocol } = new URL(config.endpoint);
  const service = 's3';
  const algorithm = 'AWS4-HMAC-SHA256';
  const contentType = 'text/plain; charset=utf-8';

  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const canonicalUri = `/${config.bucket}/${encodeObjectKey(key.replace(/^\/+/, ''))}`;
  const payloadHash = sha256Hex(body);

  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalHeaders =
    [
      `content-type:${contentType}`,
      `host:${host}`,
      `x-amz-content-sha256:${payloadHash}`,
      `x-amz-date:${amzDate}`,
    ].join('\n') + '\n';

  const canonicalRequest = ['PUT', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const credentialScope = `${dateStamp}/${config.region}/${service}/aws4_request`;
  const stringToSign = [algorithm, amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');

  const kDate = hmacSha256(`AWS4${config.secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, config.region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = hmacSha256(kSigning, stringToSign).toString('hex');

  const res = await fetch(`${protocol}//${host}${canonicalUri}`, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: `${algorithm} Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body,
    signal: AbortSignal.timeout(PUT_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`R2 PUT failed (${res.status}) for ${canonicalUri}: ${errText.slice(0, 500)}`);
  }
}

// ---------------------------------------------------------------------------
// Local disk
// ---------------------------------------------------------------------------

// Write to a temp file then rename, so readers never see a half-written file.
async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tmpPath, content, 'utf-8');
    await fs.rename(tmpPath, filePath);
  } catch (err) {
    await fs.rm(tmpPath, { force: true }).catch(() => { });
    throw err;
  }
}

async function writeLocalFiles(
  folderName: string,
  llmsTxt: string,
  llmsFullTxt: string
): Promise<{ llmsTxtPath: string; llmsFullTxtPath: string }> {
  const baseDir = path.resolve(process.env.LOCAL_STORAGE_DIR || './data/storage');
  const targetDir = path.join(baseDir, folderName);
  const llmsTxtPath = path.join(targetDir, 'llms.txt');
  const llmsFullTxtPath = path.join(targetDir, 'llms-full.txt');

  await fs.mkdir(targetDir, { recursive: true });
  await Promise.all([
    writeFileAtomic(llmsTxtPath, llmsTxt),
    writeFileAtomic(llmsFullTxtPath, llmsFullTxt),
  ]);

  return { llmsTxtPath, llmsFullTxtPath };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

// Save the generated files to the configured storage provider.
// With STORAGE_PROVIDER=r2, any configuration or upload failure throws; there
// is no silent fallback to local disk.
export async function uploadToStorage(
  websiteUrl: string,
  llmsTxt: string,
  llmsFullTxt: string
): Promise<UploadResult> {
  // Validate contents against the llms.txt standard before writing anywhere.
  assertValidLlmsFiles(llmsTxt, llmsFullTxt);

  // Fail fast on misconfiguration, before any writes.
  const config = resolveStorageConfig();
  const folderName = cleanUrlForFolder(websiteUrl);

  if (config.kind === 'local') {
    const { llmsTxtPath, llmsFullTxtPath } = await writeLocalFiles(folderName, llmsTxt, llmsFullTxt);
    return {
      llmsTxtUri: pathToFileURL(llmsTxtPath).href,
      llmsFullTxtUri: pathToFileURL(llmsFullTxtPath).href,
    };
  }

  const txtKey = `${folderName}/llms.txt`;
  const fullTxtKey = `${folderName}/llms-full.txt`;

  // Upload the full file first and the index last, so a partial failure never
  // leaves an llms.txt pointing at content that was not uploaded.
  await putObject(config, fullTxtKey, llmsFullTxt);
  await putObject(config, txtKey, llmsTxt);

  // The local mirror is a convenience when R2 is the source of truth.
  await writeLocalFiles(folderName, llmsTxt, llmsFullTxt).catch((err) =>
    logWarn('[StorageUpload] Local mirror write failed (R2 upload succeeded):', err)
  );

  return {
    llmsTxtUri: `r2://${config.bucket}/${txtKey}`,
    llmsFullTxtUri: `r2://${config.bucket}/${fullTxtKey}`,
  };
}

/** @deprecated Misleading name: this also handles local storage. Use `uploadToStorage`. */
export const uploadToR2 = uploadToStorage;
