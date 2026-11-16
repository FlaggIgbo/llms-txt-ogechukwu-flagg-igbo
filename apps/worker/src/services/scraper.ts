import { chromium, type Browser } from 'playwright';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { NodeHtmlMarkdown } from 'node-html-markdown';

// An extracted link from a page.
export interface ScrapedLink {
  title: string;
  href: string;
  description?: string;
}

// A subpage fetched during crawling.
export interface ScrapedSubPage {
  url: string;
  title: string;
  description: string;
  markdownContent: string;
}

// Scraped website data.
export interface ScrapedPage {
  url: string;
  title: string;
  description: string;
  links: Array<{ title: string; href: string }>;
  textContent: string;
  markdownContent: string;
  subPages: ScrapedSubPage[];
  officialLlmsTxt?: string;
  officialLlmsFullTxt?: string;
}

// Ensure the URL has https:// or http://.
export function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

// Get the brand name from a domain (e.g. plaid.com -> Plaid).
export function getBrandNameFromUrl(rawUrl: string): string {
  try {
    const parsed = new URL(normalizeUrl(rawUrl));
    const parts = parsed.hostname.split('.');
    if (parts.length >= 2) {
      const main =
        parts.length >= 3 && parts[0].toLowerCase() === 'docs'
          ? parts[1]
          : parts[parts.length - 2];
      return main.charAt(0).toUpperCase() + main.slice(1);
    }
  } catch {
    // Ignore invalid URL.
  }
  return '';
}

// Check if two URLs share the same origin domain.
function isSameOrigin(urlA: string, urlB: string): boolean {
  try {
    return new URL(urlA).origin === new URL(urlB).origin;
  } catch {
    return false;
  }
}

// Check if the site already has an official llms.txt.
export async function checkExistingLlmsTxt(
  websiteUrl: string
): Promise<{ llmsTxt: string; llmsFullTxt?: string } | null> {
  try {
    const parsed = new URL(websiteUrl);
    const candidatePaths: string[] = [];

    // Check subpath first (e.g. /docs/llms.txt), then root (/llms.txt).
    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    if (cleanPath && cleanPath !== '') {
      candidatePaths.push(`${parsed.origin}${cleanPath}/llms.txt`);
    }
    candidatePaths.push(`${parsed.origin}/llms.txt`);

    for (const candidate of candidatePaths) {
      try {
        const res = await fetch(candidate, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          },
        });

        if (res.ok) {
          const text = await res.text();
          if (text && text.trim().startsWith('#')) {
            // Also check for matching llms-full.txt.
            const fullTxtUrl = candidate.replace(/llms\.txt$/, 'llms-full.txt');
            let llmsFullTxt: string | undefined;

            try {
              const fullRes = await fetch(fullTxtUrl);
              if (fullRes.ok) {
                llmsFullTxt = await fullRes.text();
              }
            } catch {
              // Ignore if llms-full.txt does not exist.
            }

            return { llmsTxt: text, llmsFullTxt };
          }
        }
      } catch {
        // Try next candidate path.
      }
    }
  } catch {
    // Ignore invalid URL.
  }
  return null;
}

// Clean raw HTML and convert it to clean Markdown.
function extractArticleAndMarkdown(
  html: string,
  pageUrl: string
): {
  title: string;
  description: string;
  textContent: string;
  markdownContent: string;
} {
  const dom = new JSDOM(html, { url: pageUrl });
  const document = dom.window.document;

  const reader = new Readability(document);
  const article = reader.parse();

  // Look for meta description tag if excerpt is empty.
  const metaDesc =
    document.querySelector('meta[name="description"]')?.getAttribute('content') ||
    document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
    '';

  let rawTitle = (article?.title || document.title || 'Untitled').trim();
  const brand = getBrandNameFromUrl(pageUrl);

  // Replace generic titles like "Home" or "Docs" with brand name.
  const genericTitles = ['home', 'index', 'welcome', 'untitled', 'docs', 'documentation'];
  if (genericTitles.includes(rawTitle.toLowerCase()) && brand) {
    rawTitle = `${brand} Documentation`;
  }

  const description = (article?.excerpt || metaDesc || '').trim();
  const textContent = (article?.textContent || document.body?.textContent || '').trim();

  // Convert cleaned HTML into Markdown.
  const contentHtml = article?.content || document.body?.innerHTML || '';
  const markdownContent = NodeHtmlMarkdown.translate(contentHtml).trim();

  return {
    title: rawTitle,
    description,
    textContent,
    markdownContent,
  };
}

// Collect unique internal documentation links from page navigation.
export function extractInternalLinks(
  html: string,
  baseUrl: string,
  maxLinks: number = 25
): Array<{ title: string; href: string }> {
  const dom = new JSDOM(html, { url: baseUrl });
  const document = dom.window.document;

  const links: Array<{ title: string; href: string }> = [];
  const visitedUrls = new Set<string>();

  // Do not link back to base URL.
  visitedUrls.add(baseUrl);
  visitedUrls.add(baseUrl.replace(/\/+$/, ''));

  // Prioritize sidebar navigation links first.
  const navElements = document.querySelectorAll(
    'nav a, aside a, [role="navigation"] a, [aria-label*="nav"] a, .sidebar a, .menu a'
  );
  const allAnchors =
    navElements.length > 0
      ? Array.from(navElements)
      : Array.from(document.querySelectorAll('a'));

  // Pages to ignore.
  const excludedPatterns = [
    '/login',
    '/signin',
    '/signup',
    '/careers',
    '/terms',
    '/privacy',
    '/contact',
    '/pricing',
  ];

  for (const anchor of allAnchors) {
    if (links.length >= maxLinks) {
      break;
    }

    const rawHref = anchor.getAttribute('href');
    const label = (anchor.textContent || '').replace(/\s+/g, ' ').trim();

    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) {
      continue;
    }

    try {
      const fullUrl = new URL(rawHref, baseUrl).href;
      const cleanUrl = fullUrl.split('#')[0];
      const pathname = new URL(cleanUrl).pathname.toLowerCase();

      const isExcluded = excludedPatterns.some((pattern) => pathname.includes(pattern));

      // Keep only unvisited internal links.
      if (
        isSameOrigin(cleanUrl, baseUrl) &&
        !visitedUrls.has(cleanUrl) &&
        label.length > 1 &&
        !isExcluded
      ) {
        visitedUrls.add(cleanUrl);
        links.push({
          title: label,
          href: cleanUrl,
        });
      }
    } catch {
      // Ignore malformed URL.
    }
  }

  return links;
}

// Fetch and parse a website into structured page data.
export async function scrapeWebsite(rawWebsiteUrl: string): Promise<ScrapedPage> {
  const websiteUrl = normalizeUrl(rawWebsiteUrl);

  // Check if site already has an official llms.txt.
  const officialFiles = await checkExistingLlmsTxt(websiteUrl);

  // Launch headless browser.
  const browser: Browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    // Load main page.
    await page.goto(websiteUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait briefly for client-side JavaScript.
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
      // Ignore networkidle timeout.
    });

    const mainHtml = await page.content();
    const mainExtracted = extractArticleAndMarkdown(mainHtml, websiteUrl);
    const links = extractInternalLinks(mainHtml, websiteUrl, 25);

    // Fetch up to 5 subpages for llms-full.txt.
    const subPages: ScrapedSubPage[] = [];
    const subpagesToFetch = links.slice(0, 5);

    for (const link of subpagesToFetch) {
      try {
        await page.goto(link.href, {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        });

        const subHtml = await page.content();
        const subExtracted = extractArticleAndMarkdown(subHtml, link.href);

        subPages.push({
          url: link.href,
          title: subExtracted.title || link.title,
          description: subExtracted.description,
          markdownContent: subExtracted.markdownContent,
        });
      } catch {
        // Skip failed subpage.
      }
    }

    return {
      url: websiteUrl,
      title: mainExtracted.title,
      description: mainExtracted.description,
      links,
      textContent: mainExtracted.textContent,
      markdownContent: mainExtracted.markdownContent,
      subPages,
      officialLlmsTxt: officialFiles?.llmsTxt,
      officialLlmsFullTxt: officialFiles?.llmsFullTxt,
    };
  } finally {
    await browser.close();
  }
}
