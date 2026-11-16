import React from 'react';
import type { CreateSiteEntryRequest } from '@llmstxt/shared-types';
import { SubmissionForm } from '../components/SubmissionForm';

// Props for the add-entry page.
export interface AddEntryPageProps {
  onSubmit: (payload: CreateSiteEntryRequest) => Promise<unknown>;
  onNavigateToUpdates?: () => void;
}

// Page allowing users to submit a website serving llms.txt files.
export function AddEntryPage({ onSubmit, onNavigateToUpdates }: AddEntryPageProps): React.ReactElement {
  return (
    <div className="add-entry-page">
      <div className="page-header">
        <h2 className="page-title">Submit a Website</h2>
        <p className="page-description">
          Add your website or API documentation to the llms.txt directory. Enter the URL where
          AI agents can discover your documentation or where you host a <code className="directory-code">/llms.txt</code> file.
        </p>
      </div>

      <SubmissionForm onSubmit={onSubmit} onNavigateToUpdates={onNavigateToUpdates} />
    </div>
  );
}
