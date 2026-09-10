import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureApp } from '../app.setup';
import { AppModule } from '../app.module';
import { ENV, loadEnv, type Env } from '../config/env';

/** Config for tests that never touch the database (the pool connects lazily, so none is opened). */
export const OFFLINE_TEST_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  DATABASE_URL: 'postgresql://offline@localhost:5432/offline',
  DATABASE_URL_DIRECT: 'postgresql://offline@localhost:5432/offline',
  BETTER_AUTH_SECRET: 'test-better-auth-secret-at-least-32-chars',
  BETTER_AUTH_URL: 'http://localhost:3000',
  SESSION_SIGNING_SECRET: 'test-session-signing-secret-at-least-32-chars',
  TRUSTED_ORIGINS: [],
};

/** True when a real database is configured (locally via .env); integration tests skip otherwise. */
export function hasDatabase(): boolean {
  try {
    loadEnv();
    return true;
  } catch {
    return false;
  }
}

export async function createTestApp(env: Env = OFFLINE_TEST_ENV): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue(env)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app);
  await app.init();
  return app;
}
