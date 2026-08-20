import type { WeaponType } from '@domain/model';

export interface WeaponDefinition {
  readonly type: WeaponType;
  readonly displayName: string;
  /** Damage per hit (positive integer; validated at catalogue load). */
  readonly damage: number;
  /** Shots per second (positive; validated at catalogue load). */
  readonly fireRate: number;
}

/**
 * Canonical shared player-projectile configuration (Combat §8.1): Machine Gun
 * and Cannon use the same projectile speed, lifetime and hitbox rules.
 */
export interface PlayerProjectileConfig {
  /** Speed in viewport heights per second (positive; validated at catalogue load). */
  readonly speedViewportHeightPerSecond: number;
  /** Maximum lifetime in seconds (positive; validated at catalogue load). */
  readonly maximumLifetimeSeconds: number;
}

export const PLAYER_PROJECTILE: PlayerProjectileConfig = {
  speedViewportHeightPerSecond: 1,
  maximumLifetimeSeconds: 2,
};

export const MACHINE_GUN: WeaponDefinition = {
  type: 'machine-gun',
  displayName: 'Machine Gun',
  damage: 1,
  fireRate: 6,
};

export const CANNON: WeaponDefinition = {
  type: 'cannon',
  displayName: 'Cannon',
  damage: 3,
  fireRate: 2,
};

export const WEAPONS: readonly WeaponDefinition[] = [MACHINE_GUN, CANNON];
