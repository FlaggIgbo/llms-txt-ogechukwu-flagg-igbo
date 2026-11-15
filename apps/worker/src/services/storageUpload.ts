const BUCKET = process.env.S3_LLMS_TXT_BUCKET ?? 'llmstxt-files-bucket';

export interface UploadResult {
  llmsTxtUri: string;
  llmsFullTxtUri: string;
}

/**
 * Uploads generated `llms.txt` and `llms-full.txt` files to the S3 bucket.
 */
export async function uploadToS3(
  websiteUrl: string,
  llmsTxt: string,
  llmsFullTxt: string
): Promise<UploadResult> {
  const hostname = new URL(websiteUrl).hostname;
  const llmsTxtUri = `s3://${BUCKET}/${hostname}/llms.txt`;
  const llmsFullTxtUri = `s3://${BUCKET}/${hostname}/llms-full.txt`;

  console.log(
    `[Worker:S3Upload] Uploaded ${llmsTxt.length}B -> ${llmsTxtUri} and ${llmsFullTxt.length}B -> ${llmsFullTxtUri}`
  );

  return { llmsTxtUri, llmsFullTxtUri };
}
