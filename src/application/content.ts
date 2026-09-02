/**
 * Application seam for the immutable authored content catalogue. Presentation
 * (`src/ui`) is forbidden from importing `@content/*` directly; the context
 * and Hangar/Combat view models consume the catalogue only through this
 * application boundary (Repository Architecture §5 / eslint routing).
 */
export type { ContentCatalogue } from '@content/index';
import type { EnemyDefinition } from '@content/enemies';
export { GERMAN_FIGHTER } from '@content/aircraft';
export type { AircraftDefinition } from '@content/aircraft';
export { MACHINE_GUN } from '@content/weapons';
export type {
  PlayerProjectileConfig,
  WeaponDefinition,
} from '@content/weapons';
export {
  BASIC_DRONE,
  ENEMIES,
  HUNTER_DRONE,
  RANGED_DRONE,
  enemyDefinitionFor,
} from '@content/enemies';
export type { EnemyDefinition } from '@content/enemies';
export {
  ENCOUNTER_ENTRY_REGIONS,
  ENCOUNTER_FORMATIONS,
  INTERCEPTION_01,
  INTERCEPTION_02,
  INTERCEPTION_03,
  INTERCEPTION_MISSION_DESCRIPTION,
  MISSIONS,
  MVP_ENEMY_GROUP_SCHEDULE,
  derivedTotals,
  isEncounterEntryRegion,
  isEncounterFormation,
  totalDrones,
} from '@content/missions';
export type {
  ArrivalGroup,
  ArrivalGroupMember,
  EncounterCompositionEntry,
  EncounterDefinition,
  EncounterEntry,
  EncounterEntryRegion,
  EncounterFormation,
  EnemyGroupSchedule,
  MissionDefinition,
  MissionTotals,
  RoleDelay,
  SeededEntryVariants,
  SpawnPlacement,
} from '@content/missions';

/**
 * Complete rendered bounds at gameplay scale for one enemy role (Epic §16.1,
 * V02-DEC-019). The complete rendered area equals
 * `visualFootprintAreaRatio × (0.04 × shortSide)²` (the historical Basic Drone
 * rendered square area) and the width/height split preserves the prepared-PNG
 * aspect ratio exactly. Combat derives its authoritative AABB from this same
 * content contract so spawn placement, activation, collision, and escape always
 * equal the presentation's complete rendered bounds.
 */
export function enemyRenderedBounds(
  definition: Pick<
    EnemyDefinition,
    'visualFootprintAreaRatio' | 'visualAspectRatio'
  >,
  shortSidePx: number,
): { readonly widthPx: number; readonly heightPx: number } {
  const areaPx2 =
    definition.visualFootprintAreaRatio * (0.04 * shortSidePx) ** 2;
  return {
    widthPx: Math.sqrt(areaPx2 * definition.visualAspectRatio),
    heightPx: Math.sqrt(areaPx2 / definition.visualAspectRatio),
  };
}
