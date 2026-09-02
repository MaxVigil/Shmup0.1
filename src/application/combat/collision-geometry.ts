import { createAabb } from '@domain/geometry';
import type { Aabb } from '@domain/geometry';
import type { CombatEnemy } from './enemies';
import type { CombatProjectile, EnemyProjectile } from './projectiles';

/**
 * Collision geometry (Combat §8.6, AC-049; v0.2 §9/§11, V02-DEC-019): the
 * player aircraft hitbox is a centred box of `60%` of the rendered sprite width
 * by `70%` of the rendered sprite height; every regular enemy's hitbox is its
 * FULL complete configured rendered bounds (never a superseded square or an
 * alpha-pixel mask); the player projectile hitbox is its full rendered bounds;
 * the Ranged projectile hitbox is its full `1.2% × 0.6%` rendered bounds. AABB
 * overlap uses the strict edge semantics of `@domain/geometry` (edge-only
 * contact is not overlap). The collision *pass* is owned by the collision
 * module.
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

/** The regular-enemy hitbox is its complete rendered bounds (V02-DEC-019). */
export function enemyCollisionAabb(enemy: CombatEnemy): Aabb {
  return createAabb(
    enemy.centerX - enemy.width / 2,
    enemy.centerY - enemy.height / 2,
    enemy.width,
    enemy.height,
  );
}

/** The player-projectile hitbox is its full rendered bounds. */
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

/** The Ranged-projectile hitbox is its full rendered bounds (v0.2 §9.2). */
export function enemyProjectileCollisionAabb(
  projectile: EnemyProjectile,
): Aabb {
  return createAabb(
    projectile.centerX - projectile.width / 2,
    projectile.centerY - projectile.height / 2,
    projectile.width,
    projectile.height,
  );
}
