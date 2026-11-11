/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps every URL relative, so the site works under /rsi-trainer/ on GitHub Pages.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { environment: 'node' },
});
