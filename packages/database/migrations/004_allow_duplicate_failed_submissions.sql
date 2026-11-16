-- Migration: Update unique constraint on website_url to only apply to COMPLETED entries.
-- This allows duplicate user submissions to be tracked and displayed with FAILED status and error messages.

ALTER TABLE site_entries DROP CONSTRAINT IF EXISTS site_entries_website_url_key;
DROP INDEX IF EXISTS idx_site_entries_website_url;
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_entries_completed_url ON site_entries (website_url) WHERE status = 'COMPLETED';
CREATE INDEX IF NOT EXISTS idx_site_entries_website_url ON site_entries (website_url);

