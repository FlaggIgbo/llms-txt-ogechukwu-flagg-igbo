-- Migration: Add site_cadence table for update scheduling.

CREATE TABLE IF NOT EXISTS site_cadence (
  site_id UUID PRIMARY KEY REFERENCES site_entries(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  site_category TEXT,
  check_interval_hours INT NOT NULL DEFAULT 24,
  unchanged_streak INT NOT NULL DEFAULT 0,
  etag TEXT,
  last_modified TEXT,
  last_content_hash TEXT,
  last_checked_at TIMESTAMPTZ,
  next_check_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'idle'
);

-- Partial index for fast lookup of due and idle sites.
CREATE INDEX IF NOT EXISTS idx_site_cadence_due 
ON site_cadence (next_check_at) 
WHERE status = 'idle';

-- Insert default cadence rows for any existing entries.
INSERT INTO site_cadence (site_id, url, site_category, check_interval_hours, next_check_at, status)
SELECT id, website_url, 'api_docs', 168, NOW() + INTERVAL '7 days', 'idle'
FROM site_entries
ON CONFLICT (site_id) DO NOTHING;

