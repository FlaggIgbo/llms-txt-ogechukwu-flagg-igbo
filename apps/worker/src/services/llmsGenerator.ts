import { logWarn } from '@llmstxt/logger';
import { SiteCategory } from '@llmstxt/shared-types';
import type { GoogleGenAI } from '@google/genai';
import type { ScrapedPage } from './scraper.js';

// Known category types for a website.
export { SiteCategory };
export const KNOWN_CATEGORIES = Object.values(SiteCategory);

// Default re-check interval (hours) per site category.
const INTERVAL_HOURS: Record<SiteCategory, number> = {
  [SiteCategory.NEWS_MEDIA]: 6,
  [SiteCategory.BLOG]: 12,
  [SiteCategory.BLOG_ESSAYS]: 24,
  [SiteCategory.SAAS_APPLICATION]: 48,
  [SiteCategory.MARKETING]: 72,
  [SiteCategory.SEARCH_ENGINE]: 72,
  [SiteCategory.COMMUNITY_PLATFORM]: 72,
  [SiteCategory.API_DOCS]: 168,
  [SiteCategory.TECHNICAL_DOCS]: 168,
  [SiteCategory.GOVERNMENT_PORTAL]: 168,
  [SiteCategory.STANDARDS_SPECIFICATION]: 336,
};

export function getInitialIntervalForCategory(category: SiteCategory): number {
  return INTERVAL_HOURS[category];
}

// Generated llms.txt and llms-full.txt file contents.
export interface GeneratedLlmsFiles {
  llmsTxt: string;
  llmsFullTxt: string;
  siteCategory: SiteCategory;
}

// A link inside a categorized section.
export interface SectionLink {
  title: string;
  url: string;
  description?: string;
}

// A group of links under a section header (e.g. ## Docs).
export interface CategorizedSection {
  name: string;
  links: SectionLink[];
}

// Categorization output with sections and descriptions.
export interface CategorizationResult {
  title?: string;
  siteDescription: string;
  preamble?: string;
  sections: CategorizedSection[];
  siteCategory?: SiteCategory;
}

const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
const TITLE_SEPARATORS = [' | ', ' - ', ' — ', ' – ', ' · '];
const NOT_COMPILED_NOTE = '(Not compiled into llms-full.txt)';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const hasAny = (text: string, words: string[]) => words.some((w) => text.includes(w));

const normalizeUrl = (url: string) => url.toLowerCase().replace(/\/+$/, '');

const isOptionalSection = (name: string) => {
  const n = name.toLowerCase();
  return n === 'optional' || n.includes('additional');
};

function getCrawledUrlSet(scraped: ScrapedPage): Set<string> {
  return new Set([scraped.url, ...(scraped.subPages ?? []).map((s) => s.url)].map(normalizeUrl));
}

// Add links to the existing Optional section, or create one.
function appendToOptional(sections: CategorizedSection[], links: SectionLink[]): void {
  if (links.length === 0) return;
  const existing = sections.find((s) => isOptionalSection(s.name));
  if (existing) existing.links.push(...links);
  else sections.push({ name: 'Optional', links });
}

function markNotCompiled(link: SectionLink): SectionLink {
  const desc = link.description || `Documentation for ${link.title}`;
  return {
    ...link,
    description: desc.includes(NOT_COMPILED_NOTE) ? desc : `${desc} ${NOT_COMPILED_NOTE}`.trim(),
  };
}

// Remove tagline suffixes (e.g. "MyTool | Fast Library" -> "MyTool").
export function cleanProjectTitle(rawTitle: string): string {
  const title = (rawTitle || '').trim();
  const sep = TITLE_SEPARATORS.find((s) => title.includes(s));
  if (!sep) return title || 'Documentation';

  const [first, second] = title.split(sep).map((p) => p.trim());
  const picked = first.toLowerCase() === 'home' && second ? second : first;
  return picked || title || 'Documentation';
}

// ---------------------------------------------------------------------------
// Rule-based categorization
// ---------------------------------------------------------------------------

// Choose a section name based on URL keywords.
function getSectionNameFromUrl(url: string, title: string): string {
  const lowerUrl = url.toLowerCase();
  const lowerTitle = title.toLowerCase();

  if (hasAny(lowerUrl, ['api', 'ref']) || lowerTitle.includes('api')) {
    return 'API Reference';
  }
  if (
    hasAny(lowerUrl, ['doc', 'guide', 'tutorial', 'getting-started', 'quickstart']) ||
    lowerTitle.includes('doc')
  ) {
    return 'Docs';
  }
  if (hasAny(lowerUrl, ['community', 'discord', 'blog', 'changelog', 'release'])) {
    return 'Optional';
  }

  try {
    const [first] = new URL(url).pathname.split('/').filter(Boolean);
    if (first) return first.charAt(0).toUpperCase() + first.slice(1);
  } catch {
    // Ignore invalid URLs.
  }
  return 'Docs';
}

function detectSiteCategory(scraped: ScrapedPage): SiteCategory {
  const url = scraped.url.toLowerCase();
  const title = scraped.title.toLowerCase();

  // Government portals
  if (url.includes('.gov.') || url.includes('.gov/') || url.endsWith('.gov') || hasAny(url, ['service.gov.uk', 'gov.uk'])) {
    return SiteCategory.GOVERNMENT_PORTAL;
  }

  // News and media outlets
  if (hasAny(url, ['nytimes.com', 'bbc.com', 'news', 'reuters.com', 'cnn.com', 'theguardian.com'])) {
    return SiteCategory.NEWS_MEDIA;
  }

  // Web and technical standards specifications
  if (hasAny(url, ['w3.org', 'llmstxt.org', 'spec', 'rfc-editor.org', 'tc39.es'])) {
    return SiteCategory.STANDARDS_SPECIFICATION;
  }

  // Search engines
  if (hasAny(url, ['ecosia.org', 'google.com', 'duckduckgo.com', 'bing.com'])) {
    return SiteCategory.SEARCH_ENGINE;
  }

  // SaaS and web applications
  if (hasAny(url, ['trello.com', 'app.', 'dashboard', 'console', 'linear.app', 'slack.com'])) {
    return SiteCategory.SAAS_APPLICATION;
  }

  // Personal essays & blogs
  if (hasAny(url, ['paulgraham.com', 'essays', 'article', 'newsletter'])) {
    return SiteCategory.BLOG_ESSAYS;
  }

  // API Documentation
  if (
    hasAny(url, ['api', 'reference', 'swagger', 'endpoint']) ||
    title.includes('api') ||
    scraped.links?.some((l) => hasAny(l.href.toLowerCase(), ['api', 'endpoint']))
  ) {
    return SiteCategory.API_DOCS;
  }

  // Technical documentation and developer references
  if (
    hasAny(url, ['developer.mozilla.org', 'docs.python.org', 'python.org', 'docker.com']) ||
    hasAny(url, ['docs', 'documentation', 'guide'])
  ) {
    return SiteCategory.TECHNICAL_DOCS;
  }

  // Community platforms
  if (hasAny(url, ['huggingface.co', 'github.com', 'community'])) {
    return SiteCategory.COMMUNITY_PLATFORM;
  }

  if (!hasAny(url, ['doc', 'api', 'reference', 'spec', 'manual']) && !title.includes('doc')) {
    return SiteCategory.MARKETING;
  }

  return SiteCategory.API_DOCS;
}

// Keep crawled links in their sections; move everything else into Optional
// with a note that it is not part of llms-full.txt.
function alignSectionsWithCrawledPages(
  sections: CategorizedSection[],
  scraped: ScrapedPage
): CategorizedSection[] {
  if (!scraped.subPages?.length) return sections;

  const crawled = getCrawledUrlSet(scraped);
  const primary: CategorizedSection[] = [];
  const uncrawled: SectionLink[] = [];

  for (const section of sections) {
    const optional = isOptionalSection(section.name);
    const compiled: SectionLink[] = [];

    for (const link of section.links) {
      if (!optional && crawled.has(normalizeUrl(link.url))) compiled.push(link);
      else uncrawled.push(markNotCompiled(link));
    }

    if (compiled.length > 0) primary.push({ name: section.name, links: compiled });
  }

  appendToOptional(primary, uncrawled);
  return primary;
}

// Group links into sections without AI.
function categorizeWithFallback(scraped: ScrapedPage): CategorizationResult {
  const sectionMap = new Map<string, SectionLink[]>();

  for (const link of scraped.links) {
    const name = getSectionNameFromUrl(link.href, link.title);
    const items = sectionMap.get(name) ?? [];
    items.push({
      title: link.title,
      url: link.href,
      description: `Guides, reference, and implementation details for ${link.title}.`,
    });
    sectionMap.set(name, items);
  }

  const sections = [...sectionMap].map(([name, links]) => ({ name, links }));
  const title = cleanProjectTitle(scraped.title);

  return {
    title,
    siteDescription:
      scraped.description ||
      `Official technical documentation and developer guides for ${title}.`,
    sections: alignSectionsWithCrawledPages(sections, scraped),
    siteCategory: detectSiteCategory(scraped),
  };
}

// ---------------------------------------------------------------------------
// Gemini categorization
// ---------------------------------------------------------------------------

function buildCategorizationPrompt(scraped: ScrapedPage): string {
  const linkItems = scraped.links.map((link) => ({ title: link.title, url: link.href }));

  return `You are an expert at creating strictly standard-compliant llms.txt files according to the specification at https://llmstxt.org/.

Website Information:
- Page Title: "${scraped.title}"
- URL: "${scraped.url}"
- Description: "${scraped.description}"
- Links: ${JSON.stringify(linkItems, null, 2)}

Specification Rules:
1. "title": The canonical project or site name (e.g. "Plaid Technical Documentation", without marketing slogans).
2. "siteDescription": A concise 1-2 sentence summary of what the project/site is and who it is for.
3. "preamble": Optional 1-sentence note for LLMs on navigating the docs.
4. "sections": Group links into clear H2 categories (e.g. "Docs", "API Reference", "Guides", or product areas).
5. "siteCategory": Classify the website type as exactly one of: ${KNOWN_CATEGORIES.map((c) => `"${c}"`).join(', ')}.
6. For each link, provide:
   - "title": Clean human-readable title.
   - "url": Target URL.
   - "description": A concise, informative 1-sentence explanation of what the resource contains.

Return ONLY a JSON object matching this schema:
{
  "title": "Project Name",
  "siteDescription": "1-2 sentence site summary",
  "preamble": "Optional notes or instructions",
  "siteCategory": "api_docs",
  "sections": [
    {
      "name": "Docs",
      "links": [
        {
          "title": "Quickstart",
          "url": "https://...",
          "description": "Step-by-step walkthrough to get started."
        }
      ]
    }
  ]
}`;
}

// Try each candidate model until one returns text.
async function generateWithModelFallback(ai: GoogleGenAI, prompt: string): Promise<string> {
  for (const model of GEMINI_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });
      if (response.text) return response.text.trim();
    } catch {
      // Try next candidate model.
    }
  }
  throw new Error('No Gemini model returned a response');
}

// Validate the LLM's category; warn and default if it is unknown.
function parseSiteCategory(raw: unknown): SiteCategory {
  if (!raw) return SiteCategory.API_DOCS;

  const normalized = String(raw).toLowerCase().trim();
  if ((KNOWN_CATEGORIES as readonly string[]).includes(normalized)) {
    return normalized as SiteCategory;
  }

  logWarn(
    `[Warning] Unknown site category returned by LLM: "${String(raw)}". Defaulting to "${SiteCategory.API_DOCS}".`
  );
  return SiteCategory.API_DOCS;
}

// Use Gemini to group links and write 1-sentence summaries.
// Falls back to the rule-based parser on any failure.
async function categorizeWithGemini(scraped: ScrapedPage): Promise<CategorizationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return categorizeWithFallback(scraped);

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

    const text = await generateWithModelFallback(ai, buildCategorizationPrompt(scraped));
    const parsed = JSON.parse(text) as CategorizationResult;
    if (!Array.isArray(parsed?.sections)) {
      throw new Error('Gemini response is missing a "sections" array');
    }

    return {
      title: cleanProjectTitle(parsed.title || scraped.title),
      siteDescription: parsed.siteDescription || scraped.description,
      preamble: parsed.preamble,
      sections: alignSectionsWithCrawledPages(parsed.sections, scraped),
      siteCategory: parseSiteCategory(parsed.siteCategory),
    };
  } catch (error) {
    logWarn('Gemini categorization failed, falling back to rule-based parser:', error);
    return categorizeWithFallback(scraped);
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

// "# Title" plus an optional blockquote summary.
function formatHeader(rawTitle: string, siteDescription?: string): string {
  let output = `# ${cleanProjectTitle(rawTitle)}\n\n`;

  const description = siteDescription?.trim();
  if (description) {
    const quote = description
      .split('\n')
      .map((line) => `> ${line.trim()}`)
      .join('\n');
    output += `${quote}\n\n`;
  }

  return output;
}

function formatLink(link: SectionLink): string {
  const title = (link.title || 'Untitled').replace(/[\[\]]/g, '').trim();
  const description = link.description?.trim();
  return `- [${title}](${link.url})${description ? `: ${description}` : ''}`;
}

// Build standard llms.txt markdown string.
export function formatLlmsTxt(
  rawTitle: string,
  siteDescription: string,
  sections: CategorizedSection[],
  preamble?: string
): string {
  let output = formatHeader(rawTitle, siteDescription);

  const cleanPreamble = preamble?.replace(/^#{1,6}\s+/gm, '').trim();
  if (cleanPreamble) output += `${cleanPreamble}\n\n`;

  for (const section of sections) {
    if (!section.links?.length) continue;
    output += `## ${section.name}\n\n${section.links.map(formatLink).join('\n')}\n\n`;
  }

  return output.trim() + '\n';
}

// Build llms-full.txt by combining all Markdown content.
export function formatLlmsFullTxt(
  rawTitle: string,
  siteDescription: string,
  scraped: ScrapedPage
): string {
  let output = formatHeader(rawTitle, siteDescription);

  if (scraped.markdownContent) {
    output += `## Overview\nURL: ${scraped.url}\n\n${scraped.markdownContent}\n\n`;
  }

  for (const page of scraped.subPages ?? []) {
    output += `---\n\n## ${page.title}\nURL: ${page.url}\n\n${page.markdownContent}\n\n`;
  }

  return output.trim() + '\n';
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

// Build llms.txt and llms-full.txt from scraped data.
export async function generateLlmsTxtFiles(scraped: ScrapedPage): Promise<GeneratedLlmsFiles> {
  // Use official files directly if the site already authored them.
  if (scraped.officialLlmsTxt) {
    return {
      llmsTxt: scraped.officialLlmsTxt,
      llmsFullTxt:
        scraped.officialLlmsFullTxt ||
        formatLlmsFullTxt(scraped.title, scraped.description, scraped),
      siteCategory: SiteCategory.API_DOCS,
    };
  }

  const categorized = await categorizeWithGemini(scraped);
  const projectTitle = categorized.title || scraped.title;

  return {
    llmsTxt: formatLlmsTxt(
      projectTitle,
      categorized.siteDescription,
      categorized.sections,
      categorized.preamble
    ),
    llmsFullTxt: formatLlmsFullTxt(projectTitle, categorized.siteDescription, scraped),
    siteCategory: categorized.siteCategory || SiteCategory.API_DOCS,
  };
}

export {
  validateLlmsTxt,
  validateLlmsFullTxt,
  assertValidLlmsFiles,
  LlmsValidationError,
  type ValidationResult,
  type ValidationStats,
} from './llmsValidator.js';
