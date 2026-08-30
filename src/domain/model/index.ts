/**
 * Canonical Domain value contracts and finite type discriminants.
 *
 * These are framework-independent and contain no presentation or authored
 * balance data. Authored values live in `src/content`; content validation
 * reuses these contracts instead of duplicating their rules.
 */

// --- Hull Integrity: integer in the inclusive range 0..100 (Glossary) ---
export const HULL_INTEGRITY_MIN = 0;
export const HULL_INTEGRITY_MAX = 100;

export function isHullIntegrity(value: unknown): boolean {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= HULL_INTEGRITY_MIN &&
    value <= HULL_INTEGRITY_MAX
  );
}

// --- Credits: non-negative integer ---
export function isCredits(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

// --- Damage: positive integer ---
export function isDamage(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

// --- Fire rate: positive finite shots per second ---
export function isFireRate(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

// --- Seconds: non-negative finite duration ---
export function isSeconds(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

// --- Positive finite number (rates, durations, and ratios) ---
export function isPositiveFinite(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

// --- Weapon type discriminant (Combat §8.1) ---
export const WEAPON_TYPES = ['machine-gun', 'cannon'] as const;
export type WeaponType = (typeof WEAPON_TYPES)[number];

export function isWeaponType(value: unknown): value is WeaponType {
  return WEAPON_TYPES.some((type) => type === value);
}

// --- Enemy type discriminant (Combat §7.2, Epic §4) ---
// The four approved v0.2 enemy roles are the closed canonical set. The mission
// registry (V02-WI-03) references these roles in authored compositions; the
// enemy behaviour/definition consumers for Ranged/Hunter/Elite arrive with
// V02-WI-04 and V02-WI-06, while the temporary Combat seam keeps spawning only
// Basic Drones until then.
export const ENEMY_TYPES = [
  'basic-drone',
  'ranged-drone',
  'hunter-drone',
  'elite-drone',
] as const;
export type EnemyType = (typeof ENEMY_TYPES)[number];

export function isEnemyType(value: unknown): value is EnemyType {
  return ENEMY_TYPES.some((type) => type === value);
}

// --- Mission type discriminant (Combat §9.1) ---
export const MISSION_TYPES = ['interception'] as const;
export type MissionType = (typeof MISSION_TYPES)[number];

export function isMissionType(value: unknown): value is MissionType {
  return MISSION_TYPES.some((type) => type === value);
}

// --- Authored v0.2 mission identity (Epic §6.1, §14.1) ---
// Closed set of the three authored Interception Missions used by the versioned
// campaign persistence contract and the active-mission marker. Content
// definitions and the Operations registry arrive with V02-WI-03; the typed
// identity set is required now by the WI-02 persisted campaign schema.
export const MISSION_IDS = [
  'interception-01',
  'interception-02',
  'interception-03',
] as const;
export type MissionId = (typeof MISSION_IDS)[number];

export function isMissionId(value: unknown): value is MissionId {
  return MISSION_IDS.some((id) => id === value);
}
