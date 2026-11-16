-- Initial database schema.

-- Entry status options.
CREATE TYPE entry_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- Main directory table.
CREATE TABLE IF NOT EXISTS site_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_name TEXT NOT NULL DEFAULT '',
  website_url TEXT NOT NULL UNIQUE,
  website_short_description TEXT NOT NULL DEFAULT '',
  is_updated_latest BOOLEAN NOT NULL DEFAULT FALSE,
  llms_txt_storage TEXT,
  llms_full_txt_storage TEXT,
  status entry_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lookup and search indexes.
CREATE INDEX IF NOT EXISTS idx_site_entries_website_url ON site_entries (website_url);
CREATE INDEX IF NOT EXISTS idx_site_entries_is_updated_latest ON site_entries (is_updated_latest);
CREATE INDEX IF NOT EXISTS idx_site_entries_search ON site_entries USING gin (
  to_tsvector('english', coalesce(website_name, '') || ' ' || coalesce(website_short_description, '') || ' ' || coalesce(website_url, ''))
);

-- Default seed data.
INSERT INTO site_entries (
  id,
  website_name,
  website_url,
  website_short_description,
  is_updated_latest,
  llms_txt_storage,
  llms_full_txt_storage,
  status,
  created_at,
  updated_at
) VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'FastAPI',
    'https://fastapi.tiangolo.com',
    'FastAPI framework, high performance, easy to learn, fast to code, ready for production',
    TRUE,
    'https://fastapi.tiangolo.com/llms.txt',
    'https://fastapi.tiangolo.com/llms-full.txt',
    'COMPLETED',
    '2026-11-01T10:00:00.000Z',
    '2026-11-14T14:22:10.000Z'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'Anthropic Docs',
    'https://docs.anthropic.com',
    'Anthropic API, Claude models documentation, guides, and SDK reference.',
    TRUE,
    'https://docs.anthropic.com/llms.txt',
    'https://docs.anthropic.com/llms-full.txt',
    'COMPLETED',
    '2026-11-02T12:00:00.000Z',
    '2026-11-15T09:15:30.000Z'
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'llmstxt.org',
    'https://llmstxt.org',
    'The official standard specification for /llms.txt and /llms-full.txt website discovery.',
    TRUE,
    'https://llmstxt.org/llms.txt',
    NULL,
    'COMPLETED',
    '2026-10-15T08:30:00.000Z',
    '2026-11-12T18:45:00.000Z'
  ),
  (
    '00000000-0000-0000-0000-000000000004',
    'Hugging Face',
    'https://huggingface.co',
    'The platform where the machine learning community collaborates on models, datasets, and applications.',
    TRUE,
    'https://huggingface.co/llms.txt',
    'https://huggingface.co/llms-full.txt',
    'COMPLETED',
    '2026-11-05T16:20:00.000Z',
    '2026-11-15T19:00:00.000Z'
  )
ON CONFLICT (website_url) DO UPDATE SET
  website_name = EXCLUDED.website_name,
  website_short_description = EXCLUDED.website_short_description,
  is_updated_latest = EXCLUDED.is_updated_latest,
  llms_txt_storage = EXCLUDED.llms_txt_storage,
  llms_full_txt_storage = EXCLUDED.llms_full_txt_storage,
  status = EXCLUDED.status,
  updated_at = EXCLUDED.updated_at;
