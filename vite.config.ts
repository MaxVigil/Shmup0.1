import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { formatBuildIdentifier } from './src/platform/diagnostics/build-identifier.ts';

/**
 * Delivery §4 / Master §7.11: one build identifier is available in console
 * diagnostics and performance records but is never displayed in normal player
 * UI. S14-WI01: the identifier must truthfully reflect the git state — an
 * uncommitted candidate is labelled `-dirty` and cannot masquerade as a clean
 * committed revision. `git` absence falls back to a stable `unknown` revision
 * rather than failing the build.
 */
function resolveBuildIdentifier(): string {
  let revision = 'unknown';
  let dirty = false;
  try {
    revision = execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const porcelain = execSync('git status --porcelain', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    dirty = porcelain.length > 0;
  } catch {
    // Not a git checkout: the stable fallback keeps the build reproducible.
  }
  const manifest = JSON.parse(
    readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
  ) as { version: string };
  return formatBuildIdentifier({ version: manifest.version, revision, dirty });
}

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
  define: {
    __APP_BUILD_IDENTIFIER__: JSON.stringify(resolveBuildIdentifier()),
    // V02-WI-04 C03/C04 two-pass performance evidence. The benchmark-scenario
    // capability (`SHMUP_EVIDENCE=1`) and the workload-counter capability
    // (`SHMUP_EVIDENCE_COUNTERS=1`) are independent compile-time flags:
    // `build:evidence` enables both (Pass A), `build:evidence-uninstrumented`
    // enables scenarios only so the post-integration legacy timing run carries
    // the workload identity but no instrumentation, and the ordinary
    // production build enables neither (dead code eliminated).
    __SHMUP_EVIDENCE_SCENARIOS__:
      process.env.SHMUP_EVIDENCE === '1' ||
      process.env.SHMUP_EVIDENCE_COUNTERS === '1'
        ? 'true'
        : 'false',
    __SHMUP_EVIDENCE_COUNTERS__:
      process.env.SHMUP_EVIDENCE_COUNTERS === '1' ? 'true' : 'false',
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
