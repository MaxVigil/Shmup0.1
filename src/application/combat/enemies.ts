import type { EnemyType } from '@domain/index';
import { Mulberry32 } from '@domain/random';

/**
 * Basic Drone enemy state and movement (Combat §7, S10). A concrete
 * BasicDrone/CombatEnemy rather than a generalized entity framework: stable
 * monotonic identity/order, type, Hull Integrity initialized from content,
 * full-square rendered/hitbox geometry, constant speed, selected entry region,
 * optional fixed side waypoint/trajectory phase, and the permanent
 * `hasEnteredVisibleArea` latch. Only the active/escaped lifecycle exists in
 * S10 (Escaped enemies are removed); the Destroyed transition is S11.
 */

export type EnemyEntryRegion = 'top' | 'upper-left' | 'upper-right';

export interface CombatEnemy {
  /** Stable monotonic identity per mission (presentation visual-map key). */
  readonly id: number;
  readonly type: EnemyType;
  /** AC-014 durability prerequisite: initialized from content, unchanged in S10. */
  readonly hullIntegrity: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly entry: EnemyEntryRegion;
  /** Fixed side-entry waypoint (null for top entries; never changes). */
  readonly waypointX: number | null;
  readonly waypointY: number | null;
  /** One-way side-entry latch: true once the drone has arrived at its waypoint. */
  readonly waypointReached: boolean;
  /** Permanent latch (Combat §7.5, AC-018): true once any hitbox portion was visible. */
  readonly hasEnteredVisibleArea: boolean;
}

/** Independent 1/3 entry-region draw (Combat §7.4, AC-074). */
export function selectEnemyEntryRegion(rng: Mulberry32): EnemyEntryRegion {
  const draw = rng.nextInt(3);
  if (draw === 0) {
    return 'top';
  }
  if (draw === 1) {
    return 'upper-left';
  }
  return 'upper-right';
}

/** Uniform fraction in [0, 1) — the raw spawn-axis draw resolved at spawn. */
export function spawnAxisFraction(rng: Mulberry32): number {
  return rng.nextFloat();
}

/** Uniform waypoint-x fraction in the approved `40%-60%` viewport-width band. */
export function waypointXFraction(rng: Mulberry32): number {
  return 0.4 + rng.nextFloat() * 0.2;
}

/** Uniform waypoint-y fraction in the approved `20%-40%` viewport-height band. */
export function waypointYFraction(rng: Mulberry32): number {
  return 0.2 + rng.nextFloat() * 0.2;
}

/**
 * Spawns a drone with its full hitbox outside the viewport and its nearest
 * edge exactly touching the selected boundary (Combat §7.4, AC-072):
 * top → bottom edge touches the top boundary; upper-left → right edge touches
 * the left boundary; upper-right → left edge touches the right boundary. The
 * non-entry axis keeps the complete hitbox within the viewport width (top) or
 * the upper half (side) (AC-073).
 */
export function spawnEnemy(
  id: number,
  type: EnemyType,
  hullIntegrity: number,
  entry: EnemyEntryRegion,
  spawnAxisFractionValue: number,
  waypointXFractionValue: number | null,
  waypointYFractionValue: number | null,
  viewportWidth: number,
  viewportHeight: number,
  enemySize: number,
): CombatEnemy {
  const half = enemySize / 2;
  if (entry === 'top') {
    return {
      id,
      type,
      hullIntegrity,
      centerX: half + spawnAxisFractionValue * (viewportWidth - enemySize),
      centerY: -half,
      entry,
      waypointX: null,
      waypointY: null,
      waypointReached: false,
      hasEnteredVisibleArea: false,
    };
  }
  const upperHalf = viewportHeight / 2;
  const centerY = half + spawnAxisFractionValue * (upperHalf - enemySize);
  const waypoint =
    waypointXFractionValue === null || waypointYFractionValue === null
      ? null
      : {
          x: waypointXFractionValue * viewportWidth,
          y: waypointYFractionValue * viewportHeight,
        };
  return {
    id,
    type,
    hullIntegrity,
    centerX: entry === 'upper-left' ? -half : viewportWidth + half,
    centerY,
    entry,
    waypointX: waypoint?.x ?? null,
    waypointY: waypoint?.y ?? null,
    waypointReached: false,
    hasEnteredVisibleArea: false,
  };
}

/**
 * One deterministic fixed-step movement (Combat §7): top entries move straight
 * down; side entries travel a straight segment to their fixed waypoint, arrive
 * exactly at it (no overshoot), latch the waypoint phase without oscillation,
 * then move straight down at the same constant speed. Drones never target the
 * aircraft. After the movement, the permanent entered latch is applied and a
 * drone that has entered and now fully exits any boundary is returned as `null`
 * (Escaped, AC-018/029). A drone cannot escape during its initial entry.
 */
export function moveEnemy(
  enemy: CombatEnemy,
  speedPxPerSecond: number,
  stepSeconds: number,
  viewportWidth: number,
  viewportHeight: number,
  enemySize: number,
): CombatEnemy | null {
  let next = stepEnemyPosition(enemy, speedPxPerSecond, stepSeconds);
  if (
    !next.hasEnteredVisibleArea &&
    isEnemyAnyPortionVisible(next, viewportWidth, viewportHeight, enemySize)
  ) {
    next = { ...next, hasEnteredVisibleArea: true };
  }
  if (
    next.hasEnteredVisibleArea &&
    isEnemyFullyOutsideViewport(next, viewportWidth, viewportHeight, enemySize)
  ) {
    return null;
  }
  return next;
}

function stepEnemyPosition(
  enemy: CombatEnemy,
  speedPxPerSecond: number,
  stepSeconds: number,
): CombatEnemy {
  if (
    enemy.waypointX === null ||
    enemy.waypointY === null ||
    enemy.waypointReached
  ) {
    // Top entry or waypoint reached: straight down at constant speed (AC-009).
    return {
      ...enemy,
      centerY: enemy.centerY + speedPxPerSecond * stepSeconds,
    };
  }
  const dx = enemy.waypointX - enemy.centerX;
  const dy = enemy.waypointY - enemy.centerY;
  const distance = Math.hypot(dx, dy);
  const travel = speedPxPerSecond * stepSeconds;
  if (distance <= travel) {
    // Resolve the waypoint crossing without overshoot or oscillation, then use
    // the remainder of this fixed step on the downward segment. This preserves
    // the approved constant speed across the trajectory-phase boundary.
    const remainingTravel = travel - distance;
    return {
      ...enemy,
      centerX: enemy.waypointX,
      centerY: enemy.waypointY + remainingTravel,
      waypointReached: true,
    };
  }
  return {
    ...enemy,
    centerX: enemy.centerX + (dx / distance) * travel,
    centerY: enemy.centerY + (dy / distance) * travel,
  };
}

/** True when any hitbox portion is strictly inside the visible viewport. */
export function isEnemyAnyPortionVisible(
  enemy: CombatEnemy,
  viewportWidth: number,
  viewportHeight: number,
  enemySize: number,
): boolean {
  const half = enemySize / 2;
  return (
    enemy.centerX - half < viewportWidth &&
    enemy.centerX + half > 0 &&
    enemy.centerY - half < viewportHeight &&
    enemy.centerY + half > 0
  );
}

/** True when the complete hitbox is outside every viewport boundary. */
export function isEnemyFullyOutsideViewport(
  enemy: CombatEnemy,
  viewportWidth: number,
  viewportHeight: number,
  enemySize: number,
): boolean {
  const half = enemySize / 2;
  return (
    enemy.centerX + half <= 0 ||
    enemy.centerX - half >= viewportWidth ||
    enemy.centerY + half <= 0 ||
    enemy.centerY - half >= viewportHeight
  );
}
