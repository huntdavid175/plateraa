import type { Env } from '../config/env';

/**
 * Which database a setup script works on: the `dev` branch (which Render and the tablet also use
 * during development), or, with `--production`, the `production` branch kept for the pilot.
 */
export function scriptTarget(env: Env, argv: string[] = process.argv.slice(2)) {
  const production = argv.includes('--production');
  const args = argv.filter((arg) => arg !== '--production');
  if (!production) return { url: env.DATABASE_URL, args, label: 'the dev database' };
  if (!env.PRODUCTION_DATABASE_URL) {
    throw new Error(
      'PRODUCTION_DATABASE_URL is not set in .env, so --production has nowhere to go',
    );
  }
  return { url: env.PRODUCTION_DATABASE_URL, args, label: 'the PRODUCTION database' };
}
