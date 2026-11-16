// Handles S3 file URLs.
export class StorageService {
  // Convert an S3 URI to a download URL.
  getDownloadUrl(_s3Uri: string | null): string | null {
    throw new Error('Not implemented');
  }
}

export const storageService = new StorageService();
