import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Settings come from the repo-root .env, like the API's. Only VITE_ keys reach the browser.
  envDir: '../..',
});
