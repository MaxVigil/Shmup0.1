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

describe('aircraft preload reuse (Combat §12.7, MASTER-AC-014, V02-WI-02 C02)', () => {
  const AIRCRAFT_PATH = '/aircraft/german-fighter.png';

  /** Stubs every non-aircraft manifest load so only the aircraft resolves. */
  function stubNonAircraftFailures(): void {
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
  }

  it('prepares the aircraft bytes as an inline data URI when they load and decode', async () => {
    vi.useFakeTimers();
    stubNonAircraftFailures();
    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer;
    vi.stubGlobal('fetch', (input: string | URL) =>
      String(input).includes(AIRCRAFT_PATH)
        ? Promise.resolve({
            ok: true,
            arrayBuffer: () => Promise.resolve(pngBytes),
          })
        : Promise.resolve({ ok: false }),
    );
    const decodeSpy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      'Image',
      class {
        src = '';
        decode(): Promise<void> {
          return decodeSpy();
        }
      },
    );

    const resultPromise = preloadRuntimeAssets();
    // Flush the aircraft fetch → arrayBuffer → base64 → decode → settle
    // microtask chain before the deadline timer fires (mirrors the enemy-image
    // ready test pattern).
    for (let i = 0; i < 6; i += 1) {
      await Promise.resolve();
    }
    vi.advanceTimersByTime(PRELOAD_DEADLINE_MS);
    const result = await resultPromise;

    const aircraft = result.find((asset) => asset.id === 'german-fighter');
    expect(aircraft).toBeDefined();
    expect(aircraft?.status).toBe('ready');
    // The prepared bytes are carried as an inline data URI (a string — never
    // a DOM element), so Combat reuses them with no second network request.
    expect(aircraft?.imageDataUri).toMatch(/^data:image\/png;base64,/);
    expect(aircraft?.imageDataUri?.length).toBeGreaterThan(16);
    expect(decodeSpy).toHaveBeenCalled();
  });

  it('keeps the aircraft on its stable fallback with no data source when the fetch fails', async () => {
    vi.useFakeTimers();
    stubNonAircraftFailures();
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: false }));
    vi.stubGlobal(
      'Image',
      class {
        src = '';
        decode(): Promise<void> {
          return Promise.resolve();
        }
      },
    );

    const resultPromise = preloadRuntimeAssets();
    vi.advanceTimersByTime(PRELOAD_DEADLINE_MS);
    const result = await resultPromise;

    const aircraft = result.find((asset) => asset.id === 'german-fighter');
    expect(aircraft?.status).toBe('fallback');
    expect(aircraft?.imageDataUri).toBeUndefined();
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

  /**
   * Serves the five enemy PNG requests with raw bytes so the prepared-bytes
   * path (`fetch` → `arrayBuffer` → inline data URI) can settle. Every other
   * manifest request fails.
   */
  function stubEnemyBytes(fetched: string[]): void {
    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer;
    vi.stubGlobal('fetch', (input: string | URL) => {
      const url = String(input);
      if (!ENEMY_PATHS.some((path) => url.includes(path))) {
        return Promise.resolve({ ok: false });
      }
      fetched.push(url);
      return Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(pngBytes),
      });
    });
  }

  /** jsdom Image stub: records the decoded sources (the prepared inline bytes). */
  function stubDecodingImages(): string[] {
    const decoded: string[] = [];
    vi.stubGlobal(
      'Image',
      class {
        src = '';
        decode(): Promise<void> {
          decoded.push(this.src);
          return Promise.resolve();
        }
      },
    );
    return decoded;
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

  it('marks all five enemy images ready with their prepared bytes when they load and decode before the deadline', async () => {
    vi.useFakeTimers();
    stubNonImageFailures();
    const fetched: string[] = [];
    stubEnemyBytes(fetched);
    const decoded = stubDecodingImages();

    const resultPromise = preloadRuntimeAssets();
    // Flush the fetch → arrayBuffer → base64 → decode → settle microtask chain
    // before the deadline timer fires.
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve();
    }
    vi.advanceTimersByTime(PRELOAD_DEADLINE_MS);
    const result = await resultPromise;

    const enemyReady = result.filter((asset) => asset.kind === 'enemy-image');
    expect(enemyReady).toHaveLength(5);
    for (const asset of enemyReady) {
      expect(asset.status).toBe('ready');
      // V02-AC-025: the prepared bytes travel with the ready result so Combat
      // decodes them instead of re-requesting the manifest asset.
      expect(asset.imageDataUri).toMatch(/^data:image\/png;base64,/);
      expect(asset.imageDataUri?.length).toBeGreaterThan(16);
    }
    // Exactly one manifest request per enemy sprite, and every decode used the
    // prepared inline source (never the runtime URL) — no second request path.
    expect(fetched).toHaveLength(5);
    expect(new Set(fetched).size).toBe(5);
    expect(decoded).toHaveLength(5);
    for (const source of decoded) {
      expect(source).toMatch(/^data:image\/png;base64,/);
    }
  });

  it('keeps enemy images on their stable fallback when the deadline fires and late completions are inert', async () => {
    vi.useFakeTimers();
    stubNonImageFailures();
    const pending: Array<
      (value: { ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }) => void
    > = [];
    vi.stubGlobal('fetch', (input: string | URL) =>
      ENEMY_PATHS.some((path) => String(input).includes(path))
        ? new Promise((resolve) => {
            pending.push(resolve);
          })
        : Promise.resolve({ ok: false }),
    );
    stubDecodingImages();

    const resultPromise = preloadRuntimeAssets();
    await Promise.resolve();
    vi.advanceTimersByTime(PRELOAD_DEADLINE_MS);
    const result = await resultPromise;
    for (const asset of result) {
      expect(asset.status).toBe('fallback');
      expect(asset.imageDataUri).toBeUndefined();
    }

    // Late completions after the deadline are inert: the produced result is
    // stable for the complete page-load session (Master §5.6, MASTER-AC-013),
    // so a settled-late enemy asset can never replace its fallback.
    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer;
    for (const resolve of pending) {
      resolve({ ok: true, arrayBuffer: () => Promise.resolve(pngBytes) });
    }
    for (let i = 0; i < 6; i += 1) {
      await Promise.resolve();
    }
    for (const asset of result) {
      expect(asset.status).toBe('fallback');
      expect(asset.imageDataUri).toBeUndefined();
    }
  });
});
