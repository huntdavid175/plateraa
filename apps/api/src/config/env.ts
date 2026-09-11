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
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  /** Signs the 15-minute PIN session tokens the tablet app uses. */
  SESSION_SIGNING_SECRET: z.string().min(32),
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
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid environment:\n  ${problems.join('\n  ')}`);
  }
  return result.data;
}
