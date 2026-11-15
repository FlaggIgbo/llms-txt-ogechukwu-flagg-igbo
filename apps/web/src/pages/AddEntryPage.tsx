import React from 'react';
import type { CreateSiteEntryRequest } from '@llmstxt/shared-types';
import { SubmissionForm } from '../components/SubmissionForm.js';

interface AddEntryPageProps {
  onSubmit: (payload: CreateSiteEntryRequest) => Promise<void>;
}

export const AddEntryPage: React.FC<AddEntryPageProps> = ({ onSubmit }) => {
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Submit a Website for llms.txt Generation</h2>
      <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
        Submitting a URL pushes a job to the generation queue. Our worker crawls the target site,
        formats <code>llms.txt</code> and <code>llms-full.txt</code>, uploads them to S3, and indexes
        the entry in PostgreSQL and Elasticsearch.
      </p>
      <SubmissionForm onSubmit={onSubmit} />
    </div>
  );
};
