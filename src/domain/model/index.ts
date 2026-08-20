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

// --- Enemy type discriminant (Combat §7.2) ---
export const ENEMY_TYPES = ['basic-drone'] as const;
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
