import type { ScrapedPage } from './scraper.js';

// Generated llms.txt file contents.
export interface GeneratedLlmsFiles {
  llmsTxt: string;
  llmsFullTxt: string;
}

// Build llms.txt and llms-full.txt from scraped page data.
export function generateLlmsTxtFiles(_scraped: ScrapedPage): GeneratedLlmsFiles {
  throw new Error('Not implemented');
}
