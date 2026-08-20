import { AIRCRAFT } from './aircraft';
import type { AircraftDefinition } from './aircraft';
import { ENEMIES } from './enemies';
import type { EnemyDefinition } from './enemies';
import { MISSIONS } from './missions';
import type { MissionDefinition } from './missions';
import { PILOTS } from './pilots';
import type { PilotRecord } from './pilots';
import { PLAYER_PROJECTILE, WEAPONS } from './weapons';
import type { PlayerProjectileConfig, WeaponDefinition } from './weapons';

export interface ContentCatalogue {
  readonly aircraft: readonly AircraftDefinition[];
  readonly weapons: readonly WeaponDefinition[];
  readonly enemies: readonly EnemyDefinition[];
  readonly missions: readonly MissionDefinition[];
  readonly pilots: readonly PilotRecord[];
  readonly projectile: PlayerProjectileConfig;
}

/**
 * Canonical typed MVP content catalogue. This is the single authoritative
 * source of approved authored values (S01-TC-002); it is validated on import
 * by `src/content/index.ts` and must never be duplicated elsewhere.
 */
export const CONTENT_CATALOGUE: ContentCatalogue = Object.freeze({
  aircraft: Object.freeze([...AIRCRAFT]),
  weapons: Object.freeze([...WEAPONS]),
  enemies: Object.freeze([...ENEMIES]),
  missions: Object.freeze([...MISSIONS]),
  pilots: Object.freeze([...PILOTS]),
  projectile: PLAYER_PROJECTILE,
});
