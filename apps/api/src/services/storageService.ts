/**
 * S3 Storage Service for generating presigned URLs or retrieving llms.txt files
 */
export class StorageService {
  private readonly bucket = process.env.S3_LLMS_TXT_BUCKET ?? 'llmstxt-files-bucket';
  private readonly endpoint = process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4566';

  getDownloadUrl(s3Uri: string | null): string | null {
    if (!s3Uri) return null;
    const key = s3Uri.replace(`s3://${this.bucket}/`, '');
    return `${this.endpoint}/${this.bucket}/${key}`;
  }
}

export const storageService = new StorageService();
