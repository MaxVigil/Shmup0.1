/**
 * Combat presentation configuration (S07). Geometry and colours follow the
 * Combat specification: aircraft height is `8%` of the viewport short side,
 * the Hull bar is `65%` of the rendered aircraft width with a `1%` short-side
 * gap, and the background uses the resolved approved canvas token. Tokens are
 * read from the Design System CSS custom properties and cached (Technical
 * Foundation §6.2). The aircraft fallback triangle is an approved light-grey
 * presentation value (Combat AC-056).
 */
export interface CombatGeometry {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly shortSide: number;
  readonly backgroundColor: string;
  readonly aircraftHeightPx: number;
  readonly aircraftAspectRatio: number;
  readonly hullBarWidthRatio: number;
  readonly hullBarGapRatio: number;
  readonly aircraftFallbackColor: string;
}

/** Canonical source asset aspect ratio (width/height) for the fallback bounds. */
const GERMAN_FIGHTER_ASPECT_RATIO = 1278 / 1231;

export function resolveCombatGeometry(viewport: {
  width: number;
  height: number;
}): CombatGeometry {
  const shortSide = Math.min(viewport.width, viewport.height);
  return {
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    shortSide,
    backgroundColor: readColorToken('--color-canvas', '#080b0e'),
    aircraftHeightPx: shortSide * 0.08,
    aircraftAspectRatio: GERMAN_FIGHTER_ASPECT_RATIO,
    hullBarWidthRatio: 0.65,
    hullBarGapRatio: 0.01,
    aircraftFallbackColor: '#cccccc',
  };
}

function readColorToken(token: string, fallback: string): string {
  if (typeof document === 'undefined') {
    return fallback;
  }
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  return value.length > 0 ? value : fallback;
}
