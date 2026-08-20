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
