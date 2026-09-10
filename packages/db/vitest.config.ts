import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Integration tests talk to Neon; they skip themselves when DATABASE_URL_DIRECT isn't set (e.g. CI).
if (existsSync('../../.env')) process.loadEnvFile('../../.env');

export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
