import { type SiteEntry, isGeneratedEntry } from '@llmstxt/shared-types';

// Props for the directory table.
export interface DirectoryTableProps {
  entries: SiteEntry[];
  loading?: boolean;
  error?: string | null;
}

// Remove trailing slashes from a URL.
function trimTrailingSlashes(url: string): string {
  let clean = url;
  while (clean.endsWith('/')) {
    clean = clean.slice(0, -1);
  }
  return clean;
}

// Get the llms.txt or llms-full.txt URL for an entry.
export function resolveLlmTxtUrl(entry: SiteEntry): string {
  const isGenerated = isGeneratedEntry(entry);

  if (isGenerated) {
    // For websites where we generated llms (rather than the website already having one),
    // return the llms-full.txt file instead of the llms.txt file on the home page.
    const fullStorage = entry.llms_full_txt_storage?.trim() || '';
    if (fullStorage && (fullStorage.startsWith('http://') || fullStorage.startsWith('https://'))) {
      return fullStorage;
    }

    if (entry.llm_txt && (entry.llm_txt.includes('llms-full.txt') || entry.llm_txt.includes('llms-full/txt'))) {
      return entry.llm_txt;
    }

    // Fallback to normal llms.txt if something is wrong with llms.txt full
    if (entry.llm_txt) {
      return entry.llm_txt;
    }

    const storageUrl = entry.llms_txt_storage?.trim() || '';
    if (storageUrl.startsWith('http://') || storageUrl.startsWith('https://')) {
      return storageUrl;
    }

    if (entry.website_url) {
      return `${trimTrailingSlashes(entry.website_url)}/llms.txt`;
    }

    return '';
  }

  // Official site (website already had one)
  if (entry.llm_txt) {
    return entry.llm_txt;
  }

  const storageUrl = entry.llms_txt_storage?.trim() || '';
  if (storageUrl.startsWith('http://') || storageUrl.startsWith('https://')) {
    return storageUrl;
  }

  // Fallback to website URL with /llms.txt.
  if (entry.website_url) {
    return `${trimTrailingSlashes(entry.website_url)}/llms.txt`;
  }

  return '';
}

// Format an ISO date string into a readable date and timestamp localized to the device's timezone.
export function formatDateTime(isoString?: string | null): string {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

// Render a single table row.
function renderEntryRow(entry: SiteEntry) {
  const llmTxtUrl = resolveLlmTxtUrl(entry);
  const displayName = entry.website_name || entry.website_url || '—';

  return (
    <tr key={entry.id} className="table-row">
      {/* Website name linking to the .txt file in Cloudflare R2 */}
      <td className="cell-name">
        {llmTxtUrl ? (
          <a
            href={llmTxtUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="site-link"
            title={`Open .txt file: ${llmTxtUrl}`}
          >
            {displayName}
          </a>
        ) : entry.website_url ? (
          <a
            href={entry.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="site-link"
          >
            {displayName}
          </a>
        ) : (
          displayName
        )}
      </td>

      {/* Short description */}
      <td className="cell-desc">
        {entry.website_short_description || '—'}
      </td>

      {/* Link to llms.txt */}
      <td className="cell-llm-txt">
        {llmTxtUrl ? (
          <a
            href={llmTxtUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="llm-txt-link"
          >
            {llmTxtUrl}
            <span className="external-arrow">↗</span>
          </a>
        ) : (
          <span className="empty-dash">—</span>
        )}
      </td>

      {/* Last updated date and timestamp localized to device timezone */}
      <td className="cell-updated">
        {formatDateTime(entry.updated_at)}
      </td>
    </tr>
  );
}

// Table showing all matching websites.
export function DirectoryTable({
  entries,
  loading = false,
  error = null,
}: DirectoryTableProps) {
  if (error) {
    return null;
  }

  // Table body content.
  function renderRows() {
    if (loading && entries.length === 0) {
      return (
        <tr>
          <td colSpan={4} className="table-empty-cell">
            Loading site entries...
          </td>
        </tr>
      );
    }

    if (entries.length === 0) {
      return (
        <tr>
          <td colSpan={4} className="table-empty-cell">
            No results
          </td>
        </tr>
      );
    }

    return entries.map(renderEntryRow);
  }

  return (
    <div className="table-wrapper">
      <table className="directory-table">
        <thead>
          <tr className="table-head-row">
            <th className="th-name">website_name</th>
            <th className="th-desc">website_short_description</th>
            <th className="th-llm-txt">llm_txt</th>
            <th className="th-updated">Last Updated</th>
          </tr>
        </thead>
        <tbody>{renderRows()}</tbody>
      </table>
    </div>
  );
}
