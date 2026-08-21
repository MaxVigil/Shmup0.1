/// <reference types="vite/client" />

/**
 * The approved Boot runtime asset manifest (Master §5.6): exactly twelve
 * assets under `assets/runtime/`, each requested at most once per page load.
 * Asset source material under `assets/source/` is never requested at runtime.
 */
export type RuntimeAssetManifestEntry =
  | {
      readonly id: string;
      readonly kind: 'background';
      readonly sourcePath: string;
    }
  | {
      readonly id: string;
      readonly kind: 'aircraft-image';
      readonly sourcePath: string;
    }
  | {
      readonly id: string;
      readonly kind: 'font';
      readonly sourcePath: string;
      readonly weight: string;
    }
  | { readonly id: string; readonly kind: 'icon'; readonly sourcePath: string };

export const RUNTIME_ASSET_MANIFEST: readonly RuntimeAssetManifestEntry[] = [
  {
    id: 'operations-background',
    kind: 'background',
    sourcePath: 'assets/runtime/backgrounds/operations-background.webp',
  },
  {
    id: 'hangar-background',
    kind: 'background',
    sourcePath: 'assets/runtime/backgrounds/hangar-background.webp',
  },
  {
    id: 'german-fighter',
    kind: 'aircraft-image',
    sourcePath: 'assets/runtime/aircraft/german-fighter.png',
  },
  {
    id: 'font-regular',
    kind: 'font',
    sourcePath: 'assets/runtime/fonts/ibm-plex-mono-regular.woff2',
    weight: '400',
  },
  {
    id: 'font-medium',
    kind: 'font',
    sourcePath: 'assets/runtime/fonts/ibm-plex-mono-medium.woff2',
    weight: '500',
  },
  {
    id: 'font-semibold',
    kind: 'font',
    sourcePath: 'assets/runtime/fonts/ibm-plex-mono-semibold.woff2',
    weight: '600',
  },
  {
    id: 'icon-gear',
    kind: 'icon',
    sourcePath: 'assets/runtime/icons/gear.svg',
  },
  {
    id: 'icon-pause',
    kind: 'icon',
    sourcePath: 'assets/runtime/icons/pause.svg',
  },
  {
    id: 'icon-crosshair',
    kind: 'icon',
    sourcePath: 'assets/runtime/icons/crosshair.svg',
  },
  {
    id: 'icon-map-trifold',
    kind: 'icon',
    sourcePath: 'assets/runtime/icons/map-trifold.svg',
  },
  {
    id: 'icon-warehouse',
    kind: 'icon',
    sourcePath: 'assets/runtime/icons/warehouse.svg',
  },
  {
    id: 'icon-check',
    kind: 'icon',
    sourcePath: 'assets/runtime/icons/check.svg',
  },
];

/**
 * Resolves an approved manifest source path to a runtime URL below the
 * configured Vite base. The `assets/runtime/` prefix is the public directory,
 * so the file is served relative to the base path.
 *
 * A relative `BASE_URL` (for example `./` in the production build) must not
 * produce a relative runtime URL: CSS `url()` consumers such as the icon
 * `mask-image` resolve relative URLs against the stylesheet origin instead of
 * the document, which breaks the path and causes repeated requests. The URL is
 * therefore normalized against the document base so every consumer (fetch,
 * `img`, `FontFace`, `mask-image`) uses the local static-server base path
 * (Delivery §1; S04 regression: production mask-icon path and resize/visibility
 * request continuity).
 */
export function resolveRuntimeAssetUrl(sourcePath: string): string {
  const url = `${import.meta.env.BASE_URL}${sourcePath.replace(
    'assets/runtime/',
    '',
  )}`;
  return normalizeRuntimeAssetUrl(url, document.baseURI);
}

/** Pure URL-normalization rule used by `resolveRuntimeAssetUrl`. */
export function normalizeRuntimeAssetUrl(
  url: string,
  documentBase: string,
): string {
  if (url.startsWith('./') || url.startsWith('../')) {
    return new URL(url, documentBase).href;
  }
  return url;
}
