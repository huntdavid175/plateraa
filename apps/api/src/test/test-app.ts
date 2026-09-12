import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { testDatabaseUrl } from '@plateraa/db';
import { configureApp } from '../app.setup';
import { AppModule } from '../app.module';
import { ENV, loadEnv, type Env } from '../config/env';
import { MOOLRE, type MoolreApi } from '../payments/moolre';

/** Config for tests that never touch the database (the pool connects lazily, so none is opened). */
export const OFFLINE_TEST_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  DATABASE_URL: 'postgresql://offline@localhost:5432/offline',
  DATABASE_URL_DIRECT: 'postgresql://offline@localhost:5432/offline',
  BETTER_AUTH_SECRET: 'test-better-auth-secret-at-least-32-chars',
  BETTER_AUTH_URL: 'http://localhost:3000',
  SESSION_SIGNING_SECRET: 'test-session-signing-secret-at-least-32-chars',
  MOOLRE_BASE_URL: 'https://sandbox.moolre.com',
  PAYMENT_LINK_MINUTES: 60,
  RUN_PAYMENT_LINKS: false,
  TRUSTED_ORIGINS: [],
};

/**
 * True when the Neon `test` branch is configured (locally, TEST_DATABASE_URL in .env);
 * integration tests skip otherwise, as in CI. It can't be `dev` or `production`
 * (`testDatabaseUrl` throws): tests create and delete businesses, and Render's payment-link
 * sender works on `dev`.
 */
export function hasDatabase(): boolean {
  try {
    loadEnv();
  } catch {
    return false;
  }
  return Boolean(testDatabaseUrl('pooled') && testDatabaseUrl('direct'));
}

/** The app's settings, pointed at the `test` branch. */
export function testEnv(): Env {
  return {
    ...loadEnv(),
    DATABASE_URL: testDatabaseUrl('pooled')!,
    DATABASE_URL_DIRECT: testDatabaseUrl('direct')!,
  };
}

/** The real app, with a pretend Moolre when a test gives one. */
export async function createTestApp(
  env: Env = OFFLINE_TEST_ENV,
  overrides: { moolre?: MoolreApi } = {},
): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue(env);
  if (overrides.moolre) builder = builder.overrideProvider(MOOLRE).useValue(overrides.moolre);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app);
  await app.init();
  return app;
}
