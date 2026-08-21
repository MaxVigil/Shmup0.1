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
 * (DS §8.2, DS-AC-009). The asset URL comes from the prepared-asset catalogue
 * (S03 consumption); a non-ready asset renders nothing and never triggers a
 * repeated request (DS-AC-010, DS-AC-019).
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
  const style = { '--icon-url': `url("${asset.url}")` } as CSSProperties;
  return (
    <span
      aria-hidden={hidden}
      className={`ds-icon ds-icon--${size}`}
      style={style}
    />
  );
}
