import { createAabb } from '@domain/geometry';
import type { Aabb } from '@domain/geometry';

/**
 * S10 collision-geometry prerequisite (Combat §8.6, AC-049): the player
 * aircraft hitbox is a centred box of `60%` of the rendered sprite width by
 * `70%` of the rendered sprite height. S10 exposes the geometry only; the
 * overlap/damage pass is owned by S11.
 */
export const AIRCRAFT_HITBOX_WIDTH_RATIO = 0.6;
export const AIRCRAFT_HITBOX_HEIGHT_RATIO = 0.7;

export function aircraftCollisionAabb(
  centerX: number,
  centerY: number,
  aircraftWidth: number,
  aircraftHeight: number,
): Aabb {
  const width = aircraftWidth * AIRCRAFT_HITBOX_WIDTH_RATIO;
  const height = aircraftHeight * AIRCRAFT_HITBOX_HEIGHT_RATIO;
  return createAabb(centerX - width / 2, centerY - height / 2, width, height);
}
