const SENTRY_DSN =
  process.env.SENTRY_DSN ||
  'https://7daee2a1d48df207d91c86b0fee15cf3@o4512439839096833.ingest.us.sentry.io/4512439858888704';

// Check if running in local development or test mode.
function checkIsDev(): boolean {
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') return true;
  if (!process.env.NODE_ENV && !process.env.SENTRY_ENVIRONMENT) return true;
  return false;
}

const isDev = checkIsDev();
let sentryClient: any = null;

// Lazily load Sentry only when needed outside dev/test.
async function getSentryClient(): Promise<any> {
  if (isDev) return null;
  if (!sentryClient) {
    try {
      sentryClient = await import('@sentry/node');
    } catch {
      sentryClient = null;
    }
  }
  return sentryClient;
}

// Initialize Sentry error tracking.
export async function initSentry(): Promise<void> {
  if (isDev) return;
  const sentry = await getSentryClient();
  sentry?.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 0.1,
  });
}

// Log an info message (console in dev, Sentry in prod).
export function logInfo(message: string, ...optionalParams: unknown[]): void {
  if (isDev) {
    console.log(message, ...optionalParams);
  } else {
    void getSentryClient().then((sentry) => {
      sentry?.captureMessage(message, 'info');
    });
  }
}

// Log a warning message (console in dev, Sentry in prod).
export function logWarn(message: string, ...optionalParams: unknown[]): void {
  if (isDev) {
    console.warn(message, ...optionalParams);
  } else {
    void getSentryClient().then((sentry) => {
      sentry?.captureMessage(message, 'warning');
    });
  }
}

// Log an error (console in dev, Sentry in prod).
export function logError(error: unknown, context?: Record<string, unknown>): void {
  if (isDev) {
    console.error(error);
    return;
  }

  void getSentryClient().then((sentry) => {
    if (!sentry) return;
    if (error instanceof Error) {
      sentry.captureException(error, { extra: context });
    } else {
      sentry.captureMessage(String(error), 'error');
    }
  });
}

