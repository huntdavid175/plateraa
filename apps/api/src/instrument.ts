import { existsSync } from 'node:fs';
import * as Sentry from '@sentry/nestjs';

/**
 * Error reporting (Sentry, EU region). Imported first in main.ts, before the rest of the app
 * loads, so Sentry can see every module. Only the deployed API has SENTRY_DSN set; without it
 * nothing is sent. No personal data: customers' phone numbers, IP addresses and cookies stay out.
 */
if (existsSync('../../.env')) process.loadEnvFile('../../.env');

const dsn = process.env.SENTRY_DSN?.trim();
if (dsn) {
  Sentry.init({
    dsn,
    // Render sets RENDER and RENDER_GIT_COMMIT on its servers.
    environment: process.env.RENDER ? 'production' : 'development',
    release: process.env.RENDER_GIT_COMMIT,
    sendDefaultPii: false,
    // Errors only; performance tracing would eat the free quota.
    tracesSampleRate: 0,
  });
}
