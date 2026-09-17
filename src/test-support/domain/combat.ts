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
 * Shared V02-WI-04/V02-WI-05/V02-WI-06 Combat test harness. The default mission
 * is the authored Interception 01, the default seed is a fixed canonical test
 * seed, and the default viewport is the minimum supported `1280 × 600`. V02-WI-05
 * adds the authored Interception 02 and V02-WI-06 E03 the authored Interception
 * 03 (all three missions with runtime Arrival Groups) so the same harness
 * exercises the generic runtime for every mission without a mission-specific
 * fork.
 */
export const TEST_VIEWPORT = { width: 1280, height: 600 } as const;
export const AIRCRAFT_WIDTH = 48 * (1278 / 1231);
export const AIRCRAFT_HEIGHT = 48;
export const TEST_MISSION_SEED = 3735928559;

/** Authored missions that carry runtime Arrival Groups (V02-WI-04/05/06). */
export type TestMissionId =
  'interception-01' | 'interception-02' | 'interception-03';

export interface TestCombatOptions {
  readonly mode?: CombatControlMode;
  readonly weapon?: WeaponDefinition;
  readonly missionSeed?: number;
  readonly hull?: number;
  readonly missionId?: TestMissionId;
}

function resolveTestMission(missionId: TestMissionId = 'interception-01') {
  const mission = CONTENT_CATALOGUE.missions.find(
    (candidate) => candidate.id === missionId,
  );
  if (mission === undefined) {
    throw new Error(
      `Test harness: the validated mission registry has no ${missionId}.`,
    );
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
    mission: resolveTestMission(options.missionId),
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
    mission: resolveTestMission(options.missionId),
    enemies: CONTENT_CATALOGUE.enemies,
    playerHullIntegrity: options.hull ?? 100,
    playerMaximumHullIntegrity: aircraft.maximumHullIntegrity,
  });
}
