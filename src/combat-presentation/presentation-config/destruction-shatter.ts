import type { DestructionShatter } from '@application/combat';

/**
 * V021-WI-05 destruction-shatter presentation geometry (patch §4.1,
 * V021-DEC-005, V021-AC-009). Pure deterministic geometry of the approved
 * procedural burst: a small two-step four-point `text-primary` glint, one
 * expanding broken ring (a second one from effect step `4`, i.e. `ageSteps` `3`,
 * for the Elite), and tapered `danger` fragments with `text-primary` highlights
 * whose centres move
 * from the destruction centre out to at most `0.60 × size`, shrinking and
 * fading monotonically.
 *
 * Everything here is a pure function of the authoritative destruction record
 * (role variant, complete visual dimension, visual age, stable enemy id) and the
 * approved design tokens. There is no RNG, wall clock, asset request, renderer
 * state, or second animation clock: the same record always produces exactly the
 * same local outline, and the destroyed enemy's stable id only rotates the fixed
 * pattern. The Phaser adapter owns no geometry of its own and only paints these
 * outlines.
 */

/** Complete visual dimension ratios of the approved burst (patch §4.1). */
export const SHATTER_RING_START_RATIO = 0.2;
export const SHATTER_RING_END_RATIO = 0.8;
export const SHATTER_FRAGMENT_MAX_DISTANCE_RATIO = 0.6;
/** Regular `six` fragments / Elite `ten` fragments (patch §4.1). */
export const SHATTER_REGULAR_FRAGMENTS = 6;
export const SHATTER_ELITE_FRAGMENTS = 10;
/** The `text-primary` four-point glint covers the first two executed steps. */
export const SHATTER_GLINT_STEPS = 2;
/**
 * The Elite's second broken ring starts on effect step `4` (patch §4.1). The
 * record's creation step already carries `ageSteps: 0` and is visible effect
 * step `1` (the two-step glint covers ages `0` and `1`), so effect step `4` is
 * `ageSteps: 3`. The constant is named for the age it gates, so the approved
 * one-based step boundary cannot be mistaken for an age again.
 */
export const SHATTER_ELITE_SECOND_RING_AGE = 3;

const TWO_PI = Math.PI * 2;
const SHATTER_PATTERN_ROTATIONS = 8;
const SHATTER_FRAGMENT_LENGTH_RATIO = 0.3;
const SHATTER_FRAGMENT_BASE_RATIO = 0.14;
const SHATTER_RING_BAND_RATIO = 0.055;
const SHATTER_RING_SEGMENTS = 4;
const SHATTER_RING_SEGMENT_SWEEP = Math.PI / 3;
const SHATTER_RING_ARC_SAMPLES = 6;
const SHATTER_GLINT_RATIO = 0.16;
const SHATTER_GLINT_WAIST_RATIO = 0.3;
/**
 * The monotone shrink/fade spans `1 → 0.15` over the effect's exact lifetime.
 * The residual keeps the last executed step visibly drawn, so the single
 * removal event is the record's own expiry (or the committed terminal's exact
 * zero opacity) and never a silent invisible tail.
 */
const SHATTER_FADE_SPAN = 0.85;

/** Local outline points in px relative to the destruction centre. */
export type ShatterOutline = readonly (readonly [number, number])[];

export interface ShatterFragmentGeometry {
  /** Tapered triangular fragment in the approved `danger` token. */
  readonly outline: ShatterOutline;
  /** Slim apex-anchored `text-primary` highlight of that fragment. */
  readonly highlight: ShatterOutline;
  /** Effect-owned opacity (already monotonically faded by the effect age). */
  readonly alpha: number;
}

export interface ShatterRingGeometry {
  /** One filled band per visible arc of the broken ring. */
  readonly segments: readonly ShatterOutline[];
  readonly alpha: number;
}

export interface DestructionShatterGeometry {
  /** The `text-primary` four-point glint, or `null` after its two steps. */
  readonly glint: ShatterOutline | null;
  readonly glintAlpha: number;
  /** The expanding broken ring(s); the Elite adds its second at age `3`. */
  readonly rings: readonly ShatterRingGeometry[];
  readonly fragments: readonly ShatterFragmentGeometry[];
}

/**
 * Normalized effect progress: `0` on the creation step and exactly `1` on the
 * last executed step of the record's exact lifetime.
 */
export function shatterProgress(ageSteps: number, totalSteps: number): number {
  if (totalSteps <= 1) {
    return 1;
  }
  const clamped = Math.min(Math.max(ageSteps, 0), totalSteps - 1);
  return clamped / (totalSteps - 1);
}

/**
 * The destroyed enemy's stable id rotates the FIXED fragment/ring pattern by
 * `enemyId mod 8` eighths of a turn (patch §4.1). No gameplay RNG is consumed
 * and no two consecutive ids share a pattern.
 */
export function shatterPatternRotationRadians(enemyId: number): number {
  const index =
    ((Math.trunc(enemyId) % SHATTER_PATTERN_ROTATIONS) +
      SHATTER_PATTERN_ROTATIONS) %
    SHATTER_PATTERN_ROTATIONS;
  return (index / SHATTER_PATTERN_ROTATIONS) * TWO_PI;
}

/** Monotone shrink/fade of one effect age (see `SHATTER_FADE_SPAN`). */
function shatterAlpha(progress: number): number {
  return 1 - SHATTER_FADE_SPAN * progress;
}

/** One tapered fragment centred exactly on its travelled distance. */
function fragmentOutline(
  angleRadians: number,
  distance: number,
  length: number,
  halfBase: number,
): ShatterOutline {
  const ux = Math.cos(angleRadians);
  const uy = Math.sin(angleRadians);
  const vx = -uy;
  const vy = ux;
  const apexX = ux * (distance + length / 2);
  const apexY = uy * (distance + length / 2);
  const baseX = ux * (distance - length / 2);
  const baseY = uy * (distance - length / 2);
  return [
    [apexX, apexY],
    [baseX + vx * halfBase, baseY + vy * halfBase],
    [baseX - vx * halfBase, baseY - vy * halfBase],
  ];
}

/** The slim `text-primary` wedge along one fragment's leading edge. */
function fragmentHighlight(
  angleRadians: number,
  distance: number,
  length: number,
  halfBase: number,
): ShatterOutline {
  const ux = Math.cos(angleRadians);
  const uy = Math.sin(angleRadians);
  const vx = -uy;
  const vy = ux;
  const apexX = ux * (distance + length / 2);
  const apexY = uy * (distance + length / 2);
  const tailX = ux * (distance + length * 0.12);
  const tailY = uy * (distance + length * 0.12);
  const highlightHalfBase = halfBase * 0.45;
  return [
    [apexX, apexY],
    [tailX + vx * highlightHalfBase, tailY + vy * highlightHalfBase],
    [tailX - vx * highlightHalfBase, tailY - vy * highlightHalfBase],
  ];
}

/**
 * One broken ring: `SHATTER_RING_SEGMENTS` filled arc bands separated by equal
 * gaps, rotated as one fixed pattern. Only fills are used — the approved burst
 * has no outline, glow, or trail.
 */
function ringSegments(
  radius: number,
  band: number,
  rotationRadians: number,
): readonly ShatterOutline[] {
  const outer = radius + band / 2;
  const inner = Math.max(radius - band / 2, 0);
  const segments: ShatterOutline[] = [];
  for (let index = 0; index < SHATTER_RING_SEGMENTS; index += 1) {
    const start = rotationRadians + (TWO_PI * index) / SHATTER_RING_SEGMENTS;
    const end = start + SHATTER_RING_SEGMENT_SWEEP;
    const points: [number, number][] = [];
    for (let sample = 0; sample <= SHATTER_RING_ARC_SAMPLES; sample += 1) {
      const angle = start + ((end - start) * sample) / SHATTER_RING_ARC_SAMPLES;
      points.push([Math.cos(angle) * outer, Math.sin(angle) * outer]);
    }
    for (let sample = SHATTER_RING_ARC_SAMPLES; sample >= 0; sample -= 1) {
      const angle = start + ((end - start) * sample) / SHATTER_RING_ARC_SAMPLES;
      points.push([Math.cos(angle) * inner, Math.sin(angle) * inner]);
    }
    segments.push(points);
  }
  return segments;
}

/** One small four-point glint centred on the destruction centre. */
function glintOutline(size: number): ShatterOutline {
  const outer = size * SHATTER_GLINT_RATIO;
  const waist = (outer * SHATTER_GLINT_WAIST_RATIO) / Math.SQRT2;
  return [
    [0, -outer],
    [waist, -waist],
    [outer, 0],
    [waist, waist],
    [0, outer],
    [-waist, waist],
    [-outer, 0],
    [-waist, -waist],
  ];
}

/**
 * The complete local geometry of one authoritative destruction-shatter record.
 * `size` is the destroyed enemy's complete visual dimension (`max(visual width,
 * visual height)`), so the prepared-PNG and procedural-fallback paths always
 * produce the same effect bounds and timing.
 */
export function destructionShatterGeometry(
  shatter: DestructionShatter,
): DestructionShatterGeometry {
  const size = Math.max(0, shatter.size);
  if (size <= 0) {
    return { glint: null, glintAlpha: 0, rings: [], fragments: [] };
  }
  const progress = shatterProgress(shatter.ageSteps, shatter.totalSteps);
  const rotation = shatterPatternRotationRadians(shatter.enemyId);
  const alpha = shatterAlpha(progress);
  const fragmentCount =
    shatter.variant === 'elite'
      ? SHATTER_ELITE_FRAGMENTS
      : SHATTER_REGULAR_FRAGMENTS;
  const length = size * SHATTER_FRAGMENT_LENGTH_RATIO * (1 - 0.6 * progress);
  const halfBase =
    (size * SHATTER_FRAGMENT_BASE_RATIO * (1 - 0.5 * progress)) / 2;
  const distance = size * SHATTER_FRAGMENT_MAX_DISTANCE_RATIO * progress;
  const fragments: ShatterFragmentGeometry[] = [];
  for (let index = 0; index < fragmentCount; index += 1) {
    const angle = rotation + (TWO_PI * index) / fragmentCount;
    fragments.push({
      outline: fragmentOutline(angle, distance, length, halfBase),
      highlight: fragmentHighlight(angle, distance, length, halfBase),
      alpha,
    });
  }
  const firstRadius =
    size *
    (SHATTER_RING_START_RATIO +
      (SHATTER_RING_END_RATIO - SHATTER_RING_START_RATIO) * progress);
  const rings: ShatterRingGeometry[] = [
    {
      segments: ringSegments(
        firstRadius,
        size * SHATTER_RING_BAND_RATIO,
        rotation,
      ),
      alpha,
    },
  ];
  if (
    shatter.variant === 'elite' &&
    shatter.ageSteps >= SHATTER_ELITE_SECOND_RING_AGE
  ) {
    // The second ring's own `0.20 → 0.80 × size` growth spans its first age
    // (effect step 4) to the record's unchanged last age (effect step 15).
    const span = shatter.totalSteps - 1 - SHATTER_ELITE_SECOND_RING_AGE;
    const secondProgress =
      span > 0
        ? Math.min(1, (shatter.ageSteps - SHATTER_ELITE_SECOND_RING_AGE) / span)
        : 1;
    const secondRadius =
      size *
      (SHATTER_RING_START_RATIO +
        (SHATTER_RING_END_RATIO - SHATTER_RING_START_RATIO) * secondProgress);
    rings.push({
      segments: ringSegments(
        secondRadius,
        size * SHATTER_RING_BAND_RATIO * 0.8,
        rotation + Math.PI / SHATTER_RING_SEGMENTS,
      ),
      alpha: shatterAlpha(secondProgress),
    });
  }
  return {
    glint: shatter.ageSteps < SHATTER_GLINT_STEPS ? glintOutline(size) : null,
    glintAlpha: 1,
    rings,
    fragments,
  };
}
