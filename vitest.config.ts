import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  define: {
    // Unit tests always run the ordinary-build behaviour (evidence counters
    // and benchmark scenarios compile-time disabled); the evidence builds are
    // validated by the browser harnesses and the artifact-hygiene regression.
    __SHMUP_EVIDENCE_SCENARIOS__: 'false',
    __SHMUP_EVIDENCE_COUNTERS__: 'false',
  },
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
  test: {
    environment: 'jsdom',
    exclude: [
      ...configDefaults.exclude,
      'e2e/**',
      // V02-WI-04 C05: the evidence-integrity mutation suite runs under the
      // Node built-in test runner (`npm run evidence:mutation`) after all
      // evidence records are regenerated; it must never be collected by
      // Vitest's default include pattern.
      'scripts/evidence-integrity.mutation.test.mjs',
    ],
  },
});
