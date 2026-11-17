import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertValidLlmsFiles } from './llmsValidator.js';

// Upload results with storage paths.
export interface UploadResult {
  llmsTxtUri: string;
  llmsFullTxtUri: string;
}

// Convert a website URL into a safe folder name.
export function cleanUrlForFolder(url: string): string {
  let name = url;
  if (name.startsWith('https://')) name = name.slice(8);
  if (name.startsWith('http://')) name = name.slice(7);
  while (name.endsWith('/')) name = name.slice(0, -1);
  return name.replace(/[^a-zA-Z0-9.-]/g, '_');
}

function hmacSha256(key: string | Buffer, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

// Upload a single text object to Cloudflare R2 or local MinIO/S3 using AWS Signature Version 4.
export async function putObjectToR2(params: {
  accountId?: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  key: string;
  body: string;
  endpoint?: string;
}): Promise<boolean> {
  const { accountId, accessKeyId, secretAccessKey, bucket, key, body } = params;
  const endpoint = params.endpoint || process.env.S3_ENDPOINT;

  let host: string;
  let protocol = 'https:';

  if (endpoint) {
    const parsed = new URL(endpoint);
    host = parsed.host;
    protocol = parsed.protocol;
  } else {
    host = `${accountId || 'local'}.r2.cloudflarestorage.com`;
  }

  const region = endpoint ? (process.env.AWS_REGION || 'us-east-1') : 'auto';
  const service = 's3';

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const canonicalUri = `/${bucket}/${key.replace(/^\/+/, '')}`;
  const payloadHash = sha256Hex(body);
  const contentType = 'text/plain; charset=utf-8';

  const canonicalHeaders = [
    `content-type:${contentType}`,
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ].join('\n') + '\n';

  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = crypto
    .createHmac('sha256', kSigning)
    .update(stringToSign, 'utf8')
    .digest('hex');

  const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const url = `${protocol}//${host}${canonicalUri}`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      Host: host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: authorization,
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`S3/R2 PUT failed (${res.status}) for ${canonicalUri}: ${errText}`);
  }

  return true;
}

// Save files to Cloudflare R2 and local disk.
export async function uploadToStorage(
  websiteUrl: string,
  llmsTxt: string,
  llmsFullTxt: string
): Promise<UploadResult> {
  // Validate file contents and adherence to llms.txt standard before writing to storage.
  assertValidLlmsFiles(llmsTxt, llmsFullTxt);

  const provider = process.env.STORAGE_PROVIDER || 'local';
  const folderName = cleanUrlForFolder(websiteUrl);

  // Always write local mirror on disk.
  const baseDir = path.resolve(process.env.LOCAL_STORAGE_DIR || './data/storage');
  const targetDir = path.join(baseDir, folderName);

  await fs.mkdir(targetDir, { recursive: true });

  const llmsTxtPath = path.join(targetDir, 'llms.txt');
  const llmsFullTxtPath = path.join(targetDir, 'llms-full.txt');

  await fs.writeFile(llmsTxtPath, llmsTxt, 'utf-8');
  await fs.writeFile(llmsFullTxtPath, llmsFullTxt, 'utf-8');

  // Upload to Cloudflare R2 / MinIO via S3 SigV4 PUT if provider is r2/s3/minio or S3_ENDPOINT is set.
  const endpoint = process.env.S3_ENDPOINT || process.env.R2_ENDPOINT;
  const isS3Provider = provider === 'r2' || provider === 's3' || provider === 'minio' || Boolean(endpoint);

  if (isS3Provider) {
    const bucket = process.env.R2_LLMS_TXT_BUCKET || process.env.S3_BUCKET || 'llmstxt-files-bucket';
    const txtKey = `${folderName}/llms.txt`;
    const fullTxtKey = `${folderName}/llms-full.txt`;

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || 'local';
    const accessKeyId =
      process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || (endpoint ? 'minioadmin' : undefined);
    const secretAccessKey =
      process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || (endpoint ? 'minioadmin' : undefined);

    if (accessKeyId && secretAccessKey) {
      try {
        await putObjectToR2({
          accountId,
          accessKeyId,
          secretAccessKey,
          bucket,
          key: txtKey,
          body: llmsTxt,
          endpoint,
        });
        await putObjectToR2({
          accountId,
          accessKeyId,
          secretAccessKey,
          bucket,
          key: fullTxtKey,
          body: llmsFullTxt,
          endpoint,
        });

        const uriScheme = endpoint ? 's3' : 'r2';
        return {
          llmsTxtUri: `${uriScheme}://${bucket}/${txtKey}`,
          llmsFullTxtUri: `${uriScheme}://${bucket}/${fullTxtKey}`,
        };
      } catch (err) {
        // If S3/R2 upload fails in environments where bucket/network isn't reachable, fall back to local/API storage path.
        if (process.env.NODE_ENV !== 'test') {
          console.warn(`[StorageUpload] R2 upload fallback to local storage: ${err}`);
        }
      }
    }
  }

  return {
    llmsTxtUri: `file://${llmsTxtPath}`,
    llmsFullTxtUri: `file://${llmsFullTxtPath}`,
  };
}

// Cloudflare R2 upload alias.
export const uploadToR2 = uploadToStorage;
