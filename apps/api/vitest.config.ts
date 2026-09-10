import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Vitest transpiles with esbuild, which can't emit decorator metadata; Nest DI needs it, so use SWC.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.spec.ts'],
    // Integration specs make real round trips to Neon and hash with Argon2.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
