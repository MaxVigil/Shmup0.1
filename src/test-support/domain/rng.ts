import {
  createCombatMissionStream,
  createPilotSelectionStream,
} from '@domain/random';
import type { Mulberry32 } from '@domain/random';

/** Fixed unsigned 32-bit session seed for deterministic S01 tests. */
export const TEST_SESSION_SEED = 3735928559; // 0xDEADBEEF

export function testPilotSelectionStream(): Mulberry32 {
  return createPilotSelectionStream(TEST_SESSION_SEED);
}

export function testCombatMissionStream(
  missionInstanceOrdinal: number,
): Mulberry32 {
  return createCombatMissionStream(TEST_SESSION_SEED, missionInstanceOrdinal);
}
