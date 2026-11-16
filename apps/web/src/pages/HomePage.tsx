import React from 'react';
import type { SiteEntry } from '@llmstxt/shared-types';

// Props for the home page.
export interface HomePageProps {
  entries: SiteEntry[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

// Placeholder home page component.
export function HomePage(_props: HomePageProps): React.ReactElement | null {
  return null;
}
