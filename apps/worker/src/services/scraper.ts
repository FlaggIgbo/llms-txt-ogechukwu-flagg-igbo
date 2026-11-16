export interface ScrapedPage {
  url: string;
  title: string;
  description: string;
  links: Array<{ title: string; href: string }>;
  textContent: string;
}

export async function scrapeWebsite(_websiteUrl: string): Promise<ScrapedPage> {
  throw new Error('Not implemented');
}
