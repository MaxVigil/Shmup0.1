import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  publicDir: 'assets/runtime',
  build: {
    sourcemap: false,
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@bootstrap': fileURLToPath(new URL('./src/bootstrap', import.meta.url)),
      '@domain': fileURLToPath(new URL('./src/domain', import.meta.url)),
      '@content': fileURLToPath(new URL('./src/content', import.meta.url)),
      '@application': fileURLToPath(
        new URL('./src/application', import.meta.url),
      ),
      '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
      '@combat-presentation': fileURLToPath(
        new URL('./src/combat-presentation', import.meta.url),
      ),
      '@platform': fileURLToPath(new URL('./src/platform', import.meta.url)),
      '@test-support': fileURLToPath(
        new URL('./src/test-support', import.meta.url),
      ),
    },
  },
});
