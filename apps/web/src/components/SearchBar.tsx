import React from 'react';

// Props for the search input.
export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

// Text input for filtering directory entries.
export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <input
      type="search"
      className="search-input"
      placeholder="Search directory..."
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
