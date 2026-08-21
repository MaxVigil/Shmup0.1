import type {
  AssetPreloadResult,
  PreparedRuntimeAsset,
  RuntimeAssetPreload,
} from '@application/ports';
import {
  RUNTIME_ASSET_MANIFEST,
  resolveRuntimeAssetUrl,
} from './runtime-asset-catalogue';
import type { RuntimeAssetManifestEntry } from './runtime-asset-catalogue';

/** Approved Boot safety deadline (Master §5.6 / §7.10). */
export const PRELOAD_DEADLINE_MS = 5000;

export function createBrowserAssetPreload(): RuntimeAssetPreload {
  return {
    preload: () => preloadRuntimeAssets(),
    fallbackResult: () => buildFallbackPreloadResult(),
  };
}

/**
 * The complete approved manifest with every entry marked `fallback`
 * (S02-WI02). Manifest ownership stays in `src/platform/assets/`; the
 * application owner uses this when a preload port rejects.
 */
export function buildFallbackPreloadResult(): AssetPreloadResult {
  return RUNTIME_ASSET_MANIFEST.map((entry): PreparedRuntimeAsset => ({
    id: entry.id,
    kind: entry.kind,
    sourcePath: entry.sourcePath,
    url: resolveRuntimeAssetUrl(entry.sourcePath),
    status: 'fallback',
  }));
}

/**
 * Starts every approved manifest request in parallel and resolves when all
 * requests settle or the deadline elapses, whichever comes first. Late
 * completions are genuinely inert: once the result is produced, no late loader
 * may perform an activation side effect (for example adding a font to
 * `document.fonts`). A preload infrastructure failure never rejects; it
 * resolves with stable fallback status for the complete approved manifest.
 */
export function preloadRuntimeAssets(): Promise<
  readonly PreparedRuntimeAsset[]
> {
  let closed = false;
  const loads = RUNTIME_ASSET_MANIFEST.map((entry) => {
    try {
      return loadAsset(entry, () => closed);
    } catch {
      return Promise.resolve(false);
    }
  });
  return raceSettledOrDeadline(loads, PRELOAD_DEADLINE_MS)
    .then((results): readonly PreparedRuntimeAsset[] => {
      // Result produced: from here on, late loader completions are inert.
      closed = true;
      return RUNTIME_ASSET_MANIFEST.map(
        (entry, index): PreparedRuntimeAsset => ({
          id: entry.id,
          kind: entry.kind,
          sourcePath: entry.sourcePath,
          url: resolveRuntimeAssetUrl(entry.sourcePath),
          status: results[index] === true ? 'ready' : 'fallback',
        }),
      );
    })
    .catch((): readonly PreparedRuntimeAsset[] =>
      // Non-critical by contract (MASTER-AC-003): an infrastructure failure
      // never blocks startup; the complete approved manifest uses its stable
      // fallbacks.
      buildFallbackPreloadResult(),
    );
}

/**
 * Pure bounded-race helper: resolves with each load's value, or `undefined`
 * for any load still pending when the deadline fires. Loads that reject count
 * as settled with `undefined` (failed assets use their approved fallback).
 */
export function raceSettledOrDeadline<T>(
  loads: readonly Promise<T>[],
  deadlineMs: number,
): Promise<readonly (T | undefined)[]> {
  if (loads.length === 0) {
    return Promise.resolve([]);
  }
  const results: (T | undefined)[] = loads.map(() => undefined);
  let settledCount = 0;
  let resolveRace: ((value: readonly (T | undefined)[]) => void) | undefined;
  const settledOrDeadline = new Promise<readonly (T | undefined)[]>(
    (resolve) => {
      resolveRace = resolve;
    },
  );
  const timer = setTimeout(() => {
    resolveRace?.([...results]);
  }, deadlineMs);
  loads.forEach((load, index) => {
    load.then(
      (value) => {
        results[index] = value;
        settledCount += 1;
        if (settledCount === loads.length) {
          resolveRace?.([...results]);
        }
      },
      () => {
        settledCount += 1;
        if (settledCount === loads.length) {
          resolveRace?.([...results]);
        }
      },
    );
  });
  void settledOrDeadline.then(() => clearTimeout(timer));
  return settledOrDeadline;
}

function loadAsset(
  entry: RuntimeAssetManifestEntry,
  isClosed: () => boolean,
): Promise<boolean> {
  const url = resolveRuntimeAssetUrl(entry.sourcePath);
  switch (entry.kind) {
    case 'background':
    case 'aircraft-image':
      return loadImage(url);
    case 'font':
      return loadFont(url, entry.weight, isClosed);
    case 'icon':
      return loadIcon(url);
  }
}

/** Image success requires both a successful load and decode (Master §5.6). */
function loadImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      if (typeof image.decode !== 'function') {
        resolve(true);
        return;
      }
      void image.decode().then(
        () => resolve(true),
        () => resolve(false),
      );
    };
    image.onerror = () => resolve(false);
    image.src = url;
  });
}

/** Font success requires the approved weight to be ready for use. */
function loadFont(
  url: string,
  weight: string,
  isClosed: () => boolean,
): Promise<boolean> {
  try {
    const face = new FontFace('IBM Plex Mono', `url("${url}")`, { weight });
    return face.load().then(
      () => {
        if (isClosed()) {
          // The deadline has passed: this completion is inert. The font is not
          // added to document.fonts, does not replace its fallback, and cannot
          // cause a layout change.
          return false;
        }
        document.fonts.add(face);
        return true;
      },
      () => false,
    );
  } catch {
    return Promise.resolve(false);
  }
}

function loadIcon(url: string): Promise<boolean> {
  return fetch(url).then(
    (response) => response.ok,
    () => false,
  );
}
