import { createAabb } from '@domain/geometry';
import type { Aabb } from '@domain/geometry';
import type { CombatEnemy } from './enemies';
import type { CombatProjectile } from './projectiles';

/**
 * S10/S11 collision geometry (Combat §8.6, AC-049): the player aircraft hitbox
 * is a centred box of `60%` of the rendered sprite width by `70%` of the
 * rendered sprite height; the Basic Drone hitbox is its full 4%-short-side
 * rendered square; the projectile hitbox is its full rendered bounds. AABB
 * overlap uses the strict edge semantics of `@domain/geometry` (edge-only
 * contact is not overlap). The collision *pass* is owned by S11.
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

/** The Basic Drone hitbox is its full 4%-short-side rendered square. */
export function droneCollisionAabb(
  enemy: CombatEnemy,
  enemySize: number,
): Aabb {
  const half = enemySize / 2;
  return createAabb(
    enemy.centerX - half,
    enemy.centerY - half,
    enemySize,
    enemySize,
  );
}

/** The projectile hitbox is its full rendered bounds. */
export function projectileCollisionAabb(
  projectile: CombatProjectile,
  projectileWidth: number,
  projectileHeight: number,
): Aabb {
  return createAabb(
    projectile.centerX - projectileWidth / 2,
    projectile.centerY - projectileHeight / 2,
    projectileWidth,
    projectileHeight,
  );
}
