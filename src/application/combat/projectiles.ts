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

/** The complete rendered bounds every enemy projectile's AABB equals. */
export interface ProjectileBounds {
  readonly centerX: number;
  readonly centerY: number;
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
  projectile: ProjectileBounds,
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

// ---------------------------------------------------------------------------
// Elite projectiles (Epic §9.4, V02-DEC-033, V02-WI-06 E02)
// ---------------------------------------------------------------------------

/** Elite cannon projectile: `0.6% × 1.2%` of the viewport short side (§9.4). */
export const ELITE_CANNON_PROJECTILE_WIDTH_RATIO = 0.006;
export const ELITE_CANNON_PROJECTILE_HEIGHT_RATIO = 0.012;
/** Elite cannon damage per projectile (Epic §9.4). */
export const ELITE_CANNON_DAMAGE = 10;
/** Elite cannon speed `20%` of viewport height per second (Epic §9.4). */
export const ELITE_CANNON_SPEED_VIEWPORT_HEIGHTS_PER_SECOND = 0.2;
/** Exact trajectory tilt from straight downward: left `−6°`, right `+6°`. */
export const ELITE_CANNON_TILT_RADIANS = (Math.PI / 180) * 6;
/** Cannon muzzle offsets from the current Elite centre (Epic §9.4). */
export const ELITE_CANNON_MUZZLE_X_FRACTION = 0.31;
export const ELITE_CANNON_MUZZLE_Y_FRACTION = 0.18;

/** Elite homing Core: `1.2% × 1.2%` viewport-short-side square AABB (§9.4). */
export const ELITE_CORE_PROJECTILE_WIDTH_RATIO = 0.012;
export const ELITE_CORE_PROJECTILE_HEIGHT_RATIO = 0.012;
/** Elite Core damage per hit (Epic §9.4). */
export const ELITE_CORE_DAMAGE = 20;
/** Elite Core speed `12%` of viewport height per second (Epic §9.4). */
export const ELITE_CORE_SPEED_VIEWPORT_HEIGHTS_PER_SECOND = 0.12;
/** Maximum turning rate `60°/s` = exactly `1°` per fixed `1/60 s` step. */
export const ELITE_CORE_TURN_RADIANS_PER_STEP = Math.PI / 180;
/** Explicit Core lifetime `6.0 s` = exactly `360` executed fixed steps. */
export const ELITE_CORE_LIFETIME_STEPS = 360;
/** Core muzzle offset above the current Elite centre (`centreY − 2% height`). */
export const ELITE_CORE_MUZZLE_Y_FRACTION = 0.02;

/**
 * One Elite armoured-cannon projectile (Epic §9.4, V02-DEC-033): a vertical
 * solid `danger` rectangle whose complete bounds are its AABB, fired along the
 * exact `−6°`/`+6°` trajectory at a fixed speed. It never homes, has no
 * artificial lifetime, and is removed by its first valid Aircraft hit or after
 * its complete bounds leave the viewport.
 */
export interface EliteCannonProjectile {
  readonly id: number;
  readonly kind: 'elite-cannon';
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
 * One Elite Vulnerable homing Core (Epic §9.4, V02-DEC-033): a `1.2%` square
 * whose complete bounds are its AABB. It aims at the Aircraft on launch, then
 * turns along the shortest signed arc by at most `1°` per executed fixed step,
 * and expires after exactly `ELITE_CORE_LIFETIME_STEPS` executed steps.
 *
 * `headingRadians` is measured from straight downward and positive toward
 * screen-right (`velocityX = sin × speed`, `velocityY = cos × speed`) — the
 * same convention as the `−6°/+6°` cannon trajectories.
 */
export interface EliteHomingCore {
  readonly id: number;
  readonly kind: 'elite-core';
  readonly damage: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly headingRadians: number;
  readonly speedPxPerSecond: number;
  /** Remaining executed fixed steps of the explicit `6.0 s` lifetime. */
  readonly remainingLifetimeSteps: number;
  readonly width: number;
  readonly height: number;
}

/** Every authoritative enemy projectile kind (single-hit lifecycle, Epic §10). */
export type EnemyProjectileInstance =
  EnemyProjectile | EliteCannonProjectile | EliteHomingCore;

/** `0.6% × 1.2%` of the viewport short side (Epic §9.4). */
export function eliteCannonProjectileGeometry(
  shortSide: number,
): ProjectileGeometry {
  return {
    width: shortSide * ELITE_CANNON_PROJECTILE_WIDTH_RATIO,
    height: shortSide * ELITE_CANNON_PROJECTILE_HEIGHT_RATIO,
  };
}

/** `1.2% × 1.2%` of the viewport short side (Epic §9.4). */
export function eliteCoreProjectileGeometry(
  shortSide: number,
): ProjectileGeometry {
  return {
    width: shortSide * ELITE_CORE_PROJECTILE_WIDTH_RATIO,
    height: shortSide * ELITE_CORE_PROJECTILE_HEIGHT_RATIO,
  };
}

/** Elite cannon speed `20% VH/s` (Epic §9.4). */
export function eliteCannonSpeedPxPerSecond(viewportHeight: number): number {
  return viewportHeight * ELITE_CANNON_SPEED_VIEWPORT_HEIGHTS_PER_SECOND;
}

/** Elite Core speed `12% VH/s` (Epic §9.4). */
export function eliteCoreSpeedPxPerSecond(viewportHeight: number): number {
  return viewportHeight * ELITE_CORE_SPEED_VIEWPORT_HEIGHTS_PER_SECOND;
}

/**
 * Exact cannon trajectory heading from straight downward (Epic §9.4): the left
 * cannon uses `−6°` and the right cannon `+6°`.
 */
export function eliteCannonHeadingRadians(side: 'left' | 'right'): number {
  return side === 'left'
    ? -ELITE_CANNON_TILT_RADIANS
    : ELITE_CANNON_TILT_RADIANS;
}

/**
 * Spawns one Elite cannon projectile from its muzzle (Epic §9.4, V02-DEC-033):
 * the muzzle point is `centreX ± 31%` of the current Elite width and `centreY −
 * 18%` of its current height, the projectile's top edge touches that muzzle
 * point (so its centre sits one vertical half-height below it and the
 * authoritative top-centre travels along the heading), and the trajectory is
 * the exact fixed `−6°`/`+6°` heading at `20% VH/s`.
 */
export function spawnEliteCannonProjectile(
  id: number,
  eliteCenterX: number,
  eliteCenterY: number,
  eliteWidth: number,
  eliteHeight: number,
  side: 'left' | 'right',
  speedPxPerSecond: number,
  geometry: ProjectileGeometry,
): EliteCannonProjectile {
  const muzzleX =
    eliteCenterX +
    (side === 'left' ? -1 : 1) * eliteWidth * ELITE_CANNON_MUZZLE_X_FRACTION;
  const muzzleY = eliteCenterY - eliteHeight * ELITE_CANNON_MUZZLE_Y_FRACTION;
  const heading = eliteCannonHeadingRadians(side);
  return {
    id,
    kind: 'elite-cannon',
    damage: ELITE_CANNON_DAMAGE,
    centerX: muzzleX,
    centerY: muzzleY + geometry.height / 2,
    velocityX: Math.sin(heading) * speedPxPerSecond,
    velocityY: Math.cos(heading) * speedPxPerSecond,
    width: geometry.width,
    height: geometry.height,
  };
}

/** Fixed straight-line movement at the spawned velocity (no lifetime, §9.4). */
export function advanceEliteCannonProjectile(
  projectile: EliteCannonProjectile,
  stepSeconds: number,
): EliteCannonProjectile {
  return {
    ...projectile,
    centerX: projectile.centerX + projectile.velocityX * stepSeconds,
    centerY: projectile.centerY + projectile.velocityY * stepSeconds,
  };
}

/**
 * Spawns one Elite homing Core (Epic §9.4, V02-DEC-033). The muzzle is
 * `centreX`, `centreY − 2%` of the current Elite height, and the projectile
 * begins at that local point (it may overlap the craft while emerging, and it
 * is immediately active and collision-eligible). Its initial heading aims at
 * the Aircraft centre at launch; a zero-distance aim degrades to straight
 * downward so the initial heading is always defined.
 */
export function spawnEliteHomingCore(
  id: number,
  eliteCenterX: number,
  eliteCenterY: number,
  eliteHeight: number,
  aircraftCenterX: number,
  aircraftCenterY: number,
  speedPxPerSecond: number,
  geometry: ProjectileGeometry,
): EliteHomingCore {
  const muzzleX = eliteCenterX;
  const muzzleY = eliteCenterY - eliteHeight * ELITE_CORE_MUZZLE_Y_FRACTION;
  const dx = aircraftCenterX - muzzleX;
  const dy = aircraftCenterY - muzzleY;
  const distance = Math.hypot(dx, dy);
  return {
    id,
    kind: 'elite-core',
    damage: ELITE_CORE_DAMAGE,
    centerX: muzzleX,
    centerY: muzzleY,
    headingRadians: distance > 0 ? Math.atan2(dx, dy) : 0,
    speedPxPerSecond,
    remainingLifetimeSteps: ELITE_CORE_LIFETIME_STEPS,
    width: geometry.width,
    height: geometry.height,
  };
}

/**
 * Shortest signed heading change from `current` to `desired`, normalized to
 * `[-π, π)`. An exactly opposite heading resolves to `-π`, i.e. the canonical
 * clockwise choice: positive angles run toward screen-right (`sin` x-component)
 * so a decreasing heading rotates clockwise on screen.
 */
export function shortestHeadingTurnRadians(
  current: number,
  desired: number,
): number {
  const twoPi = Math.PI * 2;
  return ((((desired - current + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
}

/**
 * One Core movement/turn step (Epic §9.4, V02-DEC-033): the heading turns along
 * the shortest signed arc by at most `1°` toward the Aircraft centre for this
 * authoritative step, then the projectile moves along the resulting heading and
 * consumes one step of its explicit lifetime. A zero-distance target preserves
 * the prior heading, and the launch step performs no turn at all — the Core is
 * still at its full lifetime and travels along its exact launch aim, so its
 * first turn is the next executed fixed step.
 */
export function advanceEliteHomingCore(
  core: EliteHomingCore,
  aircraftCenterX: number,
  aircraftCenterY: number,
  stepSeconds: number,
): EliteHomingCore {
  const launchedThisStep =
    core.remainingLifetimeSteps === ELITE_CORE_LIFETIME_STEPS;
  let heading = core.headingRadians;
  if (!launchedThisStep) {
    const dx = aircraftCenterX - core.centerX;
    const dy = aircraftCenterY - core.centerY;
    if (dx !== 0 || dy !== 0) {
      // A target inside the turn limit snaps exactly onto its heading; a
      // further target turns by exactly one maximum step toward it.
      const desired = Math.atan2(dx, dy);
      const turn = shortestHeadingTurnRadians(heading, desired);
      heading =
        Math.abs(turn) <= ELITE_CORE_TURN_RADIANS_PER_STEP
          ? desired
          : heading + Math.sign(turn) * ELITE_CORE_TURN_RADIANS_PER_STEP;
    }
  }
  return {
    ...core,
    headingRadians: heading,
    centerX:
      core.centerX + Math.sin(heading) * core.speedPxPerSecond * stepSeconds,
    centerY:
      core.centerY + Math.cos(heading) * core.speedPxPerSecond * stepSeconds,
    remainingLifetimeSteps: core.remainingLifetimeSteps - 1,
  };
}

/**
 * True when one homing Core has completed its explicit `6.0 s` lifetime or its
 * complete bounds have left the viewport. Expiry destroys the projectile with
 * no damage (Epic §9.4).
 */
export function isEliteHomingCoreRemoved(
  core: EliteHomingCore,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  return (
    core.remainingLifetimeSteps <= 0 ||
    isEnemyProjectileOutsideViewport(core, viewportWidth, viewportHeight)
  );
}
