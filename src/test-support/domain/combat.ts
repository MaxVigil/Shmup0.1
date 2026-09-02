import { CONTENT_CATALOGUE } from '@test-support/content';
import { MACHINE_GUN, PLAYER_PROJECTILE } from '@content/weapons';
import type { WeaponDefinition } from '@content/weapons';
import type { CombatControlMode } from '@application/combat';
import {
  createCombatSimulation,
  createCombatSimulationRuntime,
} from '@application/combat';
import type {
  CombatSimulationRuntime,
  CombatSimulationState,
} from '@application/combat';
import { resolveGermanFighter } from '@application/combat';

/**
 * Shared V02-WI-04 Combat test harness. The default mission is the authored
 * Interception 01 (the only mission with runtime Arrival Groups in WI-04), the
 * default seed is a fixed canonical test seed, and the default viewport is the
 * minimum supported `1280 × 600`.
 */
export const TEST_VIEWPORT = { width: 1280, height: 600 } as const;
export const AIRCRAFT_WIDTH = 48 * (1278 / 1231);
export const AIRCRAFT_HEIGHT = 48;
export const TEST_MISSION_SEED = 3735928559;

export interface TestCombatOptions {
  readonly mode?: CombatControlMode;
  readonly weapon?: WeaponDefinition;
  readonly missionSeed?: number;
  readonly hull?: number;
  readonly missionId?: 'interception-01';
}

function resolveTestMission() {
  const mission =
    CONTENT_CATALOGUE.missions.find(
      (candidate) => candidate.id === 'interception-01',
    ) ?? CONTENT_CATALOGUE.missions[0];
  if (mission === undefined) {
    throw new Error('Test harness: the validated mission registry is empty.');
  }
  return mission;
}

export function createTestCombatState(
  options: TestCombatOptions = {},
): CombatSimulationState {
  const aircraft = resolveGermanFighter(CONTENT_CATALOGUE);
  return createCombatSimulation({
    initialMode: options.mode ?? 'mouse',
    viewportWidth: TEST_VIEWPORT.width,
    viewportHeight: TEST_VIEWPORT.height,
    aircraftWidth: AIRCRAFT_WIDTH,
    aircraftHeight: AIRCRAFT_HEIGHT,
    weapon: options.weapon ?? MACHINE_GUN,
    projectile: PLAYER_PROJECTILE,
    missionSeed: options.missionSeed ?? TEST_MISSION_SEED,
    mission: resolveTestMission(),
    enemies: CONTENT_CATALOGUE.enemies,
    playerHullIntegrity: options.hull ?? 100,
    playerMaximumHullIntegrity: aircraft.maximumHullIntegrity,
  });
}

export function createTestCombatRuntime(
  options: TestCombatOptions = {},
): CombatSimulationRuntime {
  const aircraft = resolveGermanFighter(CONTENT_CATALOGUE);
  return createCombatSimulationRuntime({
    initialMode: options.mode ?? 'mouse',
    viewportWidth: TEST_VIEWPORT.width,
    viewportHeight: TEST_VIEWPORT.height,
    aircraftWidth: AIRCRAFT_WIDTH,
    aircraftHeight: AIRCRAFT_HEIGHT,
    weapon: options.weapon ?? MACHINE_GUN,
    projectile: PLAYER_PROJECTILE,
    missionSeed: options.missionSeed ?? TEST_MISSION_SEED,
    mission: resolveTestMission(),
    enemies: CONTENT_CATALOGUE.enemies,
    playerHullIntegrity: options.hull ?? 100,
    playerMaximumHullIntegrity: aircraft.maximumHullIntegrity,
  });
}
