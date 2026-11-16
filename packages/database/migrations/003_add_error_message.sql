-- Migration: Add error_message and is_scheduled_update to site_entries.

ALTER TABLE site_entries ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE site_entries ADD COLUMN IF NOT EXISTS is_scheduled_update BOOLEAN NOT NULL DEFAULT FALSE;

