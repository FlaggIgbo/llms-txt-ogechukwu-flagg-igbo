export class StorageService {
  getDownloadUrl(_s3Uri: string | null): string | null {
    throw new Error('Not implemented');
  }
}

export const storageService = new StorageService();
