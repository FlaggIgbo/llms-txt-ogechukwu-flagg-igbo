import React from 'react';
import type { SiteEntry } from '@llmstxt/shared-types';

export interface HomePageProps {
  entries: SiteEntry[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export const HomePage: React.FC<HomePageProps> = (_props) => {
  return null;
};
