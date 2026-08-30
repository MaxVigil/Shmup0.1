/**
 * Application port for the bounded runtime asset preload (Master §5.6).
 *
 * The concrete browser adapter lives in `src/platform/` and is injected at the
 * composition root. The preload must request each approved manifest asset no
 * more than once and resolve when every asset settles or the approved deadline
 * elapses, whichever comes first. Assets that fail or miss the deadline are
 * reported as `fallback`; late completions are inert.
 */
export type RuntimeAssetKind =
  'background' | 'aircraft-image' | 'enemy-image' | 'font' | 'icon';

export interface PreparedRuntimeAsset {
  readonly id: string;
  readonly kind: RuntimeAssetKind;
  readonly sourcePath: string;
  /** Runtime URL below the configured base (S03 prepared-catalogue consumption). */
  readonly url: string;
  /**
   * Inline `data:image/svg+xml` mask source for ready icons (S13): built once
   * by the bounded Boot preload from the fetched SVG text so the Icon
   * component's CSS-mask render reuses the prepared bytes and never issues a
   * second network request when it first appears inside Combat (MASTER-AC-014,
   * DS §13.2). Absent for non-icon assets, fallback icons, and non-ready icons.
   */
  readonly iconDataUri?: string;
  /**
   * Inline `data:image/...;base64` source for ready prepared images that a
   * later layer re-consumes — the aircraft (Combat §12.7) and the Base Screen
   * backgrounds (Base §3) — built once by the bounded Boot preload from the
   * fetched bytes so the re-consuming layers reuse the prepared asset without
   * a second application/network request across re-entry (MASTER-AC-014,
   * V02-WI-02 correction C02). A string, never a DOM element: application
   * ports expose no `HTMLImageElement` or other concrete DOM element
   * (Repository Architecture §5.5). Absent for other assets, fallback entries,
   * and non-ready entries.
   */
  readonly imageDataUri?: string;
  readonly status: 'ready' | 'fallback';
}

export type AssetPreloadResult = readonly PreparedRuntimeAsset[];

export interface RuntimeAssetPreload {
  /**
   * Resolves with prepared-or-fallback status for every approved manifest
   * asset. A rejected port must not produce Fatal Startup: the application
   * owner falls back to `fallbackResult()` (S02-WI02).
   */
  preload(): Promise<AssetPreloadResult>;
  /**
   * The complete approved manifest with every entry marked `fallback`. The
   * manifest stays platform-owned; this exposes the fallback outcome without
   * leaking manifest details into the application layer.
   */
  fallbackResult(): AssetPreloadResult;
}
