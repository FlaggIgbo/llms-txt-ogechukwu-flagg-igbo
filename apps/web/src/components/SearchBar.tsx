import React from 'react';

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export const SearchBar: React.FC<SearchBarProps> = (_props) => {
  return null;
};
