import { existsSync } from 'node:fs';
import { z } from 'zod';

export const ENV = Symbol('ENV');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Pooled Neon connection: all request-time queries. */
  DATABASE_URL: z.url(),
  /** Direct Neon connection: migrations and the pg-boss worker. */
  DATABASE_URL_DIRECT: z.url(),
  /**
   * The live database, on the laptop only: setup scripts run with `--production` use it. On
   * Render, DATABASE_URL itself is the live one; on the laptop it's the development branch.
   */
  PRODUCTION_DATABASE_URL: z.url().optional(),
  /** Where this API reports its errors (Sentry). Set on Render only; unset, nothing is sent. */
  SENTRY_DSN: z.url().optional(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  /** Signs the 15-minute PIN session tokens the tablet app uses. */
  SESSION_SIGNING_SECRET: z.string().min(32),
  /** Moolre's API: https://sandbox.moolre.com while testing, https://api.moolre.com live. */
  MOOLRE_BASE_URL: z.url().default('https://api.moolre.com'),
  /**
   * Encrypts each vendor's Moolre key at rest: 32 random bytes, base64url. Losing it means
   * entering every vendor's key again. Payment links can't go out without it.
   */
  SECRETS_KEY: z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/, 'must be 32 random bytes, base64url')
    .optional(),
  /** Our Moolre SMS account, which texts payment links to customers. */
  MOOLRE_SMS_VASKEY: z.string().min(1).optional(),
  /** The approved sender name customers see on the text (at most 11 characters). */
  MOOLRE_SMS_SENDER_ID: z.string().min(1).max(11).optional(),
  /** How long a payment link stays open, in minutes. */
  PAYMENT_LINK_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
  /**
   * Whether this process makes, texts and checks payment links. On for the deployed API only:
   * a laptop sharing the database must never pick up real customers' links.
   */
  RUN_PAYMENT_LINKS: z.stringbool().default(false),
  /** Comma-separated browser origins allowed to call the auth endpoints (the dashboard). */
  TRUSTED_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Reads and validates configuration once at startup; the process refuses to start on bad config.
 * Locally the values come from the repo-root .env (the API runs from apps/api); in production
 * they come from the host's environment.
 */
export function loadEnv(): Env {
  if (existsSync('../../.env')) process.loadEnvFile('../../.env');
  // An empty line (`KEY=`) means "not filled in yet", not a value, so it can't block startup.
  const values = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined && value !== ''),
  );
  const result = envSchema.safeParse(values);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid environment:\n  ${problems.join('\n  ')}`);
  }
  return result.data;
}
