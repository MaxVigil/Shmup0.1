import { describe, expect, it } from 'vitest';
import {
  HULL_INTEGRITY_MAX,
  HULL_INTEGRITY_MIN,
  isCredits,
  isDamage,
  isEnemyType,
  isFireRate,
  isHullIntegrity,
  isMissionType,
  isPositiveFinite,
  isSeconds,
  isWeaponType,
} from './index';

describe('value contracts', () => {
  it('defines the approved Hull Integrity bounds', () => {
    expect(HULL_INTEGRITY_MIN).toBe(0);
    expect(HULL_INTEGRITY_MAX).toBe(100);
  });

  it('validates Hull Integrity as integers in 0..100', () => {
    for (const valid of [0, 50, 100]) {
      expect(isHullIntegrity(valid)).toBe(true);
    }
    for (const invalid of [-1, 101, 1.5, Number.NaN, '50', null, undefined]) {
      expect(isHullIntegrity(invalid)).toBe(false);
    }
  });

  it('validates Credits as non-negative integers', () => {
    expect(isCredits(0)).toBe(true);
    expect(isCredits(5)).toBe(true);
    for (const invalid of [-1, 1.5, Number.NaN, '1']) {
      expect(isCredits(invalid)).toBe(false);
    }
  });

  it('validates Damage as positive integers', () => {
    expect(isDamage(1)).toBe(true);
    for (const invalid of [0, -1, 1.5, Number.NaN]) {
      expect(isDamage(invalid)).toBe(false);
    }
  });

  it('validates FireRate as positive finite numbers', () => {
    expect(isFireRate(6)).toBe(true);
    expect(isFireRate(0.5)).toBe(true);
    for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isFireRate(invalid)).toBe(false);
    }
  });

  it('validates Seconds as non-negative finite numbers', () => {
    expect(isSeconds(0)).toBe(true);
    expect(isSeconds(10.5)).toBe(true);
    for (const invalid of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isSeconds(invalid)).toBe(false);
    }
  });

  it('validates positive finite numbers', () => {
    expect(isPositiveFinite(0.12)).toBe(true);
    expect(isPositiveFinite(1)).toBe(true);
    for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isPositiveFinite(invalid)).toBe(false);
    }
  });
});

describe('type discriminants', () => {
  it('accepts only the approved WeaponType values', () => {
    expect(isWeaponType('machine-gun')).toBe(true);
    expect(isWeaponType('cannon')).toBe(true);
    expect(isWeaponType('rocket')).toBe(false);
    expect(isWeaponType(1)).toBe(false);
  });

  it('accepts only the approved EnemyType values', () => {
    expect(isEnemyType('basic-drone')).toBe(true);
    expect(isEnemyType('fighter')).toBe(false);
  });

  it('accepts only the approved MissionType values', () => {
    expect(isMissionType('interception')).toBe(true);
    expect(isMissionType('escort')).toBe(false);
  });
});
