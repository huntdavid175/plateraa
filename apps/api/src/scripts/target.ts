import type { Env } from '../config/env';

/**
 * Which database a setup script works on: the laptop's own development database, or, with
 * `--production`, the live one Render uses (real vendors, and the tablet's test business).
 */
export function scriptTarget(env: Env, argv: string[] = process.argv.slice(2)) {
  const production = argv.includes('--production');
  const args = argv.filter((arg) => arg !== '--production');
  if (!production) return { url: env.DATABASE_URL, args, label: 'the development database' };
  if (!env.PRODUCTION_DATABASE_URL) {
    throw new Error(
      'PRODUCTION_DATABASE_URL is not set in .env, so --production has nowhere to go',
    );
  }
  return { url: env.PRODUCTION_DATABASE_URL, args, label: 'the LIVE database' };
}
