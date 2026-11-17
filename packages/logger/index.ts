let sentryClient: any = null;

// Lazily load Sentry module.
export async function getSentryClient(): Promise<any> {
  if (!sentryClient) {
    try {
      sentryClient = await import('@sentry/node');
    } catch {
      sentryClient = null;
    }
  }
  return sentryClient;
}

// Initialize Sentry error tracking if a DSN is available.
export async function initSentry(customDsn?: string): Promise<any> {
  const dsn = customDsn || process.env.SENTRY_DSN;
  if (!dsn) return null;

  const sentry = await getSentryClient();
  if (sentry && !sentry.isInitialized?.()) {
    sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'production',
      tracesSampleRate: 0.1,
    });
  }
  return sentry;
}

// Log an info message (console + Sentry if initialized).
export function logInfo(message: string, ...optionalParams: unknown[]): void {
  console.log(message, ...optionalParams);
  if (process.env.SENTRY_DSN) {
    void getSentryClient().then((sentry) => {
      if (sentry?.isInitialized?.()) {
        sentry.captureMessage(message, 'info');
      }
    });
  }
}

// Log a warning message (console + Sentry if initialized).
export function logWarn(message: string, ...optionalParams: unknown[]): void {
  console.warn(message, ...optionalParams);
  if (process.env.SENTRY_DSN) {
    void getSentryClient().then((sentry) => {
      if (sentry?.isInitialized?.()) {
        sentry.captureMessage(message, 'warning');
      }
    });
  }
}

// Log an error (always to console.error + Sentry if available).
export function logError(error: unknown, context?: Record<string, unknown>): void {
  console.error(error, context ? JSON.stringify(context) : '');

  void getSentryClient().then((sentry) => {
    if (!sentry) return;
    if (!sentry.isInitialized?.() && process.env.SENTRY_DSN) {
      sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'production',
        tracesSampleRate: 0.1,
      });
    }
    if (error instanceof Error) {
      sentry.captureException(error, { extra: context });
    } else {
      sentry.captureMessage(String(error), { level: 'error', extra: context });
    }
  });
}
