import { CONTENT_CATALOGUE } from './catalogue';
import { validateCatalogue } from './validation';

// Fail-loud invariant: the canonical catalogue must be valid on import. An
// invalid authored catalogue is rejected, never silently repaired (S01-TC-002).
const catalogueIssues = validateCatalogue(CONTENT_CATALOGUE);
if (catalogueIssues.length > 0) {
  const detail = catalogueIssues
    .map((issue) => `- ${issue.path}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid canonical content catalogue:\n${detail}`);
}

export { CONTENT_CATALOGUE } from './catalogue';
export type { ContentCatalogue } from './catalogue';
export { AIRCRAFT, GERMAN_FIGHTER } from './aircraft';
export type { AircraftDefinition } from './aircraft';
export { CANNON, MACHINE_GUN, PLAYER_PROJECTILE, WEAPONS } from './weapons';
export type { PlayerProjectileConfig, WeaponDefinition } from './weapons';
export { BASIC_DRONE, ENEMIES } from './enemies';
export type { EnemyDefinition } from './enemies';
export { INTERCEPTION, MISSIONS, totalDrones } from './missions';
export type { EnemyGroupSchedule, MissionDefinition } from './missions';
export { PILOTS } from './pilots';
export type { PilotRecord } from './pilots';
export { isContentCatalogue, validateCatalogue } from './validation';
export type { ContentValidationIssue } from './validation';
