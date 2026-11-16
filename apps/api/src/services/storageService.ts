import path from 'node:path';

// Handles URLs for Cloudflare R2 and local storage.
export class StorageService {
  // Convert a storage path to a download URL.
  getDownloadUrl(storageUri: string | null): string | null {
    if (!storageUri) {
      return null;
    }

    // Return web links as is.
    if (storageUri.startsWith('http://') || storageUri.startsWith('https://')) {
      return storageUri;
    }

    // Handle Cloudflare R2 paths (r2://bucket/key).
    if (storageUri.startsWith('r2://')) {
      const publicBase = process.env.R2_PUBLIC_URL;
      const pathWithoutPrefix = storageUri.slice(5);
      const parts = pathWithoutPrefix.split('/');
      const key = parts.slice(1).join('/');

      if (publicBase) {
        const cleanBase = publicBase.endsWith('/') ? publicBase.slice(0, -1) : publicBase;
        return `${cleanBase}/${key}`;
      }

      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      const bucket = parts[0];
      if (accountId) {
        return `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;
      }

      return storageUri;
    }

    // Default API base URL for local development.
    const apiPort = process.env.API_PORT || '4000';
    const apiBase = process.env.VITE_API_BASE_URL || `http://localhost:${apiPort}`;
    const cleanApiBase = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;

    // Handle local file paths (file:///path).
    if (storageUri.startsWith('file://')) {
      const baseDir = path.resolve(process.env.LOCAL_STORAGE_DIR || './data/storage');
      const localFilePath = storageUri.slice(7);
      const relativePath = path.relative(baseDir, localFilePath);
      const cleanRel = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
      return `${cleanApiBase}/storage/${cleanRel}`;
    }

    // Handle relative local paths.
    const cleanPath = storageUri.startsWith('/') ? storageUri.slice(1) : storageUri;
    return `${cleanApiBase}/storage/${cleanPath}`;
  }
}

export const storageService = new StorageService();
