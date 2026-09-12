import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from './client.js';

/**
 * Brings a database up to the latest migration, the same ones `db:migrate` applies (drizzle
 * keeps its own record of what's been applied). Used on the `test` branch before tests run.
 */
export async function migrateDatabase(connectionString: string): Promise<void> {
  const { db, pool } = createDatabase(connectionString, { max: 1 });
  try {
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
    });
  } finally {
    await pool.end();
  }
}

/**
 * The test database, checked: tests create and delete businesses, so they refuse to run on
 * `dev` (Render works there, and its payment-link sender would pick up their links) or on
 * `production`. Undefined when no test database is set up (as in CI): tests skip.
 */
export function testDatabaseUrl(kind: 'pooled' | 'direct'): string | undefined {
  const suffix = kind === 'direct' ? '_DIRECT' : '';
  const url = process.env[`TEST_DATABASE_URL${suffix}`]?.trim();
  if (!url) return undefined;
  for (const other of [`DATABASE_URL${suffix}`, `PRODUCTION_DATABASE_URL${suffix}`]) {
    if (url === process.env[other]?.trim()) {
      throw new Error(
        `TEST_DATABASE_URL${suffix} is the same as ${other}. Tests need the Neon "test" branch of their own.`,
      );
    }
  }
  return url;
}
