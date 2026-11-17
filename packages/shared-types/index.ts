// Possible states of a site entry.
export enum EntryStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

// Canonical error codes for site entries.
export enum EntryErrorCode {
  DUPLICATE_URL = 'DUPLICATE_URL',
  CRAWL_FAILED = 'CRAWL_FAILED',
  PROBE_TIMEOUT = 'PROBE_TIMEOUT',
  INVALID_URL = 'INVALID_URL',
  GENERATION_FAILED = 'GENERATION_FAILED',
}

// Canonical error messages for site entries.
export enum EntryErrorMessage {
  DUPLICATE_URL = 'Website URL already exists in site_entries table',
  GENERATION_FAILED = 'Failed to crawl and generate llms.txt files after 3 attempts',
  PROBE_TIMEOUT = 'Probe timeout',
}

// Canonical API error codes.
export enum ApiErrorCode {
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  DATABASE_ERROR = 'DATABASE_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SEARCH_FAILED = 'SEARCH_FAILED',
}

// Canonical API error messages.
export enum ApiErrorMessage {
  FORBIDDEN = 'Forbidden',
  NOT_FOUND = 'File not found',
  CONFLICT = 'Conflict',
  DUPLICATE_URL = 'Website URL already exists in site_entries table',
  RATE_LIMIT_EXCEEDED = 'You have exceeded your allowed entry adds for today (maximum 20 entries per day). Please try again tomorrow.',
  WEBSITE_URL_REQUIRED = 'website_url is required',
  GET_ENTRIES_FAILED = 'Failed to retrieve site entries from database',
  CREATE_ENTRY_FAILED = 'Failed to create site entry',
  SEARCH_FAILED = 'Search failed',
}

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
  error_message?: string | null;
  error_code?: EntryErrorCode | string | null;
  is_scheduled_update?: boolean;
  created_at: string;
  updated_at: string;
}

// Input for adding a new website.
export interface CreateSiteEntryRequest {
  website_url: string;
  website_name?: string;
  product_name?: string;
  website_short_description?: string;
  additional_notes?: string;
  llms_txt_url?: string;
  llm_txt?: string;
  llms_txt_storage?: string;
  llms_full_txt_url?: string;
  llms_full_txt_storage?: string;
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

// Status of a background job.
export type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'DEAD_LETTER';

// Record of a background job in the queue and DLQ.
export interface BackgroundJob {
  id: string;
  entry_id: string;
  website_url: string;
  is_scheduled_update: boolean;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
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
export enum SiteCategory {
  API_DOCS = 'api_docs',
  BLOG = 'blog',
  MARKETING = 'marketing',
}

// Record of a site's update cadence and schedule.
export interface SiteCadence {
  site_id: string;
  url: string;
  site_category: SiteCategory | string | null;
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

// Standard API error payload.
export interface ApiErrorResponse {
  error: string;
  code?: ApiErrorCode | string;
  retryAfter?: number;
}

// Query parameters for GET /entries.
export interface GetEntriesQueryParams {
  status?: EntryStatus | 'pending' | 'updating' | string;
}

// Response body for GET /entries.
export type GetEntriesResponse = SiteEntry[] | ApiErrorResponse;

// Response body for POST /entries.
export type CreateSiteEntryResponse = SiteEntry | ApiErrorResponse;

// Response body for GET /search.
export type SearchEntriesResponse =
  | SearchResult
  | (ApiErrorResponse & { entries: SiteEntry[]; total: number });

// Typed HTTP request message parameterized by request body and query params.
export interface TypedApiRequest<
  TBody = unknown,
  TQuery = Record<string, string | undefined>
> {
  url?: string;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  socket: { remoteAddress?: string };
  body?: TBody;
  query?: TQuery;
  on(event: 'data', listener: (chunk: any) => void): this;
  on(event: 'end', listener: () => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
}

// Typed HTTP response message parameterized by response JSON payload.
export interface TypedApiResponse<TResponseBody = unknown> {
  readonly __responseType?: TResponseBody;
  writeHead(statusCode: number, headers?: Record<string, string>): this;
  setHeader(name: string, value: number | string | readonly string[]): this;
  end(chunk?: any): this;
}

// Endpoint-specific request and response message types for GET /entries.
export type GetEntriesRequest = TypedApiRequest<never, GetEntriesQueryParams>;
export type GetEntriesResponseMessage = TypedApiResponse<GetEntriesResponse>;

// Endpoint-specific request and response message types for POST /entries.
export type PostEntryRequest = TypedApiRequest<CreateSiteEntryRequest>;
export type PostEntryResponseMessage = TypedApiResponse<CreateSiteEntryResponse>;

// Endpoint-specific request and response message types for GET /search.
export type SearchEntriesRequest = TypedApiRequest<never, SearchQuery>;
export type SearchEntriesResponseMessage = TypedApiResponse<SearchEntriesResponse>;
