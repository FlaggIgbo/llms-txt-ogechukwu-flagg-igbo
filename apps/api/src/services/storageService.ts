// Handles URLs for Cloudflare R2 and MinIO S3 storage.
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

      if (publicBase) {
        const cleanBase = publicBase.endsWith('/') ? publicBase.slice(0, -1) : publicBase;
        if (cleanBase.endsWith(`/${bucket}`)) {
          return `${cleanBase}/${key}`;
        }
        return `${cleanBase}/${bucket}/${key}`;
      }

      const s3Endpoint = process.env.S3_ENDPOINT || (isMinio ? 'http://localhost:9000' : undefined);
      if (s3Endpoint) {
        const cleanEndpoint = s3Endpoint.endsWith('/') ? s3Endpoint.slice(0, -1) : s3Endpoint;
        return `${cleanEndpoint}/${bucket}/${key}`;
      }

      if (!isMinio) {
        const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
        if (accountId) {
          return `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;
        }
      }

      return storageUri;
    }

    // Fallback to API gateway /storage redirect route.
    const apiPort = process.env.PORT || process.env.API_PORT || '4000';
    const apiBase = process.env.VITE_API_BASE_URL || `http://localhost:${apiPort}`;
    const cleanApiBase = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
    const cleanPath = storageUri.startsWith('/') ? storageUri.slice(1) : storageUri;
    return `${cleanApiBase}/storage/${cleanPath}`;
  }
}

export const storageService = new StorageService();
