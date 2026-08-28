import { afterEach, describe, expect, it, vi } from 'vitest';
import { RUNTIME_ASSET_MANIFEST } from './runtime-asset-catalogue';
import {
  PRELOAD_DEADLINE_MS,
  buildFallbackPreloadResult,
  preloadRuntimeAssets,
  raceSettledOrDeadline,
} from './preload';

const originalFonts = document.fonts;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: originalFonts,
  });
});

describe('buildFallbackPreloadResult', () => {
  it('returns the complete approved manifest with every entry marked fallback', () => {
    const fallback = buildFallbackPreloadResult();
    expect(fallback).toHaveLength(RUNTIME_ASSET_MANIFEST.length);
    fallback.forEach((asset, index) => {
      const entry = RUNTIME_ASSET_MANIFEST[index];
      expect(asset.id).toBe(entry?.id);
      expect(asset.kind).toBe(entry?.kind);
      expect(asset.sourcePath).toBe(entry?.sourcePath);
      expect(asset.status).toBe('fallback');
    });
  });
});

describe('raceSettledOrDeadline', () => {
  it('resolves with every value when all loads settle before the deadline', async () => {
    const result = await raceSettledOrDeadline(
      [Promise.resolve('ready'), Promise.resolve('ready')],
      PRELOAD_DEADLINE_MS,
    );
    expect(result).toEqual(['ready', 'ready']);
  });

  it('marks still-pending loads as undefined when the deadline fires', async () => {
    vi.useFakeTimers();
    let resolveFirst: ((value: string) => void) | undefined;
    const first = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    const pending = new Promise<string>(() => {
      // Never settles: Boot must still leave Boot View at the deadline.
    });
    const resultPromise = raceSettledOrDeadline([first, pending], 5000);
    resolveFirst?.('ready');
    await Promise.resolve();
    vi.advanceTimersByTime(5000);
    await expect(resultPromise).resolves.toEqual(['ready', undefined]);
  });

  it('is inert to late settlements after the deadline', async () => {
    vi.useFakeTimers();
    let resolveLate: ((value: string) => void) | undefined;
    const late = new Promise<string>((resolve) => {
      resolveLate = resolve;
    });
    const resultPromise = raceSettledOrDeadline([late], 5000);
    vi.advanceTimersByTime(5000);
    await expect(resultPromise).resolves.toEqual([undefined]);
    // A late completion must not change the already-resolved outcome.
    resolveLate?.('ready');
    await Promise.resolve();
    await expect(resultPromise).resolves.toEqual([undefined]);
  });

  it('resolves immediately for an empty load list', async () => {
    const result = await raceSettledOrDeadline<string>([], 5000);
    expect(result).toEqual([]);
  });

  it('does not activate a font that completes after the deadline', async () => {
    vi.useFakeTimers();
    const addedFaces: unknown[] = [];
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { add: (face: unknown) => addedFaces.push(face) },
    });
    const pendingFaces: Array<() => void> = [];
    class ControlledFontFace {
      load(): Promise<ControlledFontFace> {
        return new Promise((resolve) => {
          pendingFaces.push(() => resolve(this));
        });
      }
    }
    vi.stubGlobal('FontFace', ControlledFontFace);
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: false }));

    const resultPromise = preloadRuntimeAssets();
    vi.advanceTimersByTime(PRELOAD_DEADLINE_MS);
    const result = await resultPromise;

    // At the deadline every asset uses its fallback because none resolved.
    for (const asset of result) {
      expect(asset.status).toBe('fallback');
    }
    expect(addedFaces).toEqual([]);

    // Late font completions must not activate anything: they are inert and
    // cannot replace their fallback or change layout.
    for (const resolveFace of pendingFaces) {
      resolveFace();
    }
    await Promise.resolve();
    await Promise.resolve();
    expect(addedFaces).toEqual([]);
  });

  it('resolves with complete-manifest fallback status when every asset fails', async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { add: () => {} },
    });
    class RejectingFontFace {
      load(): Promise<RejectingFontFace> {
        return Promise.reject(new Error('font load failed'));
      }
    }
    vi.stubGlobal('FontFace', RejectingFontFace);
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: false }));

    const resultPromise = preloadRuntimeAssets();
    vi.advanceTimersByTime(PRELOAD_DEADLINE_MS);
    const result = await resultPromise;

    expect(result).toHaveLength(RUNTIME_ASSET_MANIFEST.length);
    for (const asset of result) {
      expect(asset.status).toBe('fallback');
    }
  });
});

describe('enemy image preload behaviour (V02-WI-01)', () => {
  const ENEMY_PATHS = [
    '/enemies/basic-drone.png',
    '/enemies/ranged-drone.png',
    '/enemies/hunter-drone.png',
    '/enemies/elite-drone-armoured.png',
    '/enemies/elite-drone-vulnerable.png',
  ];

  /** jsdom Image stub: captures instances so the test controls load/decode. */
  function stubControlledImages(): Array<{
    src: string;
    onload: (() => void) | null;
  }> {
    const instances: Array<{
      src: string;
      onload: (() => void) | null;
    }> = [];
    vi.stubGlobal(
      'Image',
      class {
        src = '';
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        decode(): Promise<void> {
          return Promise.resolve();
        }
        constructor() {
          instances.push(this);
        }
      },
    );
    return instances;
  }

  function stubNonImageFailures(): void {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { add: () => {} },
    });
    vi.stubGlobal(
      'FontFace',
      class {
        load(): Promise<never> {
          return Promise.reject(new Error('font load failed'));
        }
      },
    );
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: false }));
  }

  it('reports every enemy entry with the typed prepared-or-fallback shape', () => {
    const fallback = buildFallbackPreloadResult();
    const enemyEntries = fallback.filter(
      (asset) => asset.kind === 'enemy-image',
    );
    expect(enemyEntries).toHaveLength(5);
    expect(enemyEntries.map((asset) => asset.id)).toEqual([
      'enemy-basic-drone',
      'enemy-ranged-drone',
      'enemy-hunter-drone',
      'enemy-elite-drone-armoured',
      'enemy-elite-drone-vulnerable',
    ]);
    for (const asset of enemyEntries) {
      expect(asset.status).toBe('fallback');
      expect(ENEMY_PATHS.some((path) => asset.url.includes(path))).toBe(true);
    }
  });

  it('marks all five enemy images ready when they load and decode before the deadline', async () => {
    vi.useFakeTimers();
    const instances = stubControlledImages();
    stubNonImageFailures();

    const resultPromise = preloadRuntimeAssets();
    await Promise.resolve();
    const enemyImages = instances.filter((image) =>
      ENEMY_PATHS.some((path) => image.src.includes(path)),
    );
    expect(enemyImages).toHaveLength(5);
    for (const image of enemyImages) {
      image.onload?.();
    }
    // Decode microtasks settle before the non-enemy loads reach the deadline.
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(PRELOAD_DEADLINE_MS);
    const result = await resultPromise;

    const enemyReady = result.filter((asset) => asset.kind === 'enemy-image');
    expect(enemyReady).toHaveLength(5);
    for (const asset of enemyReady) {
      expect(asset.status).toBe('ready');
    }
  });

  it('keeps enemy images on their stable fallback when the deadline fires and late loads are inert', async () => {
    vi.useFakeTimers();
    const instances = stubControlledImages();
    stubNonImageFailures();

    const resultPromise = preloadRuntimeAssets();
    await Promise.resolve();
    const enemyImages = instances.filter((image) =>
      ENEMY_PATHS.some((path) => image.src.includes(path)),
    );
    expect(enemyImages).toHaveLength(5);

    vi.advanceTimersByTime(PRELOAD_DEADLINE_MS);
    const result = await resultPromise;
    for (const asset of result) {
      expect(asset.status).toBe('fallback');
    }

    // Late completions after the deadline are inert: the produced result is
    // stable for the complete page-load session (Master §5.6, MASTER-AC-013).
    for (const image of enemyImages) {
      image.onload?.();
    }
    await Promise.resolve();
    await Promise.resolve();
    for (const asset of result) {
      expect(asset.status).toBe('fallback');
    }
  });
});
