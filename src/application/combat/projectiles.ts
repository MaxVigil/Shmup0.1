import type {
  PlayerProjectileConfig,
  WeaponDefinition,
} from '@application/content';

/**
 * Player-projectile simulation (Combat §8, S09). Authoritative projectile
 * state — identity, damage, muzzle placement, upward constant movement, age,
 * and removal — lives here as pure deterministic functions consumed by the
 * Combat simulation. Collision consumption (removal by a valid hit) is owned
 * by S11 through the `removeProjectileById` seam; S09 removes only on the
 * first S09-owned condition: full-bounds viewport exit or lifetime `2 s`.
 */

/** Combat §8.3: width and height are viewport-short-side ratios. */
export const PROJECTILE_WIDTH_RATIO = 0.005;
export const PROJECTILE_HEIGHT_RATIO = 0.015;

export interface CombatProjectile {
  /** Stable monotonic identity per mission (presentation visual-map key). */
  readonly id: number;
  /** Damage copied from the selected weapon at spawn (Combat §8.1). */
  readonly damage: number;
  /** Horizontal centre equals the aircraft centre at spawn. */
  readonly centerX: number;
  readonly centerY: number;
  /** Elapsed lifetime in seconds (Combat §8.1 `maximumLifetime = 2 s`). */
  readonly ageSeconds: number;
}

export interface ProjectileGeometry {
  readonly width: number;
  readonly height: number;
}

/** Width `0.5%` and height `1.5%` of the viewport short side. */
export function projectileGeometry(shortSide: number): ProjectileGeometry {
  return {
    width: shortSide * PROJECTILE_WIDTH_RATIO,
    height: shortSide * PROJECTILE_HEIGHT_RATIO,
  };
}

/** `projectileSpeed = 100% of viewport height per second` (Combat §8.1). */
export function projectileSpeedPxPerSecond(
  viewportHeight: number,
  config: PlayerProjectileConfig,
): number {
  return viewportHeight * config.speedViewportHeightPerSecond;
}

/**
 * Exact shot spacing in fixed steps (`shotInterval = 1 / fireRate`, Combat
 * §8.2). Integer step counting is drift-free: the first projectile fires at
 * creation, then exactly one per `stepsPerShot` steps — Machine Gun 10 steps
 * (6 shots/s), Cannon 30 steps (2 shots/s).
 */
export function stepsPerShotFor(fireRate: number, stepSeconds: number): number {
  return Math.max(1, Math.round(1 / fireRate / stepSeconds));
}

/**
 * Muzzle placement relative to the current aircraft sprite (Combat §8.3,
 * AC-050/076): horizontal centre equals the aircraft centre; the returned
 * centre puts the projectile's bottom edge exactly on the aircraft top edge.
 */
export function spawnProjectile(
  id: number,
  damage: number,
  aircraftCenterX: number,
  aircraftTopY: number,
  geometry: ProjectileGeometry,
): CombatProjectile {
  return {
    id,
    damage,
    centerX: aircraftCenterX,
    centerY: aircraftTopY - geometry.height / 2,
    ageSeconds: 0,
  };
}

/** Upward constant movement; the projectile never accelerates or turns. */
export function advanceProjectile(
  projectile: CombatProjectile,
  speed: number,
  stepSeconds: number,
): CombatProjectile {
  return {
    ...projectile,
    centerY: projectile.centerY - speed * stepSeconds,
    ageSeconds: projectile.ageSeconds + stepSeconds,
  };
}

/** True when the complete rendered bounds have left the viewport (Combat
 *  §8.3, AC-077): a partially visible projectile stays active. */
export function isProjectileOutsideViewport(
  projectile: CombatProjectile,
  viewportWidth: number,
  viewportHeight: number,
  geometry: ProjectileGeometry,
): boolean {
  const halfWidth = geometry.width / 2;
  const halfHeight = geometry.height / 2;
  return (
    projectile.centerX + halfWidth < 0 ||
    projectile.centerX - halfWidth > viewportWidth ||
    projectile.centerY + halfHeight < 0 ||
    projectile.centerY - halfHeight > viewportHeight
  );
}

/**
 * True on the first S09-owned removal condition (Combat §8.1): the projectile
 * has lived its full `2 s` lifetime or completely left the viewport. A valid
 * hit is the S11-owned collision-consumption condition.
 */
export function isProjectileRemoved(
  projectile: CombatProjectile,
  viewportWidth: number,
  viewportHeight: number,
  maximumLifetimeSeconds: number,
  geometry: ProjectileGeometry,
): boolean {
  return (
    projectile.ageSeconds >= maximumLifetimeSeconds ||
    isProjectileOutsideViewport(
      projectile,
      viewportWidth,
      viewportHeight,
      geometry,
    )
  );
}

/** The selected weapon's fire profile, consumed as read-only input. */
export interface WeaponFireProfile {
  readonly damage: number;
  readonly fireRate: number;
  readonly stepsPerShot: number;
}

export function resolveWeaponFireProfile(
  weapon: WeaponDefinition,
  stepSeconds: number,
): WeaponFireProfile {
  return {
    damage: weapon.damage,
    fireRate: weapon.fireRate,
    stepsPerShot: stepsPerShotFor(weapon.fireRate, stepSeconds),
  };
}
