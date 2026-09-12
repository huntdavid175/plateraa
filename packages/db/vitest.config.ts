import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Integration tests talk to the Neon "test" branch; they skip themselves when
// TEST_DATABASE_URL_DIRECT isn't set (e.g. CI). It's brought up to date before they run.
if (existsSync('../../.env')) process.loadEnvFile('../../.env');

export default defineConfig({
  test: {
    globalSetup: ['./src/testing/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
