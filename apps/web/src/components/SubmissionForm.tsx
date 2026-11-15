import React, { useState } from 'react';
import type { CreateSiteEntryRequest } from '@llmstxt/shared-types';

interface SubmissionFormProps {
  onSubmit: (payload: CreateSiteEntryRequest) => Promise<void>;
}

export const SubmissionForm: React.FC<SubmissionFormProps> = ({ onSubmit }) => {
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setStatusMessage(null);
    try {
      await onSubmit({
        website_url: websiteUrl,
        website_short_description: description,
      });
      setWebsiteUrl('');
      setDescription('');
      setStatusMessage('Queued for llms.txt generation!');
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleFormSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        background: '#1e293b',
        padding: '1.5rem',
        borderRadius: '0.75rem',
        border: '1px solid #334155',
      }}
    >
      <div>
        <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 500 }}>
          Website URL
        </label>
        <input
          type="url"
          required
          placeholder="https://docs.example.com"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          style={{
            width: '100%',
            padding: '0.75rem',
            borderRadius: '0.5rem',
            border: '1px solid #475569',
            background: '#0f172a',
            color: '#f8fafc',
          }}
        />
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 500 }}>
          Short Description (optional)
        </label>
        <input
          type="text"
          placeholder="Developer documentation and API guides"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{
            width: '100%',
            padding: '0.75rem',
            borderRadius: '0.5rem',
            border: '1px solid #475569',
            background: '#0f172a',
            color: '#f8fafc',
          }}
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        style={{
          padding: '0.75rem 1.25rem',
          borderRadius: '0.5rem',
          border: 'none',
          background: '#0284c7',
          color: '#fff',
          fontWeight: 600,
          cursor: submitting ? 'not-allowed' : 'pointer',
        }}
      >
        {submitting ? 'Enqueuing...' : 'Generate & Add to Directory'}
      </button>
      {statusMessage && <p style={{ margin: 0, color: '#38bdf8' }}>{statusMessage}</p>}
    </form>
  );
};
