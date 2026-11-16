// Validation functions and error types for llms.txt and llms-full.txt files.

export interface ValidationStats {
  title?: string;
  sectionCount: number;
  linkCount: number;
  byteSize: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  stats: ValidationStats;
}

export class LlmsValidationError extends Error {
  public readonly errors: string[];

  constructor(message: string, errors: string[]) {
    super(`${message}: ${errors.join('; ')}`);
    this.name = 'LlmsValidationError';
    this.errors = errors;
  }
}

/**
 * Validates llms.txt content against the https://llmstxt.org/ specification:
 * 1. Must not be empty, non-string, or corrupted (no null bytes).
 * 2. Must start with a single H1 title (`# Title`).
 * 3. Must contain a blockquote summary (`> Summary`).
 * 4. Must organize links into H2 sections (`## Section Name`).
 * 5. Links must follow `- [Title](URL): Description` or `- [Title](URL)`.
 */
export function validateLlmsTxt(content: string): ValidationResult {
  const errors: string[] = [];

  if (typeof content !== 'string' || content.trim().length === 0) {
    return {
      valid: false,
      errors: ['File content is empty or not a valid string.'],
      stats: { sectionCount: 0, linkCount: 0, byteSize: 0 },
    };
  }

  const byteSize = Buffer.byteLength(content, 'utf8');

  // Check for corrupted binary characters or null bytes.
  if (content.includes('\0')) {
    return {
      valid: false,
      errors: ['File is corrupted: contains null byte characters.'],
      stats: { sectionCount: 0, linkCount: 0, byteSize },
    };
  }

  const lines = content.split(/\r?\n/);

  // 1. Validate H1 Title at start of document.
  const firstNonEmptyIndex = lines.findIndex((l) => l.trim().length > 0);
  let title: string | undefined;

  if (firstNonEmptyIndex === -1) {
    errors.push('File must start with an H1 title: "# <Title>".');
  } else {
    const rawLine = lines[firstNonEmptyIndex];
    const trimmedLine = rawLine.trim();

    if (!trimmedLine.startsWith('#')) {
      errors.push('File must start with an H1 title: "# <Title>".');
    } else if (trimmedLine.startsWith('##')) {
      errors.push('File must start with an H1 title ("# <Title>"), not a sub-heading.');
    } else {
      title = trimmedLine.replace(/^#\s*/, '').trim();
      if (!title) {
        errors.push('H1 title cannot be empty.');
      }
    }
  }

  // 2. Validate blockquote summary before H2 sections.
  let hasBlockquote = false;
  const startScan = firstNonEmptyIndex >= 0 ? firstNonEmptyIndex + 1 : 0;

  for (let i = startScan; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('## ')) break;
    if (trimmed.startsWith('>')) {
      const quote = trimmed.replace(/^>+\s*/, '').trim();
      if (quote.length > 0) {
        hasBlockquote = true;
      }
    }
  }

  if (!hasBlockquote) {
    errors.push('Missing required blockquote summary: "> <Summary>" after the title.');
  }

  // 3. Scan H2 sections and markdown links.
  let sectionCount = 0;
  let linkCount = 0;
  const linkRegex = /^\s*-\s+\[([^\]]+)\]\((.+)\)(?::\s*(.*))?$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('## ')) {
      sectionCount++;
      const sectionName = trimmed.slice(3).trim();
      if (!sectionName) {
        errors.push(`Line ${i + 1}: H2 section header name is empty.`);
      }
    } else if (trimmed.startsWith('- ')) {
      const match = trimmed.match(linkRegex);
      if (!match) {
        errors.push(`Line ${i + 1}: Malformed markdown link format: "${trimmed}".`);
      } else {
        const [, linkTitle, linkUrl] = match;
        if (!linkTitle.trim()) {
          errors.push(`Line ${i + 1}: Link title is empty in "${trimmed}".`);
        }

        const trimmedUrl = linkUrl.trim();
        try {
          const parsed = new URL(trimmedUrl);
          if (!['http:', 'https:'].includes(parsed.protocol)) {
            errors.push(`Line ${i + 1}: Invalid URL protocol "${parsed.protocol}" in "${trimmedUrl}".`);
          }
        } catch {
          if (!trimmedUrl.startsWith('/') && !trimmedUrl.startsWith('#')) {
            errors.push(`Line ${i + 1}: Invalid URL destination "${trimmedUrl}".`);
          }
        }
        linkCount++;
      }
    }
  }

  if (sectionCount === 0) {
    errors.push('No H2 sections (e.g. "## Docs") found.');
  }
  if (linkCount === 0) {
    errors.push('No valid markdown links found in the document.');
  }

  return {
    valid: errors.length === 0,
    errors,
    stats: {
      title,
      sectionCount,
      linkCount,
      byteSize,
    },
  };
}

/**
 * Validates llms-full.txt content:
 * 1. Must not be empty or corrupted.
 * 2. Must start with an H1 title.
 * 3. Must contain substantive documentation sections.
 */
export function validateLlmsFullTxt(content: string): ValidationResult {
  const errors: string[] = [];

  if (typeof content !== 'string' || content.trim().length === 0) {
    return {
      valid: false,
      errors: ['llms-full.txt content is empty or not a string.'],
      stats: { sectionCount: 0, linkCount: 0, byteSize: 0 },
    };
  }

  const byteSize = Buffer.byteLength(content, 'utf8');

  if (content.includes('\0')) {
    return {
      valid: false,
      errors: ['llms-full.txt is corrupted: contains null byte characters.'],
      stats: { sectionCount: 0, linkCount: 0, byteSize },
    };
  }

  const trimmed = content.trim();
  const lines = trimmed.split(/\r?\n/);
  const firstNonEmpty = lines.find((l) => l.trim().length > 0);

  let title: string | undefined;
  if (!firstNonEmpty || !firstNonEmpty.startsWith('# ')) {
    errors.push('llms-full.txt must start with an H1 title: "# <Title>".');
  } else {
    title = firstNonEmpty.slice(2).trim();
  }

  const sectionMatches = trimmed.match(/^##\s+.+/gm) || [];
  const sectionCount = sectionMatches.length;

  if (trimmed.length < 20) {
    errors.push('llms-full.txt content is too short or incomplete.');
  }

  return {
    valid: errors.length === 0,
    errors,
    stats: {
      title,
      sectionCount,
      linkCount: (trimmed.match(/^\s*-\s+\[/gm) || []).length,
      byteSize,
    },
  };
}

/**
 * Enforces that both llms.txt and llms-full.txt are valid.
 * Throws LlmsValidationError if any issues are detected.
 */
export function assertValidLlmsFiles(llmsTxt: string, llmsFullTxt: string): void {
  const txtResult = validateLlmsTxt(llmsTxt);
  if (!txtResult.valid) {
    throw new LlmsValidationError('llms.txt validation failed', txtResult.errors);
  }

  const fullTxtResult = validateLlmsFullTxt(llmsFullTxt);
  if (!fullTxtResult.valid) {
    throw new LlmsValidationError('llms-full.txt validation failed', fullTxtResult.errors);
  }
}
