import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// Locally the connection strings live in the repo-root .env; in CI they come from the environment.
if (existsSync('../../.env')) process.loadEnvFile('../../.env');

// DATABASE_URL_DIRECT is the Neon `dev` branch. `db:migrate:production` sets
// PLATERAA_DB_TARGET=production to migrate the `production` branch (kept for the pilot) instead.
const production = process.env.PLATERAA_DB_TARGET === 'production';
const url = production
  ? process.env.PRODUCTION_DATABASE_URL_DIRECT
  : process.env.DATABASE_URL_DIRECT;
if (production && !url) throw new Error('PRODUCTION_DATABASE_URL_DIRECT is not set in .env');

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  casing: 'snake_case',
  // Migrations run as the owner over the direct (unpooled) connection.
  dbCredentials: { url: url ?? '' },
  strict: true,
  verbose: true,
});
