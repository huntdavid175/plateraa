import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Settings come from the repo-root .env, like the API's. Only VITE_ keys reach the browser.
  envDir: '../..',
  // 5173 is the vendor dashboard's.
  server: { port: 5174, strictPort: true },
});
