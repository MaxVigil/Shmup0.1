import { describe, expect, it } from 'vitest';
import {
  BASIC_DRONE,
  CANNON,
  CONTENT_CATALOGUE,
  GERMAN_FIGHTER,
  INTERCEPTION_01,
  INTERCEPTION_02,
  INTERCEPTION_03,
  MACHINE_GUN,
  MISSIONS,
  MVP_ENEMY_GROUP_SCHEDULE,
  PILOTS,
  PLAYER_PROJECTILE,
  derivedTotals,
  totalDrones,
} from './index';

describe('canonical content catalogue', () => {
  it('loads a validated catalogue', () => {
    expect(CONTENT_CATALOGUE.aircraft).toHaveLength(1);
    expect(CONTENT_CATALOGUE.weapons).toHaveLength(2);
    expect(CONTENT_CATALOGUE.enemies).toHaveLength(1);
    expect(CONTENT_CATALOGUE.missions).toHaveLength(3);
    expect(CONTENT_CATALOGUE.pilots).toHaveLength(6);
  });

  it('defines the single German Fighter aircraft with 100 maximum Hull Integrity', () => {
    expect(GERMAN_FIGHTER.id).toBe('german-fighter');
    expect(GERMAN_FIGHTER.displayName).toBe('German Fighter');
    expect(GERMAN_FIGHTER.maximumHullIntegrity).toBe(100);
  });

  it('defines Machine Gun and Cannon with the approved damage and fire rate', () => {
    expect(MACHINE_GUN.type).toBe('machine-gun');
    expect(MACHINE_GUN.damage).toBe(1);
    expect(MACHINE_GUN.fireRate).toBe(6);
    expect(CANNON.type).toBe('cannon');
    expect(CANNON.damage).toBe(3);
    expect(CANNON.fireRate).toBe(2);
  });

  it('defines the Basic Drone enemy with the approved durability and movement speed', () => {
    expect(BASIC_DRONE.type).toBe('basic-drone');
    expect(BASIC_DRONE.maximumHullIntegrity).toBe(3);
    expect(BASIC_DRONE.movementSpeedViewportHeightPerSecond).toBe(0.12);
  });

  it('defines the shared player-projectile configuration', () => {
    expect(PLAYER_PROJECTILE.speedViewportHeightPerSecond).toBe(1);
    expect(PLAYER_PROJECTILE.maximumLifetimeSeconds).toBe(2);
    expect(CONTENT_CATALOGUE.projectile).toBe(PLAYER_PROJECTILE);
  });

  it('defines the approved v0.2 mission registry in authored order (Epic §8)', () => {
    expect(MISSIONS.map((mission) => mission.id)).toEqual([
      'interception-01',
      'interception-02',
      'interception-03',
    ]);
    expect(MISSIONS.map((mission) => mission.displayName)).toEqual([
      'Interception 01',
      'Interception 02',
      'Interception 03',
    ]);
    // Completion rewards (Epic §12) and unlock chain (Epic §6.2).
    expect(INTERCEPTION_01.completionReward).toBe(8);
    expect(INTERCEPTION_01.unlocksMissionId).toBe('interception-02');
    expect(INTERCEPTION_02.completionReward).toBe(12);
    expect(INTERCEPTION_02.unlocksMissionId).toBe('interception-03');
    expect(INTERCEPTION_03.completionReward).toBe(16);
    expect(INTERCEPTION_03.unlocksMissionId).toBeNull();
    // Authored final arrival and maximum reward facts (Epic §8.1–8.3).
    expect(INTERCEPTION_01.maximumCombatReward).toBe(22);
    expect(INTERCEPTION_01.maximumSuccessPayout).toBe(30);
    expect(INTERCEPTION_02.maximumCombatReward).toBe(27);
    expect(INTERCEPTION_02.maximumSuccessPayout).toBe(39);
    expect(INTERCEPTION_03.maximumCombatReward).toBe(35);
    expect(INTERCEPTION_03.maximumSuccessPayout).toBe(51);
  });

  it('matches the exact Interception 01 authored timeline (Epic §8.1)', () => {
    expect(INTERCEPTION_01.encounters.map((e) => e.timeSeconds)).toEqual([
      10, 55, 100, 140, 190,
    ]);
    expect(INTERCEPTION_01.encounters.map((e) => e.id)).toEqual([
      'interception-01-e1',
      'interception-01-e2',
      'interception-01-e3',
      'interception-01-e4',
      'interception-01-e5',
    ]);
    expect(INTERCEPTION_01.encounters[2]?.entry).toEqual({
      kind: 'seeded',
      variants: ['upper-left', 'upper-right'],
    });
    expect(derivedTotals(INTERCEPTION_01)).toEqual({
      basic: 12,
      ranged: 2,
      hunter: 3,
      elite: 0,
    });
  });

  it('matches the exact Interception 02 authored timeline (Epic §8.2)', () => {
    expect(INTERCEPTION_02.encounters.map((e) => e.timeSeconds)).toEqual([
      10, 50, 100, 150, 200, 260,
    ]);
    expect(derivedTotals(INTERCEPTION_02)).toEqual({
      basic: 15,
      ranged: 4,
      hunter: 2,
      elite: 0,
    });
  });

  it('matches the exact Interception 03 authored timeline (Epic §8.3)', () => {
    expect(INTERCEPTION_03.encounters.map((e) => e.timeSeconds)).toEqual([
      10, 55, 95, 140, 190, 235, 275, 320,
    ]);
    expect(INTERCEPTION_03.encounters[6]?.entry).toEqual({
      kind: 'seeded',
      variants: ['upper-left', 'upper-right'],
    });
    expect(INTERCEPTION_03.encounters[7]?.composition).toEqual([
      { type: 'elite-drone', count: 1 },
    ]);
    expect(derivedTotals(INTERCEPTION_03)).toEqual({
      basic: 13,
      ranged: 4,
      hunter: 3,
      elite: 1,
    });
  });

  it('retains the temporary v0.1 enemy-group schedule for the Combat seam only', () => {
    expect(MVP_ENEMY_GROUP_SCHEDULE.regular.startTimeSeconds).toBe(0);
    expect(MVP_ENEMY_GROUP_SCHEDULE.regular.intervalSeconds).toBe(10);
    expect(MVP_ENEMY_GROUP_SCHEDULE.regular.groupCount).toBe(11);
    expect(MVP_ENEMY_GROUP_SCHEDULE.regular.dronesPerGroup).toBe(3);
    expect(MVP_ENEMY_GROUP_SCHEDULE.final.timeSeconds).toBe(110);
    expect(MVP_ENEMY_GROUP_SCHEDULE.final.dronesPerGroup).toBe(5);
    expect(totalDrones(MVP_ENEMY_GROUP_SCHEDULE)).toBe(38);
  });

  it('defines exactly the six approved Pilot records', () => {
    expect(PILOTS.map((pilot) => pilot.name)).toEqual([
      'Олександр Коваленко',
      'Іван Петренко',
      'Марія Бондар',
      'Андрій Шевченко',
      'Олена Мельник',
      'Наталія Ткаченко',
    ]);
  });
});
