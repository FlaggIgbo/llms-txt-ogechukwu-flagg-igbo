import type { ScrapedPage } from './scraper.js';

export interface GeneratedLlmsFiles {
  llmsTxt: string;
  llmsFullTxt: string;
}

export function generateLlmsTxtFiles(_scraped: ScrapedPage): GeneratedLlmsFiles {
  throw new Error('Not implemented');
}
