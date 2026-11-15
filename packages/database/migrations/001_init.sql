-- 001_init.sql: Initial PostgreSQL schema for llmstxt-directory

CREATE TYPE entry_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE IF NOT EXISTS site_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_url TEXT NOT NULL UNIQUE,
  website_short_description TEXT NOT NULL DEFAULT '',
  is_updated_latest BOOLEAN NOT NULL DEFAULT FALSE,
  llms_txt_storage TEXT,
  llms_full_txt_storage TEXT,
  status entry_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_entries_website_url ON site_entries (website_url);
CREATE INDEX IF NOT EXISTS idx_site_entries_is_updated_latest ON site_entries (is_updated_latest);
