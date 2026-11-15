import type { ScrapedPage } from './scraper.js';

export interface GeneratedLlmsFiles {
  llmsTxt: string;
  llmsFullTxt: string;
}

/**
 * Formats scraped website content into standard `llms.txt` and `llms-full.txt` Markdown files.
 */
export function generateLlmsTxtFiles(scraped: ScrapedPage): GeneratedLlmsFiles {
  const linkLines = scraped.links
    .map((link) => `- [${link.title}](${link.href})`)
    .join('\n');

  const llmsTxt = [
    `# ${scraped.title}`,
    '',
    `> ${scraped.description}`,
    '',
    '## Docs',
    '',
    linkLines,
    '',
  ].join('\n');

  const llmsFullTxt = [
    llmsTxt.trimEnd(),
    '',
    '## Full Content',
    '',
    scraped.textContent,
    '',
  ].join('\n');

  return { llmsTxt, llmsFullTxt };
}
