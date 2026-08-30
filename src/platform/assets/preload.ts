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

/** The ready/fallback + optional inline mask/data source of one load. */
export interface AssetLoadOutcome {
  readonly ok: boolean;
  readonly iconDataUri?: string;
  /** Prepared `data:image/png;base64` bytes for a ready aircraft image. */
  readonly imageDataUri?: string;
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
      return Promise.resolve<AssetLoadOutcome>({ ok: false });
    }
  });
  return raceSettledOrDeadline(loads, PRELOAD_DEADLINE_MS)
    .then((results): readonly PreparedRuntimeAsset[] => {
      // Result produced: from here on, late loader completions are inert.
      closed = true;
      return RUNTIME_ASSET_MANIFEST.map(
        (entry, index): PreparedRuntimeAsset => {
          const loaded = results[index];
          const ready = loaded?.ok === true;
          return {
            id: entry.id,
            kind: entry.kind,
            sourcePath: entry.sourcePath,
            url: resolveRuntimeAssetUrl(entry.sourcePath),
            // S13: a ready icon carries the inline SVG mask source built from
            // the single preload fetch, so the Icon render never re-requests it.
            ...(ready && loaded.iconDataUri !== undefined
              ? { iconDataUri: loaded.iconDataUri }
              : {}),
            // V02-WI-02 C02: a ready aircraft carries the prepared PNG bytes
            // as an inline data URI so Combat reuses it without a second
            // application/network request (MASTER-AC-014).
            ...(ready && loaded.imageDataUri !== undefined
              ? { imageDataUri: loaded.imageDataUri }
              : {}),
            status: ready ? 'ready' : 'fallback',
          };
        },
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
): Promise<AssetLoadOutcome> {
  const url = resolveRuntimeAssetUrl(entry.sourcePath);
  switch (entry.kind) {
    case 'background':
    case 'aircraft-image':
      // The prepared aircraft is re-consumed as an Image by Combat and the
      // prepared backgrounds as CSS background-images by the re-mounting Base
      // Screens (Combat §12.7, Base §3). Their bytes are prepared once as an
      // inline data URI so every re-consumption decodes the prepared asset
      // with no second application/network request (MASTER-AC-014, V02-WI-02
      // C02). Enemies render as deterministic shapes and are only prepared for
      // readiness, so they keep the Image load.
      return loadPreparedImageDataUri(url);
    case 'enemy-image':
      return loadImage(url);
    case 'font':
      return loadFont(url, entry.weight, isClosed);
    case 'icon':
      return loadIcon(url);
  }
}

/** Image success requires both a successful load and decode (Master §5.6). */
function loadImage(url: string): Promise<AssetLoadOutcome> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      if (typeof image.decode !== 'function') {
        resolve({ ok: true });
        return;
      }
      void image.decode().then(
        () => resolve({ ok: true }),
        () => resolve({ ok: false }),
      );
    };
    image.onerror = () => resolve({ ok: false });
    image.src = url;
  });
}

/**
 * One prepared-image load for every asset that a later layer re-consumes
 * (Combat §12.7, Base §3; MASTER-AC-014, V02-WI-02 correction C02): the
 * manifest request itself (`fetch`, once) plus the prepared inline data URI
 * derived from its bytes, so the re-consuming layers reuse the already
 * prepared asset across re-entry without a second application/network request.
 * The port carries the source as a string — never a DOM element. Master §5.6
 * success still requires the prepared bytes to decode.
 */
function loadPreparedImageDataUri(url: string): Promise<AssetLoadOutcome> {
  return fetch(url).then(
    async (response) => {
      if (!response.ok) {
        return { ok: false };
      }
      const bytes = await response.arrayBuffer();
      const imageDataUri = `data:${mimeForUrl(url)};base64,${bytesToBase64(
        bytes,
      )}`;
      const image = new Image();
      image.src = imageDataUri;
      try {
        await image.decode();
      } catch {
        return { ok: false };
      }
      return { ok: true, imageDataUri };
    },
    () => ({ ok: false }),
  );
}

/** The prepared asset's inline MIME derived from its runtime URL. */
function mimeForUrl(url: string): string {
  if (/\.webp($|\?)/i.test(url)) {
    return 'image/webp';
  }
  if (/\.jpe?g($|\?)/i.test(url)) {
    return 'image/jpeg';
  }
  return 'image/png';
}

/** Base64-encodes an ArrayBuffer in chunks (btoa cannot take a large
 *  `String.fromCharCode(...)` spread without a call-stack overflow). */
function bytesToBase64(bytes: ArrayBuffer): string {
  const uint8 = new Uint8Array(bytes);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < uint8.length; index += chunkSize) {
    binary += String.fromCharCode(...uint8.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

/** Font success requires the approved weight to be ready for use. */
function loadFont(
  url: string,
  weight: string,
  isClosed: () => boolean,
): Promise<AssetLoadOutcome> {
  try {
    const face = new FontFace('IBM Plex Mono', `url("${url}")`, { weight });
    return face.load().then(
      () => {
        if (isClosed()) {
          // The deadline has passed: this completion is inert. The font is not
          // added to document.fonts, does not replace its fallback, and cannot
          // cause a layout change.
          return { ok: false };
        }
        document.fonts.add(face);
        return { ok: true };
      },
      () => ({ ok: false }),
    );
  } catch {
    return Promise.resolve({ ok: false });
  }
}

/**
 * One icon load: the manifest request itself (`fetch`, once per icon) plus the
 * inline `data:image/svg+xml` mask source derived from its text, so the Icon
 * component's CSS-mask render reuses the prepared bytes and never issues a
 * second network request — including the Combat Pause icon that first renders
 * only inside Combat (S13; MASTER-AC-014, DS §13.2).
 */
function loadIcon(url: string): Promise<AssetLoadOutcome> {
  return fetch(url).then(
    async (response) => {
      if (!response.ok) {
        return { ok: false };
      }
      const text = await response.text();
      return {
        ok: true,
        iconDataUri: `data:image/svg+xml;utf8,${encodeURIComponent(text)}`,
      };
    },
    () => ({ ok: false }),
  );
}
