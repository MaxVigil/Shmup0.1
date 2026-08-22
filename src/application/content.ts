/**
 * Application seam for the immutable authored content catalogue. Presentation
 * (`src/ui`) is forbidden from importing `@content/*` directly; the context
 * and Hangar/Combat view models consume the catalogue only through this
 * application boundary (Repository Architecture §5 / eslint routing).
 */
export type { ContentCatalogue } from '@content/index';
export { MACHINE_GUN } from '@content/weapons';
export type {
  PlayerProjectileConfig,
  WeaponDefinition,
} from '@content/weapons';
