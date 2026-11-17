import {
  type SearchEntriesRequest,
  type SearchEntriesResponseMessage,
  type SearchEntriesResponse,
  ApiErrorCode,
  ApiErrorMessage,
} from '@llmstxt/shared-types';
import { searchService } from '../services/searchService.js';
import { logError } from '../services/logger.js';
import { formatEntryStorageUrls, sendJsonResponse } from './entries.js';

// Search entries using URL query parameters.
export async function handleSearch(
  req: SearchEntriesRequest,
  res: SearchEntriesResponseMessage
): Promise<void> {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const q = req.query?.q ?? (url.searchParams.get('q') || '');
    const limit = Number(req.query?.limit ?? (url.searchParams.get('limit') || '50'));
    const offset = Number(req.query?.offset ?? (url.searchParams.get('offset') || '0'));

    const result = await searchService.searchEntries({ q, limit, offset });
    const formattedResult: SearchEntriesResponse = {
      ...result,
      entries: result.entries.map(formatEntryStorageUrls),
    };

    sendJsonResponse(res, 200, formattedResult);
  } catch (error) {
    logError(error, { endpoint: 'GET /search' });
    sendJsonResponse(res, 500, {
      error: ApiErrorMessage.SEARCH_FAILED,
      code: ApiErrorCode.SEARCH_FAILED,
      entries: [],
      total: 0,
    });
  }
}
