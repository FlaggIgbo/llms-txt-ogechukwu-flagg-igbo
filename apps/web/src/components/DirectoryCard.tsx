import React from 'react';
import type { SiteEntry } from '@llmstxt/shared-types';

interface DirectoryCardProps {
  entry: SiteEntry;
}

export const DirectoryCard: React.FC<DirectoryCardProps> = ({ entry }) => {
  return (
    <div
      style={{
        padding: '1.25rem',
        borderRadius: '0.75rem',
        border: '1px solid #334155',
        background: '#1e293b',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <a
          href={entry.website_url}
          target="_blank"
          rel="noreferrer"
          style={{ color: '#38bdf8', fontWeight: 600, fontSize: '1.1rem', textDecoration: 'none' }}
        >
          {entry.website_url}
        </a>
        <span
          style={{
            fontSize: '0.75rem',
            padding: '0.2rem 0.6rem',
            borderRadius: '999px',
            background: entry.is_updated_latest ? '#065f46' : '#78350f',
            color: entry.is_updated_latest ? '#6ee7b7' : '#fcd34d',
          }}
        >
          {entry.status} {entry.is_updated_latest ? '• Up to date' : '• Queued'}
        </span>
      </div>
      <p style={{ margin: 0, color: '#cbd5e1', fontSize: '0.95rem' }}>
        {entry.website_short_description || 'Generating description from site crawl...'}
      </p>
      {entry.llms_txt_storage && (
        <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.25rem' }}>
          Storage: <code>{entry.llms_txt_storage}</code>
        </div>
      )}
    </div>
  );
};
