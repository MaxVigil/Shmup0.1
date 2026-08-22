/**
 * Aircraft movement configuration (Combat §6, S08). The canonical approved
 * values are expressed as viewport-short-side ratios and timing values so the
 * same logic works at every supported viewport; acceleration and deceleration
 * are derived from them. All values remain configurable here without changing
 * movement logic.
 */

/** Approved movement ratios (Combat §6). */
export const MOVEMENT_RATIOS = {
  /** `maximumSpeed = 45% of viewport short side per second`. */
  maximumSpeedRatio: 0.45,
  /** `targetTolerance = 0.5% of viewport short side`. */
  targetToleranceRatio: 0.005,
  /** `movementMargin = 3% of viewport short side` on every edge. */
  movementMarginRatio: 0.03,
} as const;

/** Approved movement timing (Combat §6). */
export const MOVEMENT_TIMING_SECONDS = {
  timeToMaximumSpeed: 0.25,
  timeToStopFromMaximumSpeed: 0.2,
} as const;

export interface MovementConfig {
  /** Maximum aircraft speed in px/s. */
  readonly maximumSpeed: number;
  /** Acceleration toward a commanded direction / target in px/s². */
  readonly acceleration: number;
  /** Deceleration to a stop in px/s². */
  readonly deceleration: number;
  /** Residual distance at which the target is considered reached (px). */
  readonly targetTolerance: number;
  /** Inset of the movement bounds from every viewport edge (px). */
  readonly movementMargin: number;
}

/** Resolves the px-scaled movement configuration from the viewport short side. */
export function resolveMovementConfig(
  viewportShortSide: number,
): MovementConfig {
  const maximumSpeed = viewportShortSide * MOVEMENT_RATIOS.maximumSpeedRatio;
  return {
    maximumSpeed,
    acceleration: maximumSpeed / MOVEMENT_TIMING_SECONDS.timeToMaximumSpeed,
    deceleration:
      maximumSpeed / MOVEMENT_TIMING_SECONDS.timeToStopFromMaximumSpeed,
    targetTolerance: viewportShortSide * MOVEMENT_RATIOS.targetToleranceRatio,
    movementMargin: viewportShortSide * MOVEMENT_RATIOS.movementMarginRatio,
  };
}

/**
 * Distance required to come to a stop at the current speed using the configured
 * deceleration (Combat §6: `brakingDistance = velocity² / (2 * deceleration)`).
 */
export function brakingDistance(speed: number, config: MovementConfig): number {
  return (speed * speed) / (2 * config.deceleration);
}
