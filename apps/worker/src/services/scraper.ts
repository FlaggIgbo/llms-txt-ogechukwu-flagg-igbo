import { chromium, type Browser } from 'playwright';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import { logWarn } from '@llmstxt/logger';

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

// Extract title and description directly from an official llms.txt document.
function parseMetadataFromOfficialLlmsTxt(
  llmsTxt: string,
  fallbackUrl: string
): { title: string; description: string } {
  const lines = llmsTxt.split(/\r?\n/);
  let title = '';
  let description = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!title && trimmed.startsWith('# ')) {
      title = trimmed.slice(2).trim();
    } else if (!description && trimmed.startsWith('>')) {
      description = trimmed.replace(/^>+\s*/, '').trim();
    }
    if (title && description) break;
  }
  const brand = getBrandNameFromUrl(fallbackUrl);
  return {
    title: title || (brand ? `${brand} Documentation` : 'Documentation'),
    description:
      description || `Official technical documentation and guides for ${title || brand || fallbackUrl}.`,
  };
}

// Fetch raw HTML using standard HTTP fetch when headless Chromium is unavailable.
async function fetchHtmlWithTimeout(url: string, timeoutMs: number = 15000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${url}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// Execute async mapping with bounded concurrency.
async function pMap<T, R>(
  items: T[],
  mapper: (item: T, index: number) => Promise<R>,
  concurrency: number = 5
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

// Fetch subpages with bounded concurrency, creating fallback placeholders for failed pages.
async function fetchSubpagesParallel(
  links: Array<{ title: string; href: string }>,
  websiteUrl: string,
  maxSubpages: number = 20,
  concurrency: number = 5
): Promise<ScrapedSubPage[]> {
  const cleanBase = websiteUrl.replace(/\/+$/, '');
  const subpagesToFetch = links
    .filter((link) => {
      const cleanHref = link.href.replace(/\/+$/, '');
      return cleanHref !== cleanBase;
    })
    .slice(0, maxSubpages);

  return pMap(
    subpagesToFetch,
    async (link) => {
      try {
        const subHtml = await fetchHtmlWithTimeout(link.href, 8000);
        const subExtracted = extractArticleAndMarkdown(subHtml, link.href);
        return {
          url: link.href,
          title: subExtracted.title || link.title,
          description: subExtracted.description,
          markdownContent: subExtracted.markdownContent,
        };
      } catch (err) {
        logWarn(`Failed to fetch subpage ${link.href}:`, err);
        const reason = err instanceof Error ? err.message : String(err);
        return {
          url: link.href,
          title: link.title,
          description: '',
          markdownContent: `*[Content could not be automatically retrieved (${reason})]*`,
        };
      }
    },
    concurrency
  );
}

// Lightweight HTTP + JSDOM scraper fallback when Playwright browser cannot launch.
async function scrapeWebsiteWithFetch(
  websiteUrl: string,
  officialFiles: { llmsTxt: string; llmsFullTxt?: string } | null
): Promise<ScrapedPage> {
  const mainHtml = await fetchHtmlWithTimeout(websiteUrl, 20000);
  const mainExtracted = extractArticleAndMarkdown(mainHtml, websiteUrl);
  const links = extractInternalLinks(mainHtml, websiteUrl, 25);

  if (links.length === 0) {
    links.push({
      title: mainExtracted.title || 'Documentation Overview',
      href: websiteUrl,
    });
  }

  const subPages = await fetchSubpagesParallel(links, websiteUrl, 20, 5);

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
}

// Fetch and parse a website into structured page data.
export async function scrapeWebsite(rawWebsiteUrl: string): Promise<ScrapedPage> {
  const websiteUrl = normalizeUrl(rawWebsiteUrl);

  // Check if site already has an official llms.txt.
  const officialFiles = await checkExistingLlmsTxt(websiteUrl);

  // Fast-path: if both official llms.txt and llms-full.txt exist, return immediately without launching Chromium.
  if (officialFiles?.llmsTxt && officialFiles?.llmsFullTxt) {
    const meta = parseMetadataFromOfficialLlmsTxt(officialFiles.llmsTxt, websiteUrl);
    return {
      url: websiteUrl,
      title: meta.title,
      description: meta.description,
      links: [{ title: meta.title, href: websiteUrl }],
      textContent: officialFiles.llmsTxt,
      markdownContent: officialFiles.llmsTxt,
      subPages: [],
      officialLlmsTxt: officialFiles.llmsTxt,
      officialLlmsFullTxt: officialFiles.llmsFullTxt,
    };
  }

  // Launch headless browser with container-friendly flags, falling back to HTTP fetch if unavailable.
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
  } catch {
    return scrapeWebsiteWithFetch(websiteUrl, officialFiles);
  }

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

    if (links.length === 0) {
      links.push({
        title: mainExtracted.title || 'Documentation Overview',
        href: websiteUrl,
      });
    }

    // Fetch up to 20 subpages in parallel for llms-full.txt using fast HTTP fetch.
    const subPages = await fetchSubpagesParallel(links, websiteUrl, 20, 5);

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
