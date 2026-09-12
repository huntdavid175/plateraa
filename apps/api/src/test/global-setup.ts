import { existsSync } from 'node:fs';
import { migrateDatabase, testDatabaseUrl } from '@plateraa/db';

/** Before the tests run: the `test` branch gets the latest migrations (nothing to do in CI). */
export default async function setup() {
  if (existsSync('../../.env')) process.loadEnvFile('../../.env');
  const url = testDatabaseUrl('direct');
  if (url) await migrateDatabase(url);
}
