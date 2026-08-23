/**
 * Application seam for the immutable authored content catalogue. Presentation
 * (`src/ui`) is forbidden from importing `@content/*` directly; the context
 * and Hangar/Combat view models consume the catalogue only through this
 * application boundary (Repository Architecture §5 / eslint routing).
 */
export type { ContentCatalogue } from '@content/index';
export { GERMAN_FIGHTER } from '@content/aircraft';
export type { AircraftDefinition } from '@content/aircraft';
export { MACHINE_GUN } from '@content/weapons';
export type {
  PlayerProjectileConfig,
  WeaponDefinition,
} from '@content/weapons';
export { BASIC_DRONE, ENEMIES } from '@content/enemies';
export type { EnemyDefinition } from '@content/enemies';
export { INTERCEPTION } from '@content/missions';
export type { EnemyGroupSchedule, MissionDefinition } from '@content/missions';
