// Data extracted from a webpage.
export interface ScrapedPage {
  url: string;
  title: string;
  description: string;
  links: Array<{ title: string; href: string }>;
  textContent: string;
}

// Fetch and parse a website.
export async function scrapeWebsite(_websiteUrl: string): Promise<ScrapedPage> {
  throw new Error('Not implemented');
}
