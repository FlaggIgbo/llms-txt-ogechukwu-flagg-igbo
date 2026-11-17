import React, { useState, useEffect, useRef } from 'react';

// Props for the search input.
export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  loading?: boolean;
  placeholder?: string;
  debounceMs?: number;
}

// Text input with debounced updates and a loading spinner for filtering directory entries.
export function SearchBar({
  value,
  onChange,
  loading = false,
  placeholder = 'Search directory...',
  debounceMs = 300,
}: SearchBarProps) {
  const [localValue, setLocalValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external value changes (e.g. clear/reset).
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Clean up timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newVal = e.target.value;
    setLocalValue(newVal);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      onChange(newVal);
    }, debounceMs);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      onChange(localValue);
    }
  }

  return (
    <div className="search-bar-wrapper">
      <input
        type="search"
        className={`search-input ${loading ? 'search-loading' : ''}`}
        placeholder={placeholder}
        value={localValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
      {loading && (
        <span
          className="search-spinner"
          aria-label="Searching..."
          role="status"
        />
      )}
    </div>
  );
}
