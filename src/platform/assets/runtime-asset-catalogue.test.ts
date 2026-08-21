/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest';
import {
  RUNTIME_ASSET_MANIFEST,
  normalizeRuntimeAssetUrl,
  resolveRuntimeAssetUrl,
} from './runtime-asset-catalogue';

describe('runtime asset manifest', () => {
  it('defines exactly the twelve approved runtime assets', () => {
    expect(RUNTIME_ASSET_MANIFEST).toHaveLength(12);
  });

  it('contains only paths under assets/runtime', () => {
    for (const entry of RUNTIME_ASSET_MANIFEST) {
      expect(entry.sourcePath.startsWith('assets/runtime/')).toBe(true);
    }
  });

  it('has unique ids and unique paths', () => {
    const ids = new Set<string>();
    const paths = new Set<string>();
    for (const entry of RUNTIME_ASSET_MANIFEST) {
      ids.add(entry.id);
      paths.add(entry.sourcePath);
    }
    expect(ids.size).toBe(RUNTIME_ASSET_MANIFEST.length);
    expect(paths.size).toBe(RUNTIME_ASSET_MANIFEST.length);
  });

  it('matches the approved Master §5.6 asset list', () => {
    expect(
      RUNTIME_ASSET_MANIFEST.map((entry) => entry.sourcePath).sort(),
    ).toEqual([
      'assets/runtime/aircraft/german-fighter.png',
      'assets/runtime/backgrounds/hangar-background.webp',
      'assets/runtime/backgrounds/operations-background.webp',
      'assets/runtime/fonts/ibm-plex-mono-medium.woff2',
      'assets/runtime/fonts/ibm-plex-mono-regular.woff2',
      'assets/runtime/fonts/ibm-plex-mono-semibold.woff2',
      'assets/runtime/icons/check.svg',
      'assets/runtime/icons/crosshair.svg',
      'assets/runtime/icons/gear.svg',
      'assets/runtime/icons/map-trifold.svg',
      'assets/runtime/icons/pause.svg',
      'assets/runtime/icons/warehouse.svg',
    ]);
  });
});

describe('resolveRuntimeAssetUrl', () => {
  it('resolves a manifest path below the configured base', () => {
    expect(
      resolveRuntimeAssetUrl(
        'assets/runtime/backgrounds/operations-background.webp',
      ),
    ).toBe(`${import.meta.env.BASE_URL}backgrounds/operations-background.webp`);
  });
});

describe('normalizeRuntimeAssetUrl', () => {
  it('keeps root-relative URLs unchanged', () => {
    expect(
      normalizeRuntimeAssetUrl('/icons/gear.svg', 'http://localhost:4174/'),
    ).toBe('/icons/gear.svg');
  });

  it('resolves a relative ./ URL against the document base (production build)', () => {
    // S04 regression: with `base: './'` the production build produced
    // `./icons/...`, which CSS mask-image consumers resolve against the
    // stylesheet origin (`/assets/icons/...`) instead of the document base.
    expect(
      normalizeRuntimeAssetUrl('./icons/gear.svg', 'http://localhost:4174/'),
    ).toBe('http://localhost:4174/icons/gear.svg');
  });

  it('resolves a relative ../ URL against the document base', () => {
    expect(
      normalizeRuntimeAssetUrl('../icons/gear.svg', 'http://localhost:4174/'),
    ).toBe('http://localhost:4174/icons/gear.svg');
  });
});
