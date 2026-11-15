export type EntryStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface SiteEntry {
  id: string;
  website_url: string;
  website_short_description: string;
  is_updated_latest: boolean;
  llms_txt_storage: string | null;
  llms_full_txt_storage: string | null;
  status: EntryStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateSiteEntryRequest {
  website_url: string;
  website_short_description?: string;
}

export interface SearchQuery {
  q: string;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  entries: SiteEntry[];
  total: number;
}

export interface GenerateJobPayload {
  entryId: string;
  websiteUrl: string;
  isScheduledUpdate?: boolean;
}

export interface UpdateLog {
  id: string;
  entry_id: string;
  website_url: string;
  checked_at: string;
  was_stale: boolean;
  regenerated: boolean;
  s3_log_key: string;
  error_message?: string;
}
