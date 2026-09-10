import { account, session, user, verification, type Database } from '@plateraa/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';
import type { Env } from '../config/env';
import { hashSecret, verifySecret } from './secrets';

export const AUTH = Symbol('AUTH');

/**
 * Email logins for owners and managers (dashboard, and registering a phone). Staff never use
 * this: they unlock a registered phone with a PIN. The bearer plugin lets the phone send the
 * session as an Authorization header instead of a cookie.
 */
export function createAuth(db: Database, env: Env) {
  return betterAuth({
    appName: 'Plateraa',
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: env.TRUSTED_ORIGINS,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      password: {
        hash: hashSecret,
        verify: ({ hash, password }) => verifySecret(hash, password),
      },
    },
    plugins: [bearer()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
