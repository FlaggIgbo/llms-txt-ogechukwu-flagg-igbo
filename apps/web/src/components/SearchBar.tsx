import React from 'react';

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ value, onChange }) => {
  return (
    <input
      type="search"
      className="search-input"
      placeholder="Search directory..."
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
};
