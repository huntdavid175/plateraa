import { defineConfig } from 'vitest/config';

/**
 * The offline stress run (`pnpm --filter @plateraa/mobile stress`): the tablet's real sync engine
 * against the real API on the Neon `test` branch, over a connection that keeps failing. Kept out
 * of `pnpm test` because it makes hundreds of round trips to Frankfurt.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.stress.ts'],
    globalSetup: ['./src/offline/testing/stress-server.ts'],
    testTimeout: 30 * 60_000,
    hookTimeout: 5 * 60_000,
    fileParallelism: false,
    // All six scenarios at once: each has its own business and tablet.
    maxConcurrency: 6,
  },
});
