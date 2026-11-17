import React from 'react';
import type { SiteEntry } from '@llmstxt/shared-types';
import { resolveLlmTxtUrl, formatDateTime } from './DirectoryTable.js';

// Props for a single site card.
export interface DirectoryCardProps {
  entry: SiteEntry;
}

// Card component for a site entry.
export function DirectoryCard({ entry }: DirectoryCardProps): React.ReactElement {
  const llmTxtUrl = resolveLlmTxtUrl(entry);
  const displayName = entry.website_name || entry.website_url || '—';

  return (
    <article className="directory-card" data-testid={`directory-card-${entry.id}`}>
      <header className="card-header">
        <h3 className="card-title">
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
        </h3>
        {entry.is_updated_latest && (
          <span className="status-badge latest">Up to date</span>
        )}
      </header>

      <p className="card-description">
        {entry.website_short_description || 'No description provided.'}
      </p>

      <footer className="card-footer">
        {llmTxtUrl && (
          <a
            href={llmTxtUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="llm-txt-link"
            title="View .txt file"
          >
            llms.txt <span className="external-arrow">↗</span>
          </a>
        )}
        {entry.updated_at && (
          <span className="card-updated">
            Updated: {formatDateTime(entry.updated_at)}
          </span>
        )}
      </footer>
    </article>
  );
}
