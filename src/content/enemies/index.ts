import type { EnemyType } from '@domain/model';

/**
 * Authoritative v0.2 regular-enemy definitions (Epic §9, V02-DEC-019). Each
 * definition carries the role's complete configured rectangular rendered
 * bounds footprint (an area ratio relative to the historical Basic Drone
 * `4%`-short-side square) and the prepared-PNG aspect ratio, so the Combat
 * simulation's authoritative AABB always equals the presentation's complete
 * rendered bounds for spawn placement, activation, collision, and escape.
 * Ranged and Hunter consume the independent per-role firing/attack rules in
 * `src/application/combat/enemies.ts`; the values below are read-only content.
 */
export interface EnemyDefinition {
  readonly type: EnemyType;
  readonly displayName: string;
  /** Maximum Hull Integrity for the enemy (validated at catalogue load). */
  readonly maximumHullIntegrity: number;
  /**
   * Downward travel speed (Basic/Ranged) and Hunter approach/entry speed, in
   * fractions of the viewport height per second (Epic §9 table).
   */
  readonly movementSpeedViewportHeightPerSecond: number;
  /**
   * Locked Committed Attack Run speed in viewport heights per second (Hunter
   * `26%`; Epic §9.3). Basic/Ranged carry their movement value (unused).
   */
  readonly committedAttackSpeedViewportHeightPerSecond: number;
  /** Contact damage dealt to the Aircraft on an approved contact (Epic §11). */
  readonly contactDamage: number;
  /** Credits granted when the player destroys this enemy (Epic §12). */
  readonly playerDestructionReward: number;
  /** Credits penalty when this enemy escapes after entering (Epic §12). */
  readonly escapePenalty: number;
  /** Complete rendered-bounds area relative to the Basic square
   *  (`footprintAreaRatio × (0.04 × shortSide)²`; Epic §16.2). */
  readonly visualFootprintAreaRatio: number;
  /** Prepared-PNG width/height ratio preserved at gameplay scale (§16.4). */
  readonly visualAspectRatio: number;
}

export const BASIC_DRONE: EnemyDefinition = {
  type: 'basic-drone',
  displayName: 'Basic Drone',
  maximumHullIntegrity: 3,
  movementSpeedViewportHeightPerSecond: 0.12,
  committedAttackSpeedViewportHeightPerSecond: 0.12,
  contactDamage: 15,
  playerDestructionReward: 1,
  escapePenalty: 1,
  visualFootprintAreaRatio: 1,
  visualAspectRatio: 192 / 101,
};

export const RANGED_DRONE: EnemyDefinition = {
  type: 'ranged-drone',
  displayName: 'Ranged Drone',
  maximumHullIntegrity: 4,
  movementSpeedViewportHeightPerSecond: 0.09,
  committedAttackSpeedViewportHeightPerSecond: 0.09,
  contactDamage: 15,
  playerDestructionReward: 2,
  escapePenalty: 2,
  visualFootprintAreaRatio: 1.2,
  visualAspectRatio: 224 / 163,
};

export const HUNTER_DRONE: EnemyDefinition = {
  type: 'hunter-drone',
  displayName: 'Hunter Drone',
  maximumHullIntegrity: 3,
  movementSpeedViewportHeightPerSecond: 0.18,
  committedAttackSpeedViewportHeightPerSecond: 0.26,
  contactDamage: 35,
  playerDestructionReward: 2,
  escapePenalty: 2,
  visualFootprintAreaRatio: 0.8,
  visualAspectRatio: 114 / 192,
};

/** The v0.2 regular-enemy family consumed by Combat (Epic §3.1). The Elite is
 *  introduced by V02-WI-06 with its own definition consumer. */
export const ENEMIES: readonly EnemyDefinition[] = [
  BASIC_DRONE,
  RANGED_DRONE,
  HUNTER_DRONE,
];

/** Looks up one regular-enemy definition by type; undefined for the Elite
 *  before its V02-WI-06 consumer exists. */
export function enemyDefinitionFor(
  definitions: readonly EnemyDefinition[],
  type: EnemyType,
): EnemyDefinition | undefined {
  return definitions.find((definition) => definition.type === type);
}
