import React from 'react';
import type { SiteEntry } from '@llmstxt/shared-types';

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

// Get the llms.txt URL for an entry.
export function resolveLlmTxtUrl(entry: SiteEntry): string {
  if (entry.llm_txt) {
    return entry.llm_txt;
  }

  const storageUrl = entry.llms_txt_storage || '';
  if (storageUrl.startsWith('http://') || storageUrl.startsWith('https://')) {
    return storageUrl;
  }

  // Handle Cloudflare R2 paths.
  if (storageUrl.startsWith('r2://')) {
    const publicBase = (import.meta as any).env?.VITE_R2_PUBLIC_URL || '';
    if (publicBase) {
      const pathWithoutPrefix = storageUrl.slice(5);
      const parts = pathWithoutPrefix.split('/');
      const key = parts.slice(1).join('/');
      const cleanBase = publicBase.endsWith('/') ? publicBase.slice(0, -1) : publicBase;
      return `${cleanBase}/${key}`;
    }
  }

  // Fallback to website URL with /llms.txt.
  if (entry.website_url) {
    return `${trimTrailingSlashes(entry.website_url)}/llms.txt`;
  }

  return '';
}

// Format an ISO date string into a readable date.
function formatDate(isoString: string): string {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
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

      {/* Last updated date */}
      <td className="cell-updated">
        {formatDate(entry.updated_at)}
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
            <th className="th-updated">updated_at</th>
          </tr>
        </thead>
        <tbody>{renderRows()}</tbody>
      </table>
    </div>
  );
}
