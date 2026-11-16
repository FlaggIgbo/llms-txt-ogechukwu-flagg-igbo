// Possible states of a site entry.
export type EntryStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

// A website record in the directory.
export interface SiteEntry {
  id: string;
  website_name?: string;
  website_url: string;
  website_short_description: string;
  is_updated_latest: boolean;
  llms_txt_storage: string | null;
  llms_full_txt_storage: string | null;
  llm_txt?: string | null;
  status: EntryStatus;
  created_at: string;
  updated_at: string;
}

// Input for adding a new website.
export interface CreateSiteEntryRequest {
  website_url: string;
  website_short_description?: string;
}

// Parameters for searching entries.
export interface SearchQuery {
  q: string;
  limit?: number;
  offset?: number;
}

// Paginated search response.
export interface SearchResult {
  entries: SiteEntry[];
  total: number;
}

// Data sent to the background worker queue.
export interface GenerateJobPayload {
  entryId: string;
  websiteUrl: string;
  isScheduledUpdate?: boolean;
}

// Status of a cadence check.
export type CadenceStatus = 'idle' | 'queued' | 'processing';

// Known category types for a website.
export type SiteCategory = 'api_docs' | 'blog' | 'marketing';

// Record of a site's update cadence and schedule.
export interface SiteCadence {
  site_id: string;
  url: string;
  site_category: string | null;
  check_interval_hours: number;
  unchanged_streak: number;
  etag: string | null;
  last_modified: string | null;
  last_content_hash: string | null;
  last_checked_at: string | null;
  next_check_at: string;
  status: CadenceStatus;
}

// Record of a scheduled site check.
export interface UpdateLog {
  id: string;
  entry_id: string;
  website_url: string;
  checked_at: string;
  was_stale: boolean;
  regenerated: boolean;
  r2_log_key: string;
  error_message?: string;
}
