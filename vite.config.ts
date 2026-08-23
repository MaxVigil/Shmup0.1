import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Runtime manifest assets (publicDir) are served as cacheable: the bounded Boot
 * preload requests each approved manifest asset once, and later CSS mask
 * (Icon) and Phaser renders reuse those prepared URLs without a new network
 * request (standard browser HTTP caching is allowed, Master §5.6; MASTER-AC-014).
 */
function cacheableRuntimeAssets(): Plugin {
  const runtimeAssetCache = (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): void => {
    const url = req.url ?? '';
    if (
      url.startsWith('/icons/') ||
      url.startsWith('/fonts/') ||
      url.startsWith('/backgrounds/') ||
      url.startsWith('/aircraft/')
    ) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
    next();
  };
  return {
    name: 'cacheable-runtime-assets',
    configureServer(server) {
      server.middlewares.use(runtimeAssetCache);
    },
    configurePreviewServer(server) {
      server.middlewares.use(runtimeAssetCache);
    },
  };
}

export default defineConfig({
  base: './',
  publicDir: 'assets/runtime',
  build: {
    sourcemap: false,
  },
  plugins: [react(), cacheableRuntimeAssets()],
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
