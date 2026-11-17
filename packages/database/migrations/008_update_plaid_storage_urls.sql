-- Migration 008: Update Plaid documentation storage URLs to canonical official plaid.com/docs endpoints
UPDATE site_entries
SET llms_txt_storage = 'https://plaid.com/docs/llms.txt',
    llms_full_txt_storage = 'https://plaid.com/docs/llms-full.txt',
    updated_at = NOW()
WHERE website_url = 'https://plaid.com/docs'
   OR website_url = 'https://plaid.com/docs/'
   OR website_name ILIKE '%plaid%'
   OR llms_txt_storage ILIKE '%plaid.com_docs%';
