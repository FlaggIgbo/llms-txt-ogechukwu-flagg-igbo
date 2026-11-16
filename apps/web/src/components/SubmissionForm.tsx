import React from 'react';
import type { CreateSiteEntryRequest } from '@llmstxt/shared-types';

// Props for the entry submission form.
export interface SubmissionFormProps {
  onSubmit: (payload: CreateSiteEntryRequest) => Promise<void>;
}

// Placeholder form for adding a new website.
export function SubmissionForm(_props: SubmissionFormProps): React.ReactElement | null {
  return null;
}
