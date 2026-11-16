import fs from 'node:fs/promises';
import path from 'node:path';
import { assertValidLlmsFiles } from './llmsValidator.js';

// Upload results with storage paths.
export interface UploadResult {
  llmsTxtUri: string;
  llmsFullTxtUri: string;
}

// Convert a website URL into a safe folder name.
function cleanUrlForFolder(url: string): string {
  let name = url;
  if (name.startsWith('https://')) name = name.slice(8);
  if (name.startsWith('http://')) name = name.slice(7);
  while (name.endsWith('/')) name = name.slice(0, -1);
  return name.replace(/[^a-zA-Z0-9.-]/g, '_');
}

// Save files to Cloudflare R2 or local disk.
export async function uploadToStorage(
  websiteUrl: string,
  llmsTxt: string,
  llmsFullTxt: string
): Promise<UploadResult> {
  // Validate file contents and adherence to llms.txt standard before writing to storage.
  assertValidLlmsFiles(llmsTxt, llmsFullTxt);

  const provider = process.env.STORAGE_PROVIDER || 'local';
  const folderName = cleanUrlForFolder(websiteUrl);

  // Return Cloudflare R2 paths if using R2.
  if (provider === 'r2') {
    const bucket = process.env.R2_LLMS_TXT_BUCKET || 'llmstxt-files-bucket';
    const txtKey = `${folderName}/llms.txt`;
    const fullTxtKey = `${folderName}/llms-full.txt`;

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    // Use R2 path when credentials exist.
    if (accountId && accessKeyId && secretAccessKey) {
      return {
        llmsTxtUri: `r2://${bucket}/${txtKey}`,
        llmsFullTxtUri: `r2://${bucket}/${fullTxtKey}`,
      };
    }
  }

  // Save files locally on disk.
  const baseDir = path.resolve(process.env.LOCAL_STORAGE_DIR || './data/storage');
  const targetDir = path.join(baseDir, folderName);

  await fs.mkdir(targetDir, { recursive: true });

  const llmsTxtPath = path.join(targetDir, 'llms.txt');
  const llmsFullTxtPath = path.join(targetDir, 'llms-full.txt');

  await fs.writeFile(llmsTxtPath, llmsTxt, 'utf-8');
  await fs.writeFile(llmsFullTxtPath, llmsFullTxt, 'utf-8');

  return {
    llmsTxtUri: `file://${llmsTxtPath}`,
    llmsFullTxtUri: `file://${llmsFullTxtPath}`,
  };
}

// Cloudflare R2 upload alias.
export const uploadToR2 = uploadToStorage;
