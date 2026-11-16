import React from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { App } from './App.js';

// Read Vite environment variables.
const env = (import.meta as any).env || {};
const isDev = Boolean(env.DEV);
const SENTRY_DSN =
  env.VITE_SENTRY_DSN ||
  'https://c31c0dc7176c8888ea11bca0a9523173@o4512439839096833.ingest.us.sentry.io/4512439858298880';

// Initialize Sentry error tracking.
Sentry.init({
  dsn: SENTRY_DSN,
  environment: env.MODE || 'production',
  tracesSampleRate: isDev ? 1.0 : 0.1,
});

// Mount the React app.
const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
