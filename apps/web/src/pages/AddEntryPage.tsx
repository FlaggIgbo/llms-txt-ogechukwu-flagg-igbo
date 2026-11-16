import React from 'react';
import type { CreateSiteEntryRequest } from '@llmstxt/shared-types';

export interface AddEntryPageProps {
  onSubmit: (payload: CreateSiteEntryRequest) => Promise<void>;
}

export const AddEntryPage: React.FC<AddEntryPageProps> = (_props) => {
  return null;
};
