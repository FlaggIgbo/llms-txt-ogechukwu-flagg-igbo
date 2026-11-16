// S3 storage URIs for uploaded files.
export interface UploadResult {
  llmsTxtUri: string;
  llmsFullTxtUri: string;
}

// Upload generated text files to S3.
export async function uploadToS3(
  _websiteUrl: string,
  _llmsTxt: string,
  _llmsFullTxt: string
): Promise<UploadResult> {
  throw new Error('Not implemented');
}
