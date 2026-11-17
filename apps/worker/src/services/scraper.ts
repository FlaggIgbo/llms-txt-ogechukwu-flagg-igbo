import { chromium, type BrowserContext } from 'playwright';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import { logWarn } from '@llmstxt/logger';
import { validatePublicUrl } from './urlValidator.js';

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
  links: ScrapedLink[];
  textContent: string;
  markdownContent: string;
  subPages: ScrapedSubPage[];
  officialLlmsTxt?: string;
  officialLlmsFullTxt?: string;
  officialLlmsTxtUrl?: string;
  officialLlmsFullTxtUrl?: string;
}

// Official llms.txt files already published by the site.
export interface OfficialFiles {
  llmsTxt: string;
  llmsFullTxt?: string;
  llmsTxtUrl?: string;
  llmsFullTxtUrl?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const HTML_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_LINKS = 25;
const MAX_SUBPAGES = 20;
const SUBPAGE_CONCURRENCY = 5;

const MAIN_PAGE_TIMEOUT_MS = 20_000;
const SUBPAGE_TIMEOUT_MS = 8_000;
const LLMS_FILE_TIMEOUT_MS = 8_000;

const GENERIC_TITLES = ['home', 'index', 'welcome', 'untitled', 'docs', 'documentation'];

// Pages that are never useful documentation.
const EXCLUDED_PATHS = [
  '/login',
  '/signin',
  '/signup',
  '/careers',
  '/terms',
  '/privacy',
  '/contact',
  '/pricing',
];

// Sidebar/navigation links are preferred over every anchor on the page.
const NAV_SELECTOR =
  'nav a, aside a, [role="navigation"] a, [aria-label*="nav"] a, .sidebar a, .menu a';

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

// Ensure the URL has https:// or http://.
export function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// Get the brand name from a domain (e.g. plaid.com -> Plaid).
export function getBrandNameFromUrl(rawUrl: string): string {
  try {
    const parts = new URL(normalizeUrl(rawUrl)).hostname.split('.');
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

// Key used to treat "/guide" and "/guide/" as the same page.
const dedupeKey = (url: URL) => url.origin + url.pathname.replace(/\/+$/, '') + url.search;

// ---------------------------------------------------------------------------
// Safe HTTP
// ---------------------------------------------------------------------------

async function discardAndThrow(res: Response, message: string): Promise<never> {
  await res.body?.cancel().catch(() => { });
  throw new Error(message);
}

// fetch() that validates every hop against the SSRF guard. Redirects are
// followed manually so a public URL cannot bounce us to an internal address.
async function safeFetch(
  url: string,
  timeoutMs: number,
  headers: Record<string, string> = {}
): Promise<Response> {
  const signal = AbortSignal.timeout(timeoutMs);
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = await validatePublicUrl(current);
    if (!check.valid) {
      throw new Error(`SSRF blocked: ${check.error}`);
    }

    const res = await fetch(current, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"macOS"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        ...headers,
      },
      redirect: 'manual',
      signal,
    });

    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!location) return res;

    await res.body?.cancel().catch(() => { });
    current = new URL(location, current).href;
  }

  throw new Error(`Too many redirects fetching ${url}`);
}

// Fetch a text body with a timeout, size cap, and optional HTML content check.
async function fetchText(
  url: string,
  options: { timeoutMs?: number; requireHtml?: boolean } = {}
): Promise<string> {
  const { timeoutMs = 15_000, requireHtml = false } = options;
  const res = await safeFetch(url, timeoutMs, requireHtml ? { Accept: HTML_ACCEPT } : {});

  if (!res.ok) {
    return discardAndThrow(res, `HTTP ${res.status} fetching ${url}`);
  }

  if (requireHtml) {
    const type = res.headers.get('content-type') ?? '';
    if (type && !/html|xml/i.test(type)) {
      return discardAndThrow(res, `Unexpected content type "${type}" at ${url}`);
    }
  }

  if (Number(res.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return discardAndThrow(res, `Response too large at ${url}`);
  }

  const text = await res.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new Error(`Response too large at ${url}`);
  }
  return text;
}

// ---------------------------------------------------------------------------
// Official llms.txt detection
// ---------------------------------------------------------------------------

// Fetch a candidate llms file; returns null unless it looks like markdown.
async function tryFetchLlmsFile(url: string): Promise<string | null> {
  try {
    const text = await fetchText(url, { timeoutMs: LLMS_FILE_TIMEOUT_MS });
    return text.trim().startsWith('#') ? text : null;
  } catch {
    return null;
  }
}

// Check if the site already has an official llms.txt.
export async function checkExistingLlmsTxt(websiteUrl: string): Promise<OfficialFiles | null> {
  let parsed: URL;
  try {
    parsed = new URL(websiteUrl);
  } catch {
    return null;
  }

  // Check subpath first (e.g. /docs/llms.txt), then root (/llms.txt), then docs.[domain]/llms.txt.
  const basePath = parsed.pathname.replace(/\/+$/, '');
  const candidates = [
    ...(basePath ? [`${parsed.origin}${basePath}/llms.txt`] : []),
    `${parsed.origin}/llms.txt`,
  ];

  const cleanHost = parsed.hostname.replace(/^www\./i, '');
  if (!cleanHost.toLowerCase().startsWith('docs.') && cleanHost.includes('.')) {
    candidates.push(`${parsed.protocol}//docs.${cleanHost}/llms.txt`);
  }

  for (const candidate of candidates) {
    const llmsTxt = await tryFetchLlmsFile(candidate);
    if (!llmsTxt) continue;

    const fullCandidate = candidate.replace(/llms\.txt$/, 'llms-full.txt');
    let llmsFullTxtUrl: string | undefined = undefined;
    let llmsFullTxt: string | undefined = undefined;

    // Check if official llms-full.txt exists
    try {
      const headRes = await safeFetch(fullCandidate, 5_000);
      if (headRes.ok && (headRes.headers.get('content-type')?.includes('text') || headRes.status === 200)) {
        llmsFullTxtUrl = fullCandidate;
        llmsFullTxt = await tryFetchLlmsFile(fullCandidate).catch(() => undefined) ?? undefined;
      }
    } catch {
      // ignore
    }

    return {
      llmsTxt,
      llmsFullTxt,
      llmsTxtUrl: candidate,
      llmsFullTxtUrl,
    };
  }
  return null;
}

// Extract title and description directly from an official llms.txt document.
function parseMetadataFromOfficialLlmsTxt(
  llmsTxt: string,
  fallbackUrl: string
): { title: string; description: string } {
  const lines = llmsTxt.split(/\r?\n/).map((l) => l.trim());
  const title = lines.find((l) => l.startsWith('# '))?.slice(2).trim() ?? '';
  const description = lines.find((l) => l.startsWith('>'))?.replace(/^>+\s*/, '').trim() ?? '';
  const brand = getBrandNameFromUrl(fallbackUrl);

  return {
    title: title || (brand ? `${brand} Documentation` : 'Documentation'),
    description:
      description ||
      `Official technical documentation and guides for ${title || brand || fallbackUrl}.`,
  };
}

// Build a ScrapedPage straight from official files, no crawling needed.
function buildOfficialPage(websiteUrl: string, files: OfficialFiles): ScrapedPage {
  const meta = parseMetadataFromOfficialLlmsTxt(files.llmsTxt, websiteUrl);
  return {
    url: websiteUrl,
    title: meta.title,
    description: meta.description,
    links: [{ title: meta.title, href: websiteUrl }],
    textContent: files.llmsTxt,
    markdownContent: files.llmsTxt,
    subPages: [],
    officialLlmsTxt: files.llmsTxt,
    officialLlmsFullTxt: files.llmsFullTxt,
    officialLlmsTxtUrl: files.llmsTxtUrl,
    officialLlmsFullTxtUrl: files.llmsFullTxtUrl,
  };
}

// ---------------------------------------------------------------------------
// HTML extraction
// ---------------------------------------------------------------------------

// Clean raw HTML and convert it to clean Markdown.
function extractArticleAndMarkdown(
  html: string,
  pageUrl: string
): { title: string; description: string; textContent: string; markdownContent: string } {
  const dom = new JSDOM(html, { url: pageUrl });
  try {
    const document = dom.window.document;

    // Readability mutates the document it parses, so give it a clone and keep
    // the original intact for the fallbacks below.
    const article = new Readability(document.cloneNode(true) as Document).parse();

    const metaDesc =
      document.querySelector('meta[name="description"]')?.getAttribute('content') ||
      document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
      '';

    let title = (article?.title || document.title || 'Untitled').trim();
    const brand = getBrandNameFromUrl(pageUrl);

    // Replace generic titles like "Home" or "Docs" with the brand name.
    if (brand && GENERIC_TITLES.includes(title.toLowerCase())) {
      title = `${brand} Documentation`;
    }

    const contentHtml = article?.content || document.body?.innerHTML || '';

    return {
      title,
      description: (article?.excerpt || metaDesc).trim(),
      textContent: (article?.textContent || document.body?.textContent || '').trim(),
      markdownContent: NodeHtmlMarkdown.translate(contentHtml).trim(),
    };
  } finally {
    dom.window.close();
  }
}

// Collect unique internal documentation links from page navigation.
export function extractInternalLinks(
  html: string,
  baseUrl: string,
  maxLinks: number = MAX_LINKS
): ScrapedLink[] {
  const dom = new JSDOM(html, { url: baseUrl });
  try {
    const document = dom.window.document;
    const base = new URL(baseUrl);

    // Seed with the base URL so we never link back to it.
    const seen = new Set([dedupeKey(base)]);
    const links: ScrapedLink[] = [];

    const navAnchors = Array.from(document.querySelectorAll(NAV_SELECTOR));
    const anchors = navAnchors.length > 0 ? navAnchors : Array.from(document.querySelectorAll('a'));

    for (const anchor of anchors) {
      if (links.length >= maxLinks) break;

      const rawHref = anchor.getAttribute('href');
      const title = (anchor.textContent || '').replace(/\s+/g, ' ').trim();
      if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) continue;
      if (title.length <= 1) continue;

      let url: URL;
      try {
        url = new URL(rawHref, base);
      } catch {
        continue; // Malformed URL.
      }
      url.hash = '';

      const key = dedupeKey(url);
      const pathname = url.pathname.toLowerCase();
      if (url.origin !== base.origin || seen.has(key)) continue;
      if (EXCLUDED_PATHS.some((pattern) => pathname.includes(pattern))) continue;

      seen.add(key);
      links.push({ title, href: url.href });
    }

    return links;
  } finally {
    dom.window.close();
  }
}

// ---------------------------------------------------------------------------
// Crawling
// ---------------------------------------------------------------------------

// Execute async mapping with bounded concurrency.
async function pMap<T, R>(
  items: T[],
  mapper: (item: T, index: number) => Promise<R>,
  concurrency: number = SUBPAGE_CONCURRENCY
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

// Fetch subpages with bounded concurrency, using a placeholder for failed pages.
async function fetchSubpages(links: ScrapedLink[]): Promise<ScrapedSubPage[]> {
  return pMap(links.slice(0, MAX_SUBPAGES), async (link) => {
    try {
      const html = await fetchText(link.href, {
        timeoutMs: SUBPAGE_TIMEOUT_MS,
        requireHtml: true,
      });
      const extracted = extractArticleAndMarkdown(html, link.href);
      return {
        url: link.href,
        title: extracted.title || link.title,
        description: extracted.description,
        markdownContent: extracted.markdownContent,
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
  });
}

// ---------------------------------------------------------------------------
// Fetching the main page
// ---------------------------------------------------------------------------

// Block browser requests (including subresources and redirects) to private hosts.
async function blockPrivateRequests(context: BrowserContext): Promise<void> {
  const verdicts = new Map<string, Promise<boolean>>();

  await context.route('**/*', async (route) => {
    const url = route.request().url();
    if (!/^https?:/i.test(url)) return route.continue(); // data:, blob:, etc.

    const origin = new URL(url).origin;
    let allowed = verdicts.get(origin);
    if (!allowed) {
      allowed = validatePublicUrl(url).then(
        (r) => r.valid,
        () => false
      );
      verdicts.set(origin, allowed);
    }

    return (await allowed) ? route.continue() : route.abort('blockedbyclient');
  });
}

// Render the page in headless Chromium so client-side JavaScript runs.
async function getHtmlWithBrowser(url: string): Promise<string> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const context = await browser.newContext({ userAgent: USER_AGENT });
    await blockPrivateRequests(context);

    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Wait briefly for client-side JavaScript; ignore networkidle timeouts.
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => { });

    return await page.content();
  } finally {
    await browser.close();
  }
}

// Everything after we have the main page's HTML (same for browser and fetch).
async function buildScrapedPage(
  websiteUrl: string,
  mainHtml: string,
  officialFiles: OfficialFiles | null
): Promise<ScrapedPage> {
  const main = extractArticleAndMarkdown(mainHtml, websiteUrl);
  const links = extractInternalLinks(mainHtml, websiteUrl);

  // Fetch subpages for llms-full.txt. With no links found, list the main page
  // itself so llms.txt still has an entry, and skip the crawl.
  const subPages = links.length > 0 ? await fetchSubpages(links) : [];
  if (links.length === 0) {
    links.push({ title: main.title || 'Documentation Overview', href: websiteUrl });
  }

  return {
    url: websiteUrl,
    title: main.title,
    description: main.description,
    links,
    textContent: main.textContent,
    markdownContent: main.markdownContent,
    subPages,
    officialLlmsTxt: officialFiles?.llmsTxt,
    officialLlmsFullTxt: officialFiles?.llmsFullTxt,
    officialLlmsTxtUrl: officialFiles?.llmsTxtUrl,
    officialLlmsFullTxtUrl: officialFiles?.llmsFullTxtUrl,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

// Fetch and parse a website into structured page data.
export async function scrapeWebsite(rawWebsiteUrl: string): Promise<ScrapedPage> {
  const websiteUrl = normalizeUrl(rawWebsiteUrl);

  // SSRF guard: ensure the URL is public and not an internal/metadata address.
  const check = await validatePublicUrl(websiteUrl);
  if (!check.valid) {
    throw new Error(`SSRF blocked: ${check.error}`);
  }

  const officialFiles = await checkExistingLlmsTxt(websiteUrl);

  // Fast path: both official files exist, so no browser or crawl is needed.
  if (officialFiles?.llmsFullTxt) {
    return buildOfficialPage(websiteUrl, officialFiles as Required<OfficialFiles>);
  }

  // Prefer a real browser; fall back to plain HTTP if it can't launch or load.
  const mainHtml = await getHtmlWithBrowser(websiteUrl).catch((err) => {
    logWarn('Browser scrape failed, falling back to HTTP fetch:', err);
    return fetchText(websiteUrl, { timeoutMs: MAIN_PAGE_TIMEOUT_MS, requireHtml: true });
  });

  return buildScrapedPage(websiteUrl, mainHtml, officialFiles);
}
