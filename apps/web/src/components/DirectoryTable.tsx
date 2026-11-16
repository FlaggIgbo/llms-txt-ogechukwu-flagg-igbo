import React from 'react';
import type { SiteEntry } from '@llmstxt/shared-types';

export interface DirectoryTableProps {
  entries: SiteEntry[];
  loading?: boolean;
  error?: string | null;
}

function resolveLlmTxtUrl(entry: SiteEntry): string {
  if (entry.llm_txt) {
    return entry.llm_txt;
  }
  if (entry.llms_txt_storage && (entry.llms_txt_storage.startsWith('http://') || entry.llms_txt_storage.startsWith('https://'))) {
    return entry.llms_txt_storage;
  }
  if (entry.website_url) {
    return `${entry.website_url.replace(/\/+$/, '')}/llms.txt`;
  }
  return '';
}

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

export const DirectoryTable: React.FC<DirectoryTableProps> = ({
  entries,
  loading = false,
  error = null,
}) => {
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
        <tbody>
          {loading && entries.length === 0 ? (
            <tr>
              <td colSpan={4} className="table-empty-cell">
                Loading site entries...
              </td>
            </tr>
          ) : entries.length === 0 ? (
            error ? null : (
              <tr>
                <td colSpan={4} className="table-empty-cell">
                  No results
                </td>
              </tr>
            )
          ) : (
            entries.map((entry) => {
              const llmTxtUrl = resolveLlmTxtUrl(entry);
              return (
                <tr key={entry.id} className="table-row">
                  {/* website_name */}
                  <td className="cell-name">
                    {entry.website_url ? (
                      <a
                        href={entry.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="site-link"
                      >
                        {entry.website_name || entry.website_url}
                      </a>
                    ) : (
                      entry.website_name || '—'
                    )}
                  </td>

                  {/* website_short_description */}
                  <td className="cell-desc">
                    {entry.website_short_description || '—'}
                  </td>

                  {/* llm_txt (url that would open the text file) */}
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

                  {/* updated_at */}
                  <td className="cell-updated">
                    {formatDate(entry.updated_at)}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

