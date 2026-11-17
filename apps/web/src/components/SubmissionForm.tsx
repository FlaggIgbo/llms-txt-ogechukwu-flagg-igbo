import React, { useState } from 'react';
import { type CreateSiteEntryRequest, ApiErrorMessage } from '@llmstxt/shared-types';

// Maximum allowed submissions per day.
export const DAILY_ENTRY_LIMIT = 20;
export const RATE_LIMIT_STORAGE_KEY = 'llmstxt_entry_adds_daily';

// Props for the entry submission form.
export interface SubmissionFormProps {
  onSubmit: (payload: CreateSiteEntryRequest) => Promise<unknown>;
  onNavigateToUpdates?: () => void;
}

// Basic frontend URL validation.
export function isValidUrl(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// Read current user submission count from sessionStorage for today.
export function getSessionSubmissionCount(): number {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return 0;
  }
  try {
    const raw = window.sessionStorage.getItem(RATE_LIMIT_STORAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    const today = new Date().toISOString().slice(0, 10);
    if (parsed.date !== today) {
      return 0;
    }
    return Number(parsed.count) || 0;
  } catch {
    return 0;
  }
}

// Increment user submission count in sessionStorage.
export function recordSessionSubmission(): number {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return 1;
  }
  try {
    const today = new Date().toISOString().slice(0, 10);
    const current = getSessionSubmissionCount();
    const newCount = current + 1;
    window.sessionStorage.setItem(
      RATE_LIMIT_STORAGE_KEY,
      JSON.stringify({ date: today, count: newCount })
    );
    return newCount;
  } catch {
    return 1;
  }
}

// Check if user has exceeded the daily limit via sessionStorage.
export function isSessionRateLimited(): boolean {
  return getSessionSubmissionCount() >= DAILY_ENTRY_LIMIT;
}

// Form for adding a new website to the llms.txt directory.
export function SubmissionForm({ onSubmit, onNavigateToUpdates }: SubmissionFormProps): React.ReactElement {
  const [productName, setProductName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [llmsTxtUrl, setLlmsTxtUrl] = useState('');
  const [llmsFullTxtUrl, setLlmsFullTxtUrl] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');

  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [sessionCount, setSessionCount] = useState<number>(getSessionSubmissionCount);

  const isRateLimited = sessionCount >= DAILY_ENTRY_LIMIT;
  const remainingAdds = Math.max(0, DAILY_ENTRY_LIMIT - sessionCount);

  // Validate all inputs before submitting.
  function validate(): boolean {
    const errors: { [key: string]: string } = {};

    const trimmedUrl = websiteUrl.trim();
    if (!trimmedUrl) {
      errors.websiteUrl = 'Website URL is required.';
    } else if (!isValidUrl(trimmedUrl)) {
      errors.websiteUrl = 'Please enter a valid URL starting with http:// or https:// (e.g., https://example.com).';
    }

    if (llmsTxtUrl.trim() && !isValidUrl(llmsTxtUrl.trim())) {
      errors.llmsTxtUrl = 'Please enter a valid URL starting with http:// or https://';
    }

    if (llmsFullTxtUrl.trim() && !isValidUrl(llmsFullTxtUrl.trim())) {
      errors.llmsFullTxtUrl = 'Please enter a valid URL starting with http:// or https://';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // Handle form submission.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(false);

    // Enforce daily rate limit.
    if (isSessionRateLimited()) {
      setSubmitError(ApiErrorMessage.RATE_LIMIT_EXCEEDED);
      return;
    }

    if (!validate()) {
      return;
    }

    setSubmitting(true);
    try {
      const payload: CreateSiteEntryRequest = {
        website_url: websiteUrl.trim(),
        website_name: productName.trim() || undefined,
        product_name: productName.trim() || undefined,
        llms_txt_url: llmsTxtUrl.trim() || undefined,
        llm_txt: llmsTxtUrl.trim() || undefined,
        llms_txt_storage: llmsTxtUrl.trim() || undefined,
        llms_full_txt_url: llmsFullTxtUrl.trim() || undefined,
        llms_full_txt_storage: llmsFullTxtUrl.trim() || undefined,
        website_short_description: additionalNotes.trim() || undefined,
        additional_notes: additionalNotes.trim() || undefined,
      };

      await onSubmit(payload);

      // Record successful submission in sessionStorage.
      const newCount = recordSessionSubmission();
      setSessionCount(newCount);

      // Reset form on success.
      setProductName('');
      setWebsiteUrl('');
      setLlmsTxtUrl('');
      setLlmsFullTxtUrl('');
      setAdditionalNotes('');
      setFieldErrors({});
      setSubmitSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred while submitting the entry.';
      setSubmitError(msg);
      // If error indicates rate limit, refresh session count.
      if (msg.toLowerCase().includes('exceeded') || msg.toLowerCase().includes('rate limit')) {
        setSessionCount(DAILY_ENTRY_LIMIT);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="submission-form-container">
      {submitSuccess && (
        <div className="form-success-banner" role="status">
          <div className="success-icon">✓</div>
          <div className="success-content">
            <h3 className="success-title">Entry submitted successfully!</h3>
            <p className="success-text">
              Your website has been added to the directory and queued for processing.
            </p>
            {onNavigateToUpdates && (
              <a
                href="#updates"
                className="view-updates-link"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigateToUpdates();
                }}
              >
                View updating entries in the Updates page &rarr;
              </a>
            )}
          </div>
        </div>
      )}

      {isRateLimited && !submitError && (
        <div className="error-banner form-error-banner" role="alert">
          <span>{ApiErrorMessage.RATE_LIMIT_EXCEEDED}</span>
        </div>
      )}

      {submitError && (
        <div className="error-banner form-error-banner" role="alert">
          <span>{submitError}</span>
        </div>
      )}

      <form className="submission-form" onSubmit={handleSubmit} noValidate>
        {/* Rate limit quota note */}
        <div className="rate-limit-badge">
          Daily submission limit: 20 entries per day ({remainingAdds} remaining today)
        </div>

        {/* Product Name */}
        <div className="form-group">
          <label htmlFor="product-name" className="form-label">
            Product Name
          </label>
          <input
            id="product-name"
            type="text"
            className="form-input"
            placeholder="e.g. FastAPI, Anthropic Docs"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            disabled={submitting || isRateLimited}
          />
          <span className="form-help">Optional brand or product title.</span>
        </div>

        {/* Website URL */}
        <div className="form-group">
          <label htmlFor="website-url" className="form-label">
            Website URL <span className="required-star">*</span>
          </label>
          <input
            id="website-url"
            type="url"
            className={`form-input ${fieldErrors.websiteUrl ? 'input-error' : ''}`}
            placeholder="https://example.com"
            value={websiteUrl}
            onChange={(e) => {
              setWebsiteUrl(e.target.value);
              if (fieldErrors.websiteUrl) {
                setFieldErrors((prev) => ({ ...prev, websiteUrl: '' }));
              }
            }}
            disabled={submitting || isRateLimited}
            required
          />
          {fieldErrors.websiteUrl ? (
            <span className="form-field-error" role="alert">
              {fieldErrors.websiteUrl}
            </span>
          ) : (
            <span className="form-help">The primary homepage or documentation URL (required).</span>
          )}
        </div>

        {/* llms.txt URL */}
        <div className="form-group">
          <label htmlFor="llms-txt-url" className="form-label">
            llms.txt URL
          </label>
          <input
            id="llms-txt-url"
            type="url"
            className={`form-input ${fieldErrors.llmsTxtUrl ? 'input-error' : ''}`}
            placeholder="https://example.com/llms.txt"
            value={llmsTxtUrl}
            onChange={(e) => {
              setLlmsTxtUrl(e.target.value);
              if (fieldErrors.llmsTxtUrl) {
                setFieldErrors((prev) => ({ ...prev, llmsTxtUrl: '' }));
              }
            }}
            disabled={submitting || isRateLimited}
          />
          {fieldErrors.llmsTxtUrl ? (
            <span className="form-field-error" role="alert">
              {fieldErrors.llmsTxtUrl}
            </span>
          ) : (
            <span className="form-help">Direct link to your /llms.txt file if already hosted.</span>
          )}
        </div>

        {/* llms-full.txt URL */}
        <div className="form-group">
          <label htmlFor="llms-full-txt-url" className="form-label">
            llms-full.txt URL
          </label>
          <input
            id="llms-full-txt-url"
            type="url"
            className={`form-input ${fieldErrors.llmsFullTxtUrl ? 'input-error' : ''}`}
            placeholder="https://example.com/llms-full.txt"
            value={llmsFullTxtUrl}
            onChange={(e) => {
              setLlmsFullTxtUrl(e.target.value);
              if (fieldErrors.llmsFullTxtUrl) {
                setFieldErrors((prev) => ({ ...prev, llmsFullTxtUrl: '' }));
              }
            }}
            disabled={submitting || isRateLimited}
          />
          {fieldErrors.llmsFullTxtUrl ? (
            <span className="form-field-error" role="alert">
              {fieldErrors.llmsFullTxtUrl}
            </span>
          ) : (
            <span className="form-help">Link to your comprehensive /llms-full.txt file (optional).</span>
          )}
        </div>

        {/* Additional Notes */}
        <div className="form-group">
          <label htmlFor="additional-notes" className="form-label">
            Additional Notes
          </label>
          <textarea
            id="additional-notes"
            className="form-textarea"
            rows={4}
            placeholder="Any context, short description, or notes for indexing and AI agents..."
            value={additionalNotes}
            onChange={(e) => setAdditionalNotes(e.target.value)}
            disabled={submitting || isRateLimited}
          />
          <span className="form-help">Short summary or notes about what this site offers.</span>
        </div>

        {/* Actions */}
        <div className="form-actions">
          <button
            type="submit"
            className="form-submit-button"
            disabled={submitting || isRateLimited}
          >
            {submitting ? 'Submitting...' : isRateLimited ? 'Daily Limit Reached' : 'Submit Entry'}
          </button>
        </div>
      </form>
    </div>
  );
}
