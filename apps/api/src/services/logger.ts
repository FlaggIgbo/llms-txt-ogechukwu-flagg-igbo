import * as Sentry from '@sentry/node';

const SENTRY_DSN =
  process.env.SENTRY_DSN ||
  'https://7daee2a1d48df207d91c86b0fee15cf3@o4512439839096833.ingest.us.sentry.io/4512439858888704';

// Check if running in local dev mode.
function checkIsDev(): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  if (!process.env.NODE_ENV && !process.env.SENTRY_ENVIRONMENT) return true;
  return false;
}

const isDev = checkIsDev();

// Initialize Sentry error tracking.
export function initSentry(): void {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: isDev ? 1.0 : 0.1,
  });
}

// Log an info message.
export function logInfo(message: string, ...optionalParams: unknown[]): void {
  if (isDev) {
    console.log(message, ...optionalParams);
  } else {
    Sentry.captureMessage(message, 'info');
  }
}

// Log a warning message.
export function logWarn(message: string, ...optionalParams: unknown[]): void {
  if (isDev) {
    console.warn(message, ...optionalParams);
  } else {
    Sentry.captureMessage(message, 'warning');
  }
}

// Log an error to console or Sentry.
export function logError(error: unknown, context?: Record<string, unknown>): void {
  if (isDev) {
    console.error(error);
    return;
  }

  if (error instanceof Error) {
    Sentry.captureException(error, { extra: context });
  } else {
    Sentry.captureMessage(String(error), 'error');
  }
}
