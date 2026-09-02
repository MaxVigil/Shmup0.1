import type { WeaponDefinition } from '@application/content';

/**
 * Projectile simulation (Combat §8, S09; v0.2 §9.2/§10, V02-WI-04). Authoritative
 * player-projectile state — identity, damage, muzzle placement, upward constant
 * movement, age, and removal — lives here as pure deterministic functions
 * consumed by the Combat simulation. The v0.2 enemy (Ranged) projectile is a
 * separate authoritative type: a solid horizontal `danger` rectangle with its
 * own geometry, fixed aimed trajectory, no artificial lifetime, and removal on
 * a valid Aircraft hit or complete viewport exit. Collision consumption
 * (removal by a valid hit) is owned by the collision phase; movement/geometry
 * removal is owned here.
 */

/** Combat §8.3: width and height are viewport-short-side ratios. */
export const PROJECTILE_WIDTH_RATIO = 0.005;
export const PROJECTILE_HEIGHT_RATIO = 0.015;

/** v0.2 §9.2: the Ranged projectile is `1.2% × 0.6%` of viewport short side. */
export const RANGED_PROJECTILE_WIDTH_RATIO = 0.012;
export const RANGED_PROJECTILE_HEIGHT_RATIO = 0.006;

/** v0.2 §9.2 Ranged projectile damage. */
export const RANGED_PROJECTILE_DAMAGE = 12;

/** v0.2 §9.2 Ranged projectile speed in viewport heights per second. */
export const RANGED_PROJECTILE_SPEED_VIEWPORT_HEIGHTS_PER_SECOND = 0.24;

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

/** Width `1.2%` and height `0.6%` of the viewport short side (v0.2 §9.2). */
export function rangedProjectileGeometry(
  shortSide: number,
): ProjectileGeometry {
  return {
    width: shortSide * RANGED_PROJECTILE_WIDTH_RATIO,
    height: shortSide * RANGED_PROJECTILE_HEIGHT_RATIO,
  };
}

/** `projectileSpeed = weapon × viewportHeight` (v0.2 §10: MG `55%`, Cannon
 *  `45%` of viewport height per second). */
export function projectileSpeedPxPerSecond(
  viewportHeight: number,
  weapon: WeaponDefinition,
): number {
  return viewportHeight * weapon.projectileSpeedViewportHeightPerSecond;
}

/** `rangedProjectileSpeed = 24% of viewport height per second` (v0.2 §9.2). */
export function rangedProjectileSpeedPxPerSecond(
  viewportHeight: number,
): number {
  return viewportHeight * RANGED_PROJECTILE_SPEED_VIEWPORT_HEIGHTS_PER_SECOND;
}

/**
 * Exact shot spacing in fixed steps (`shotInterval = 1 / fireRate`, Combat
 * §8.2). Integer step counting is drift-free: the first projectile fires at
 * creation, then exactly one per `stepsPerShot` steps — Machine Gun 12 steps
 * (5 shots/s), Cannon 40 steps (1.5 shots/s) under the v0.2 §10 tuning.
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
 * hit is the collision-owned consumption condition.
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

/**
 * Authoritative enemy (Ranged) projectile (v0.2 §9.2, V02-AC-006): a fixed
 * straight-line trajectory aimed at the Aircraft centre at the firing instant.
 * It carries its own complete rendered bounds (the AABB equals those bounds),
 * never homes, has no artificial lifetime, and is removed on a valid Aircraft
 * hit or after its complete bounds leave the viewport.
 */
export interface EnemyProjectile {
  readonly id: number;
  readonly kind: 'ranged';
  readonly damage: number;
  readonly centerX: number;
  readonly centerY: number;
  /** Fixed direction × speed, in px/s; never changed after spawn. */
  readonly velocityX: number;
  readonly velocityY: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Spawns one Ranged projectile from the central lower muzzle (v0.2 §9.2): the
 * projectile's horizontal centre matches the Ranged centre and its top edge
 * touches the Ranged's bottom edge. The velocity aims at the Aircraft centre
 * at this authoritative firing instant; the trajectory is then fixed.
 */
export function spawnRangedProjectile(
  id: number,
  rangedCenterX: number,
  rangedBottomY: number,
  aircraftCenterX: number,
  aircraftCenterY: number,
  speedPxPerSecond: number,
  geometry: ProjectileGeometry,
): EnemyProjectile {
  // V02-WI-04 C01: the projectile's TOP edge touches the Ranged bottom edge,
  // so the centre is one projectile half-height BELOW the muzzle (the previous
  // sign placed the bottom edge there instead).
  const centerY = rangedBottomY + geometry.height / 2;
  const dx = aircraftCenterX - rangedCenterX;
  const dy = aircraftCenterY - centerY;
  const distance = Math.hypot(dx, dy);
  // A zero-distance aim (the aircraft exactly on the muzzle) degrades to a
  // straight downward trajectory so the fixed direction is always defined.
  const unitX = distance > 0 ? dx / distance : 0;
  const unitY = distance > 0 ? dy / distance : 1;
  return {
    id,
    kind: 'ranged',
    damage: RANGED_PROJECTILE_DAMAGE,
    centerX: rangedCenterX,
    centerY,
    velocityX: unitX * speedPxPerSecond,
    velocityY: unitY * speedPxPerSecond,
    width: geometry.width,
    height: geometry.height,
  };
}

/** Fixed straight-line movement at the spawned velocity. */
export function advanceEnemyProjectile(
  projectile: EnemyProjectile,
  stepSeconds: number,
): EnemyProjectile {
  return {
    ...projectile,
    centerX: projectile.centerX + projectile.velocityX * stepSeconds,
    centerY: projectile.centerY + projectile.velocityY * stepSeconds,
  };
}

/** True when the complete rendered bounds have left the viewport (v0.2 §9.2:
 *  removal on complete-viewport exit; a partially visible projectile stays). */
export function isEnemyProjectileOutsideViewport(
  projectile: EnemyProjectile,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  const halfWidth = projectile.width / 2;
  const halfHeight = projectile.height / 2;
  return (
    projectile.centerX + halfWidth < 0 ||
    projectile.centerX - halfWidth > viewportWidth ||
    projectile.centerY + halfHeight < 0 ||
    projectile.centerY - halfHeight > viewportHeight
  );
}
