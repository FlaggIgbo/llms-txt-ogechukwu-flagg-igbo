import React from 'react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ value, onChange }) => {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search websites or descriptions (powered by Elasticsearch)..."
        style={{
          width: '100%',
          padding: '0.85rem 1rem',
          borderRadius: '0.5rem',
          border: '1px solid #334155',
          background: '#1e293b',
          color: '#f8fafc',
          fontSize: '1rem',
        }}
      />
    </div>
  );
};
