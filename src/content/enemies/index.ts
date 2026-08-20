import type { EnemyType } from '@domain/model';

export interface EnemyDefinition {
  readonly type: EnemyType;
  readonly displayName: string;
  /** Maximum Hull Integrity for the enemy (validated at catalogue load). */
  readonly maximumHullIntegrity: number;
  /** Movement speed in fractions of the viewport height per second. */
  readonly movementSpeedViewportHeightPerSecond: number;
}

export const BASIC_DRONE: EnemyDefinition = {
  type: 'basic-drone',
  displayName: 'Basic Drone',
  maximumHullIntegrity: 3,
  movementSpeedViewportHeightPerSecond: 0.12,
};

export const ENEMIES: readonly EnemyDefinition[] = [BASIC_DRONE];
