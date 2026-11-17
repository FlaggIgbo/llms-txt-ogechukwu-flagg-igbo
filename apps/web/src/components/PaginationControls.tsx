import React from 'react';

export interface PaginationControlsProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

// Navigation controls for paginated lists: Back button, Page count, and Forward button.
export function PaginationControls({
  page,
  totalPages,
  onPageChange,
  disabled = false,
}: PaginationControlsProps): React.ReactElement {
  const safeTotalPages = Math.max(1, totalPages);
  const isBackDisabled = disabled || page <= 1;
  const isForwardDisabled = disabled || page >= safeTotalPages;

  return (
    <div
      className="pagination-controls"
      role="navigation"
      aria-label="Pagination Navigation"
    >
      <button
        type="button"
        className="pagination-btn pagination-back"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={isBackDisabled}
        aria-label="Previous page (Back)"
      >
        Back
      </button>
      <span className="pagination-info">
        {`Page ${page} of ${safeTotalPages}`}
      </span>
      <button
        type="button"
        className="pagination-btn pagination-forward"
        onClick={() => onPageChange(Math.min(safeTotalPages, page + 1))}
        disabled={isForwardDisabled}
        aria-label="Next page (Forward)"
      >
        Forward
      </button>
    </div>
  );
}

export default PaginationControls;
