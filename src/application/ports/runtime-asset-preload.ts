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
  'background' | 'aircraft-image' | 'font' | 'icon';

export interface PreparedRuntimeAsset {
  readonly id: string;
  readonly kind: RuntimeAssetKind;
  readonly sourcePath: string;
  /** Runtime URL below the configured base (S03 prepared-catalogue consumption). */
  readonly url: string;
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
