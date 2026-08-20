import { describe, expect, it } from 'vitest';
import {
  BASIC_DRONE,
  CANNON,
  CONTENT_CATALOGUE,
  GERMAN_FIGHTER,
  INTERCEPTION,
  MACHINE_GUN,
  PILOTS,
  PLAYER_PROJECTILE,
  totalDrones,
} from './index';

describe('canonical content catalogue', () => {
  it('loads a validated catalogue', () => {
    expect(CONTENT_CATALOGUE.aircraft).toHaveLength(1);
    expect(CONTENT_CATALOGUE.weapons).toHaveLength(2);
    expect(CONTENT_CATALOGUE.enemies).toHaveLength(1);
    expect(CONTENT_CATALOGUE.missions).toHaveLength(1);
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

  it('defines the Interception mission with a 1-Credit reward', () => {
    expect(INTERCEPTION.type).toBe('interception');
    expect(INTERCEPTION.reward).toBe(1);
  });

  it('defines the approved enemy-group schedule', () => {
    expect(INTERCEPTION.schedule.regular.startTimeSeconds).toBe(0);
    expect(INTERCEPTION.schedule.regular.intervalSeconds).toBe(10);
    expect(INTERCEPTION.schedule.regular.groupCount).toBe(11);
    expect(INTERCEPTION.schedule.regular.dronesPerGroup).toBe(3);
    expect(INTERCEPTION.schedule.final.timeSeconds).toBe(110);
    expect(INTERCEPTION.schedule.final.dronesPerGroup).toBe(5);
    expect(totalDrones(INTERCEPTION.schedule)).toBe(38);
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
