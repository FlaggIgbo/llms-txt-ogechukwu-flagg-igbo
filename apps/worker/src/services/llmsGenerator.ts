import { logWarn } from '@llmstxt/logger';
import type { ScrapedPage } from './scraper.js';

// Known category types for a website.
export const KNOWN_CATEGORIES = ['api_docs', 'blog', 'marketing'] as const;
export type SiteCategory = (typeof KNOWN_CATEGORIES)[number];

// Get default check interval for a site category.
export function getInitialIntervalForCategory(category: SiteCategory): number {
  if (category === 'blog') return 12;
  if (category === 'marketing') return 72;
  return 168; // api_docs default
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

// Remove tagline suffixes (e.g. "MyTool | Fast Library" -> "MyTool").
export function cleanProjectTitle(rawTitle: string): string {
  let title = (rawTitle || '').trim();

  const separators = [' | ', ' - ', ' — ', ' – ', ' · '];
  for (const sep of separators) {
    if (title.includes(sep)) {
      const parts = title.split(sep);
      if (parts[0].trim().toLowerCase() === 'home' && parts.length > 1) {
        title = parts[1].trim();
      } else if (parts[0].trim().length > 0) {
        title = parts[0].trim();
      }
    }
  }

  return title || 'Documentation';
}

// Choose a section name based on URL keywords.
function getSectionNameFromUrl(url: string, title: string): string {
  const lowerUrl = url.toLowerCase();
  const lowerTitle = title.toLowerCase();

  if (lowerUrl.includes('api') || lowerTitle.includes('api') || lowerUrl.includes('ref')) {
    return 'API Reference';
  }
  if (
    lowerUrl.includes('doc') ||
    lowerTitle.includes('doc') ||
    lowerUrl.includes('guide') ||
    lowerUrl.includes('tutorial') ||
    lowerUrl.includes('getting-started') ||
    lowerUrl.includes('quickstart')
  ) {
    return 'Docs';
  }
  if (
    lowerUrl.includes('community') ||
    lowerUrl.includes('discord') ||
    lowerUrl.includes('blog') ||
    lowerUrl.includes('changelog') ||
    lowerUrl.includes('release')
  ) {
    return 'Optional';
  }

  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split('/').filter((s) => s.length > 0);
    if (segments.length >= 1) {
      const seg = segments[0];
      return seg.charAt(0).toUpperCase() + seg.slice(1);
    }
  } catch {
    // Ignore error.
  }
  return 'Docs';
}

// Group links into sections without AI.
function categorizeWithFallback(scraped: ScrapedPage): CategorizationResult {
  const sectionMap = new Map<string, SectionLink[]>();

  for (const link of scraped.links) {
    const sectionName = getSectionNameFromUrl(link.href, link.title);

    const item: SectionLink = {
      title: link.title,
      url: link.href,
      description: `Guides, reference, and implementation details for ${link.title}.`,
    };

    if (!sectionMap.has(sectionName)) {
      sectionMap.set(sectionName, []);
    }
    sectionMap.get(sectionName)!.push(item);
  }

  const sections: CategorizedSection[] = [];
  for (const [name, links] of sectionMap.entries()) {
    sections.push({ name, links });
  }

  const lowerUrl = scraped.url.toLowerCase();
  const lowerTitle = scraped.title.toLowerCase();
  let siteCategory: SiteCategory = 'api_docs';
  if (lowerUrl.includes('blog') || lowerTitle.includes('blog') || lowerUrl.includes('changelog')) {
    siteCategory = 'blog';
  } else if (!lowerUrl.includes('doc') && !lowerTitle.includes('doc') && !lowerUrl.includes('api')) {
    siteCategory = 'marketing';
  }

  const siteDescription =
    scraped.description ||
    `Official technical documentation and developer guides for ${cleanProjectTitle(scraped.title)}.`;

  return {
    title: cleanProjectTitle(scraped.title),
    siteDescription,
    sections,
    siteCategory,
  };
}

// Use Gemini to group links and write 1-sentence summaries.
async function categorizeWithGemini(
  scraped: ScrapedPage
): Promise<CategorizationResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return categorizeWithFallback(scraped);
  }

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

    const linkItems = scraped.links.map((link) => ({
      title: link.title,
      url: link.href,
    }));

    const prompt = `You are an expert at creating strictly standard-compliant llms.txt files according to the specification at https://llmstxt.org/.

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
5. "siteCategory": Classify the website type as exactly one of: "api_docs", "blog", or "marketing".
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

    const modelCandidates = ['gemini-3.8-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
    let responseText = '';

    for (const model of modelCandidates) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });
        if (response.text) {
          responseText = response.text.trim();
          break;
        }
      } catch {
        // Try next candidate model.
      }
    }

    if (!responseText) {
      return categorizeWithFallback(scraped);
    }

    const parsed = JSON.parse(responseText) as CategorizationResult;

    if (parsed && Array.isArray(parsed.sections)) {
      // Validate category; log warning if LLM returns an unknown category.
      let category: SiteCategory = 'api_docs';
      if (parsed.siteCategory) {
        const normalized = String(parsed.siteCategory).toLowerCase().trim();
        if ((KNOWN_CATEGORIES as readonly string[]).includes(normalized)) {
          category = normalized as SiteCategory;
        } else {
          logWarn(
            `[Warning] Unknown site category returned by LLM: "${parsed.siteCategory}". Defaulting to "api_docs".`
          );
          category = 'api_docs';
        }
      }

      return {
        title: parsed.title ? cleanProjectTitle(parsed.title) : cleanProjectTitle(scraped.title),
        siteDescription: parsed.siteDescription || scraped.description,
        preamble: parsed.preamble,
        sections: parsed.sections,
        siteCategory: category,
      };
    }

    return categorizeWithFallback(scraped);
  } catch (error) {
    logWarn('Gemini categorization failed, falling back to rule-based parser:', error);
    return categorizeWithFallback(scraped);
  }
}

// Build standard llms.txt markdown string.
export function formatLlmsTxt(
  rawTitle: string,
  siteDescription: string,
  sections: CategorizedSection[],
  preamble?: string
): string {
  const title = cleanProjectTitle(rawTitle);
  let output = `# ${title}\n\n`;

  // Add blockquote summary.
  if (siteDescription && siteDescription.trim()) {
    const formattedQuote = siteDescription
      .trim()
      .split('\n')
      .map((line) => `> ${line.trim()}`)
      .join('\n');
    output += `${formattedQuote}\n\n`;
  }

  // Add optional preamble notes.
  if (preamble && preamble.trim()) {
    const cleanPreamble = preamble
      .replace(/^#{1,6}\s+/gm, '')
      .trim();
    if (cleanPreamble) {
      output += `${cleanPreamble}\n\n`;
    }
  }

  // Add each H2 section and its links.
  for (const section of sections) {
    if (!section.links || section.links.length === 0) continue;

    output += `## ${section.name}\n\n`;
    for (const link of section.links) {
      const safeTitle = (link.title || 'Untitled').replace(/[\[\]]/g, '').trim();
      if (link.description && link.description.trim()) {
        output += `- [${safeTitle}](${link.url}): ${link.description.trim()}\n`;
      } else {
        output += `- [${safeTitle}](${link.url})\n`;
      }
    }
    output += '\n';
  }

  return output.trim() + '\n';
}

// Build llms-full.txt by combining all Markdown content.
export function formatLlmsFullTxt(
  rawTitle: string,
  siteDescription: string,
  scraped: ScrapedPage
): string {
  const title = cleanProjectTitle(rawTitle);
  let output = `# ${title}\n\n`;

  if (siteDescription && siteDescription.trim()) {
    const formattedQuote = siteDescription
      .trim()
      .split('\n')
      .map((line) => `> ${line.trim()}`)
      .join('\n');
    output += `${formattedQuote}\n\n`;
  }

  // Include main page markdown.
  if (scraped.markdownContent) {
    output += `## Overview\nURL: ${scraped.url}\n\n${scraped.markdownContent}\n\n`;
  }

  // Include crawled subpages.
  if (scraped.subPages && scraped.subPages.length > 0) {
    for (const subPage of scraped.subPages) {
      output += `---\n\n## ${subPage.title}\nURL: ${subPage.url}\n\n`;
      output += `${subPage.markdownContent}\n\n`;
    }
  }

  return output.trim() + '\n';
}

// Build llms.txt and llms-full.txt from scraped data.
export async function generateLlmsTxtFiles(
  scraped: ScrapedPage
): Promise<GeneratedLlmsFiles> {
  // Use official files directly if the site already authored them.
  if (scraped.officialLlmsTxt) {
    return {
      llmsTxt: scraped.officialLlmsTxt,
      llmsFullTxt:
        scraped.officialLlmsFullTxt ||
        formatLlmsFullTxt(scraped.title, scraped.description, scraped),
      siteCategory: 'api_docs',
    };
  }

  // Categorize links with Gemini or fallback.
  const categorized = await categorizeWithGemini(scraped);
  const projectTitle = categorized.title || scraped.title;

  // Format llms.txt and llms-full.txt.
  const llmsTxt = formatLlmsTxt(
    projectTitle,
    categorized.siteDescription,
    categorized.sections,
    categorized.preamble
  );

  const llmsFullTxt = formatLlmsFullTxt(
    projectTitle,
    categorized.siteDescription,
    scraped
  );

  return {
    llmsTxt,
    llmsFullTxt,
    siteCategory: categorized.siteCategory || 'api_docs',
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

