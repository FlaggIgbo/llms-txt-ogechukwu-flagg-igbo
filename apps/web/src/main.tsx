import React from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { App } from './App.js';

const isDev = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV ?? false;
const SENTRY_DSN =
  (import.meta as unknown as { env?: { VITE_SENTRY_DSN?: string } }).env?.VITE_SENTRY_DSN ||
  'https://c31c0dc7176c8888ea11bca0a9523173@o4512439839096833.ingest.us.sentry.io/4512439858298880';

Sentry.init({
  dsn: SENTRY_DSN,
  environment: (import.meta as unknown as { env?: { MODE?: string } }).env?.MODE || 'production',
  tracesSampleRate: isDev ? 1.0 : 0.1,
});

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
