-- Migration 007: Clean up historical failed and duplicate test entries from site_entries
DELETE FROM site_entries
WHERE status = 'FAILED'
  OR error_code = 'DUPLICATE_URL'
  OR website_name ILIKE '%Test%'
  OR website_url IN (SELECT website_url FROM site_entries WHERE status = 'COMPLETED' AND id != site_entries.id);
