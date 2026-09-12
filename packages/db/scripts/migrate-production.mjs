import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Migrates the LIVE database (the one Render uses) from the laptop. Render's free plan has no
 * pre-deploy step, so run this before pushing code that needs a new migration, after
 * `db:migrate` has been tried on the development branch.
 */
if (existsSync('../../.env')) process.loadEnvFile('../../.env');
const url = process.env.PRODUCTION_DATABASE_URL_DIRECT;
if (!url) {
  console.error('PRODUCTION_DATABASE_URL_DIRECT is not set in the repo-root .env');
  process.exit(1);
}
console.log(`Migrating the LIVE database at ${new URL(url).host}`);
const result = spawnSync('drizzle-kit', ['migrate'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PLATERAA_DB_TARGET: 'production' },
});
process.exit(result.status ?? 1);
