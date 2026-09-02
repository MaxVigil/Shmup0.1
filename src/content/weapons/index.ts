import type { WeaponType } from '@domain/model';

export interface WeaponDefinition {
  readonly type: WeaponType;
  readonly displayName: string;
  /** Damage per hit (positive integer; validated at catalogue load). */
  readonly damage: number;
  /** Shots per second (positive; validated at catalogue load). */
  readonly fireRate: number;
  /** Projectile speed in viewport heights per second (v0.2 §10 table:
   *  Machine Gun `55%`, Cannon `45%`; validated at catalogue load). */
  readonly projectileSpeedViewportHeightPerSecond: number;
}

/**
 * Canonical shared player-projectile configuration (Combat §8.1, v0.2 §10):
 * Machine Gun and Cannon share the same `2 s` maximum lifetime and hitbox
 * rules; their different speeds are per-weapon content values.
 */
export interface PlayerProjectileConfig {
  /** Maximum lifetime in seconds (positive; validated at catalogue load). */
  readonly maximumLifetimeSeconds: number;
}

export const PLAYER_PROJECTILE: PlayerProjectileConfig = {
  maximumLifetimeSeconds: 2,
};

export const MACHINE_GUN: WeaponDefinition = {
  type: 'machine-gun',
  displayName: 'Machine Gun',
  damage: 1,
  fireRate: 5,
  projectileSpeedViewportHeightPerSecond: 0.55,
};

export const CANNON: WeaponDefinition = {
  type: 'cannon',
  displayName: 'Cannon',
  damage: 3,
  fireRate: 1.5,
  projectileSpeedViewportHeightPerSecond: 0.45,
};

export const WEAPONS: readonly WeaponDefinition[] = [MACHINE_GUN, CANNON];
