import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Migrates the Neon `production` branch (PRODUCTION_DATABASE_URL_DIRECT) from the laptop. It's
 * kept for the pilot: before R1a it gets every migration and Render moves to it. After that,
 * Render's free plan has no pre-deploy step, so run this before pushing code that needs a new
 * migration, once `db:migrate` has been tried on `dev`.
 */
if (existsSync('../../.env')) process.loadEnvFile('../../.env');
const url = process.env.PRODUCTION_DATABASE_URL_DIRECT?.trim();
if (!url) {
  console.error('PRODUCTION_DATABASE_URL_DIRECT is not set in the repo-root .env');
  process.exit(1);
}
console.log(`Migrating the PRODUCTION database at ${new URL(url).host}`);
const result = spawnSync('drizzle-kit', ['migrate'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PLATERAA_DB_TARGET: 'production' },
});
process.exit(result.status ?? 1);
