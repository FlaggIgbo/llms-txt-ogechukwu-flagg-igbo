export interface UploadResult {
  llmsTxtUri: string;
  llmsFullTxtUri: string;
}

export async function uploadToS3(
  _websiteUrl: string,
  _llmsTxt: string,
  _llmsFullTxt: string
): Promise<UploadResult> {
  throw new Error('Not implemented');
}
