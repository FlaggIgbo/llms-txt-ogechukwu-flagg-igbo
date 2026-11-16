import React from 'react';
import type { CreateSiteEntryRequest } from '@llmstxt/shared-types';

export interface SubmissionFormProps {
  onSubmit: (payload: CreateSiteEntryRequest) => Promise<void>;
}

export const SubmissionForm: React.FC<SubmissionFormProps> = (_props) => {
  return null;
};
