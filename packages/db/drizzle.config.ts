import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// Locally the connection strings live in the repo-root .env; in CI they come from the environment.
if (existsSync('../../.env')) process.loadEnvFile('../../.env');

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  casing: 'snake_case',
  // Migrations run as the owner over the direct (unpooled) connection.
  dbCredentials: { url: process.env.DATABASE_URL_DIRECT ?? '' },
  strict: true,
  verbose: true,
});
