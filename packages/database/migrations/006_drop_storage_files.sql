-- Drop the storage_files table as file contents are stored exclusively in Cloudflare R2
DROP TABLE IF EXISTS storage_files CASCADE;

