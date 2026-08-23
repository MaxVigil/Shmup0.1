import { overlaps } from '@domain/geometry';
import type { CombatEnemy } from './enemies';
import type { CombatProjectile } from './projectiles';
import {
  aircraftCollisionAabb,
  droneCollisionAabb,
  projectileCollisionAabb,
} from './collision-geometry';

/**
 * S11 deterministic post-integration collision phase (Combat §7.1, §8.4–8.5,
 * AC-010–013/023–026/051/058–062). One explicit phase runs after movement,
 * spawning, and firing per executed 1/60 s step: projectile-to-enemy pairs
 * first, then aircraft-to-surviving-enemy contact pairs. All pair selection is
 * independent of incidental array/callback order — projectile ids ascending
 * and enemy ids ascending. Collision applies damage atomically, consumes a
 * projectile exactly once, and creates only presentation-only feedback state
 * (never a physics engine, CCD, spatial index, or second state owner).
 */

/** Canonical contact damage applied to both objects (Combat §7.1). */
export const CONTACT_DAMAGE = 25;
/** Player-only 0.5 s contact-damage cooldown in fixed steps. */
export const CONTACT_COOLDOWN_STEPS = 30;
/** Non-destroying enemy hit flash: 50 ms = 3 fixed steps. */
export const ENEMY_HIT_FLASH_STEPS = 3;
/** Destroyed-enemy flash: 100 ms = 6 fixed steps, hitbox-free and stationary. */
export const DESTROYED_ENEMY_FLASH_STEPS = 6;
/** Player aircraft danger flash after valid damage: 100 ms = 6 fixed steps. */
export const AIRCRAFT_DAMAGE_FLASH_STEPS = 6;

export interface DestroyedEnemyFlash {
  readonly enemyId: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly size: number;
  readonly stepsRemaining: number;
}

/** Active-enemy white-flash counters keyed by enemy id. */
export type EnemyFlashSteps = Readonly<Record<number, number>>;

export interface ProjectileCollisionInput {
  readonly projectiles: readonly CombatProjectile[];
  readonly enemies: readonly CombatEnemy[];
  readonly projectileWidth: number;
  readonly projectileHeight: number;
  readonly enemySize: number;
  readonly existingFlashes: EnemyFlashSteps;
}

export interface ProjectileCollisionResult {
  readonly projectiles: readonly CombatProjectile[];
  readonly enemies: readonly CombatEnemy[];
  readonly destroyedEnemyCount: number;
  readonly flashes: EnemyFlashSteps;
  readonly destroyedEnemyFlashes: readonly DestroyedEnemyFlash[];
}

/**
 * Projectile-to-enemy pass (Combat §8.4, AC-023–026): projectile ids ascending;
 * each projectile damages only the first overlapping still-active enemy by
 * ascending enemy id and is consumed exactly once. An enemy reaching Hull <= 0
 * immediately leaves the active collection, is counted exactly once, and
 * creates only the 100 ms hitbox-free destruction flash; later projectiles in
 * the same step ignore it. A non-destroying hit applies or restarts that
 * enemy's 50 ms flash and preserves movement and hitbox.
 */
export function resolveProjectileCollisions(
  input: ProjectileCollisionInput,
): ProjectileCollisionResult {
  // Processing order is explicit (ascending ids); the returned arrays preserve
  // their original stable order (newest-first) minus consumed/destroyed items.
  const sortedEnemies = [...input.enemies].sort((a, b) => a.id - b.id);
  const hullByEnemyId = new Map(
    input.enemies.map((enemy) => [enemy.id, enemy.hullIntegrity] as const),
  );
  const destroyedIds = new Set<number>();
  const survivingProjectileIds = new Set<number>();
  const flashes: Record<number, number> = { ...input.existingFlashes };
  const destroyedEnemyFlashes: DestroyedEnemyFlash[] = [];
  let destroyedEnemyCount = 0;
  for (const projectile of [...input.projectiles].sort((a, b) => a.id - b.id)) {
    const target = sortedEnemies.find(
      (enemy) =>
        !destroyedIds.has(enemy.id) &&
        overlaps(
          projectileCollisionAabb(
            projectile,
            input.projectileWidth,
            input.projectileHeight,
          ),
          droneCollisionAabb(enemy, input.enemySize),
        ),
    );
    if (target === undefined) {
      survivingProjectileIds.add(projectile.id);
      continue;
    }
    const nextHull = (hullByEnemyId.get(target.id) ?? 0) - projectile.damage;
    if (nextHull <= 0) {
      destroyedIds.add(target.id);
      destroyedEnemyCount += 1;
      destroyedEnemyFlashes.push({
        enemyId: target.id,
        centerX: target.centerX,
        centerY: target.centerY,
        size: input.enemySize,
        stepsRemaining: DESTROYED_ENEMY_FLASH_STEPS,
      });
      delete flashes[target.id];
    } else {
      hullByEnemyId.set(target.id, nextHull);
      flashes[target.id] = ENEMY_HIT_FLASH_STEPS;
    }
  }
  const enemies = input.enemies
    .filter((enemy) => !destroyedIds.has(enemy.id))
    .map((enemy) => ({
      ...enemy,
      hullIntegrity: hullByEnemyId.get(enemy.id) ?? enemy.hullIntegrity,
    }));
  const projectiles = input.projectiles.filter((projectile) =>
    survivingProjectileIds.has(projectile.id),
  );
  return {
    projectiles,
    enemies,
    destroyedEnemyCount,
    flashes,
    destroyedEnemyFlashes,
  };
}

export interface ContactCollisionInput {
  readonly enemies: readonly CombatEnemy[];
  readonly enemySize: number;
  readonly aircraftCenterX: number;
  readonly aircraftCenterY: number;
  readonly aircraftWidth: number;
  readonly aircraftHeight: number;
  readonly playerHullIntegrity: number;
  readonly playerMaximumHullIntegrity: number;
  readonly contactCooldownStepsRemaining: number;
  readonly aircraftDangerFlashStepsRemaining: number;
  readonly godModeEnabled: boolean;
  readonly playerDefeated: boolean;
}

export interface ContactCollisionResult {
  readonly enemies: readonly CombatEnemy[];
  readonly playerHullIntegrity: number;
  readonly playerDefeated: boolean;
  readonly contactCooldownStepsRemaining: number;
  readonly aircraftDangerFlashStepsRemaining: number;
  readonly destroyedEnemyCount: number;
  readonly destroyedEnemyFlashes: readonly DestroyedEnemyFlash[];
}

/**
 * Aircraft-to-surviving-enemy contact pass (Combat §7.1, AC-011–013/059–061),
 * ascending enemy id. The first eligible stable contact atomically applies 25
 * damage to both objects, clamps player Hull at 0, destroys the drone, and
 * starts the player-only 0.5 s cooldown; further overlapping drones in the
 * same step are protected (still destroyed, no player Hull/flash change, no
 * cooldown restart). God Mode keeps player Hull at maximum with no aircraft
 * flash while the drone is still destroyed and the cooldown still starts. If
 * an atomic contact reduces player Hull to 0, the idempotent defeat-trigger
 * state is set and all remaining collision/gameplay processing stops.
 */
export function resolveAircraftContacts(
  input: ContactCollisionInput,
): ContactCollisionResult {
  const aircraftBox = aircraftCollisionAabb(
    input.aircraftCenterX,
    input.aircraftCenterY,
    input.aircraftWidth,
    input.aircraftHeight,
  );
  let playerHull = input.playerHullIntegrity;
  let defeated = input.playerDefeated;
  let cooldown = input.contactCooldownStepsRemaining;
  // Preserve an existing approved flash while it counts down. A contact during
  // cooldown must not replay or cancel that feedback.
  let aircraftFlash = input.aircraftDangerFlashStepsRemaining;
  let destroyedEnemyCount = 0;
  const destroyedIds = new Set<number>();
  const destroyedEnemyFlashes: DestroyedEnemyFlash[] = [];
  // Processing order is explicit (ascending ids); survivors keep their
  // original stable order.
  const sorted = [...input.enemies].sort((a, b) => a.id - b.id);
  for (const enemy of sorted) {
    if (defeated) {
      break;
    }
    if (!overlaps(aircraftBox, droneCollisionAabb(enemy, input.enemySize))) {
      continue;
    }
    // God Mode keeps Hull at maximum for every incoming contact, including a
    // contact during an already-active cooldown (Combat AC-041/061).
    if (input.godModeEnabled) {
      playerHull = input.playerMaximumHullIntegrity;
    }
    if (cooldown === 0) {
      if (!input.godModeEnabled) {
        playerHull = Math.max(0, playerHull - CONTACT_DAMAGE);
        aircraftFlash = AIRCRAFT_DAMAGE_FLASH_STEPS;
        if (playerHull <= 0) {
          defeated = true;
        }
      }
      cooldown = CONTACT_COOLDOWN_STEPS;
    }
    destroyedIds.add(enemy.id);
    destroyedEnemyCount += 1;
    destroyedEnemyFlashes.push({
      enemyId: enemy.id,
      centerX: enemy.centerX,
      centerY: enemy.centerY,
      size: input.enemySize,
      stepsRemaining: DESTROYED_ENEMY_FLASH_STEPS,
    });
  }
  const enemies = input.enemies.filter((enemy) => !destroyedIds.has(enemy.id));
  return {
    enemies,
    playerHullIntegrity: playerHull,
    playerDefeated: defeated,
    contactCooldownStepsRemaining: cooldown,
    aircraftDangerFlashStepsRemaining: aircraftFlash,
    destroyedEnemyCount,
    destroyedEnemyFlashes,
  };
}
