import React from 'react';
import type { CreateSiteEntryRequest } from '@llmstxt/shared-types';

// Props for the add-entry page.
export interface AddEntryPageProps {
  onSubmit: (payload: CreateSiteEntryRequest) => Promise<void>;
}

// Placeholder page for submitting a website.
export function AddEntryPage(_props: AddEntryPageProps): React.ReactElement | null {
  return null;
}
