import type { NestExpressApplication } from '@nestjs/platform-express';
import { toNodeHandler } from 'better-auth/node';
import compression from 'compression';
import { AUTH, type Auth } from './auth/auth.factory';
import { ENV, type Env } from './config/env';

/** Shared by main.ts and the tests, so both run exactly the same app. */
export function configureApp(app: NestExpressApplication): void {
  const env = app.get<Env>(ENV);
  const auth = app.get<Auth>(AUTH);

  app.enableCors({ origin: env.TRUSTED_ORIGINS, credentials: true });
  // Vendors pay for data by the megabyte: gzip every response big enough to benefit.
  app.use(compression());

  // Better Auth reads the raw request body, so it's mounted before any JSON parsing.
  app.getHttpAdapter().getInstance().all('/api/auth/*splat', toNodeHandler(auth));
  app.useBodyParser('json', { limit: '1mb' });

  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
}
