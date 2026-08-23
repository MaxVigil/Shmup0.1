import type { CSSProperties, ReactElement } from 'react';
import { useApplication } from '../application-context';

/** Approved Phosphor Regular icon subset (DS §5, DS-AC-009). */
export type IconId =
  'gear' | 'pause' | 'crosshair' | 'map-trifold' | 'warehouse' | 'check';

export type IconSize = 'small' | 'medium' | 'large';

export interface IconProps {
  readonly icon: IconId;
  readonly size?: IconSize;
  /** Decorative icons are hidden from assistive technology (DS §8.2). */
  readonly hidden?: boolean;
}

/**
 * Renders an approved runtime icon via a CSS mask so it inherits `currentColor`
 * (DS §8.2, DS-AC-009). The mask source comes from the prepared-asset
 * catalogue: ready icons carry the inline SVG data URI built by the single
 * Boot preload request (S13), so the render never triggers a second network
 * request for a prepared URL (MASTER-AC-014, DS-AC-019, DS §13.2); a
 * non-ready/fallback asset renders nothing and never repeats a request.
 */
export function Icon({
  icon,
  size = 'medium',
  hidden = true,
}: IconProps): ReactElement | null {
  const { preparedAssets } = useApplication();
  const asset = preparedAssets.find((entry) => entry.id === `icon-${icon}`);
  if (asset?.status !== 'ready') {
    return null;
  }
  const style = {
    '--icon-url': `url("${asset.iconDataUri ?? asset.url}")`,
  } as CSSProperties;
  return (
    <span
      aria-hidden={hidden}
      className={`ds-icon ds-icon--${size}`}
      style={style}
    />
  );
}
