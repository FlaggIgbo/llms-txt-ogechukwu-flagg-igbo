import React, { useState, useEffect, useRef } from 'react';

// Props for the search input.
export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  loading?: boolean;
  placeholder?: string;
  debounceMs?: number;
}

// Debounced search input with immediate UI responsiveness and an inline loading spinner.
export function SearchBar({
  value,
  onChange,
  loading = false,
  placeholder = 'Search directory...',
  debounceMs = 300,
}: SearchBarProps) {
  // Local state provides immediate keystroke feedback while debouncing parent updates.
  const [localValue, setLocalValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync with external prop changes (e.g., cleared filters).
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Cancel pending debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Update input immediately, then delay firing onChange until typing pauses.
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

  // Bypass debounce on Enter to trigger search immediately.
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
      {/* Visual spinner indicator shown during active queries */}
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
