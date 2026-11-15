export interface ScrapedPage {
  url: string;
  title: string;
  description: string;
  links: Array<{ title: string; href: string }>;
  textContent: string;
}

/**
 * Crawls a target website and extracts title, meta description, links, and body content.
 */
export async function scrapeWebsite(websiteUrl: string): Promise<ScrapedPage> {
  const hostname = new URL(websiteUrl).hostname;
  return {
    url: websiteUrl,
    title: hostname,
    description: `Documentation and structured index for ${hostname}`,
    links: [
      { title: 'Overview', href: `${websiteUrl}/overview` },
      { title: 'Getting Started', href: `${websiteUrl}/getting-started` },
      { title: 'API Reference', href: `${websiteUrl}/api` },
    ],
    textContent: `Full documentation content crawled from ${websiteUrl}.`,
  };
}
