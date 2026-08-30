import { describe, expect, it } from 'vitest';
import {
  TEST_SESSION_SEED,
  testCombatMissionStream,
  testPilotSelectionStream,
} from '@test-support/domain/rng';
import {
  COMBAT_MISSION_STREAM,
  MISSION_DATA_ORDINAL,
  MISSION_DATA_STREAM,
  PILOT_SELECTION_ORDINAL,
  PILOT_SELECTION_STREAM,
  createCombatMissionStream,
  createMissionDataStream,
  createPilotSelectionStream,
  createStream,
  deriveStreamSeed,
} from './streams';
import { fnv1a32 } from './fnv1a';

describe('stream derivation', () => {
  it('derives the approved fixed stream seeds', () => {
    expect(deriveStreamSeed(TEST_SESSION_SEED, 'pilot-selection', 0)).toBe(
      482040656,
    );
    expect(deriveStreamSeed(TEST_SESSION_SEED, 'combat-mission', 0)).toBe(
      374316068,
    );
    expect(deriveStreamSeed(TEST_SESSION_SEED, 'combat-mission', 1)).toBe(
      391093687,
    );
  });

  it('derives fixed seeds for the base-10 decimal serialization contract', () => {
    expect(deriveStreamSeed(0, 'pilot-selection', 0)).toBe(3442242154);
    expect(deriveStreamSeed(1, 'pilot-selection', 0)).toBe(3867428437);
    expect(deriveStreamSeed(0, 'combat-mission', 0)).toBe(3870177730);
  });

  it('serializes the session seed as plain base-10 decimal ASCII', () => {
    expect(deriveStreamSeed(0, 'pilot-selection', 0)).toBe(
      fnv1a32('shmup-mvp:rng-v1|0|pilot-selection|0'),
    );
    expect(deriveStreamSeed(1, 'pilot-selection', 0)).toBe(
      fnv1a32('shmup-mvp:rng-v1|1|pilot-selection|0'),
    );
    expect(deriveStreamSeed(3735928559, 'pilot-selection', 0)).toBe(
      fnv1a32('shmup-mvp:rng-v1|3735928559|pilot-selection|0'),
    );
  });

  it('exposes the approved stream names and ordinals', () => {
    expect(PILOT_SELECTION_STREAM).toBe('pilot-selection');
    expect(COMBAT_MISSION_STREAM).toBe('combat-mission');
    expect(MISSION_DATA_STREAM).toBe('mission-data');
    expect(PILOT_SELECTION_ORDINAL).toBe(0);
    expect(MISSION_DATA_ORDINAL).toBe(0);
  });

  it('derives the approved fixed mission-data stream seed and sequence (V02-WI-03)', () => {
    expect(deriveStreamSeed(TEST_SESSION_SEED, MISSION_DATA_STREAM, 0)).toBe(
      3589906066,
    );
    const stream = createMissionDataStream(TEST_SESSION_SEED);
    expect(stream.nextUint32()).toBe(2560335256);
    expect(stream.nextUint32()).toBe(3477332877);
  });

  it('keeps mission-data independent of the combat-mission stream sequence', () => {
    const missionData = createMissionDataStream(TEST_SESSION_SEED);
    const combat = testCombatMissionStream(0);
    const missionDataValues = [
      missionData.nextUint32(),
      missionData.nextUint32(),
    ];
    const combatValues = [combat.nextUint32(), combat.nextUint32()];
    expect(missionDataValues).toEqual([2560335256, 3477332877]);
    expect(combatValues).toEqual([1437069935, 1763999852]);
    expect(missionDataValues).not.toEqual(combatValues);
  });

  it('keeps pilot-selection and combat-mission streams independent', () => {
    const pilotSeed = deriveStreamSeed(
      TEST_SESSION_SEED,
      PILOT_SELECTION_STREAM,
      0,
    );
    const combatSeed = deriveStreamSeed(
      TEST_SESSION_SEED,
      COMBAT_MISSION_STREAM,
      0,
    );
    expect(pilotSeed).not.toBe(combatSeed);
  });

  it('derives a different seed for each combat-mission ordinal', () => {
    expect(
      deriveStreamSeed(TEST_SESSION_SEED, COMBAT_MISSION_STREAM, 0),
    ).not.toBe(deriveStreamSeed(TEST_SESSION_SEED, COMBAT_MISSION_STREAM, 1));
  });

  it('derives the same seed for the same inputs', () => {
    expect(deriveStreamSeed(TEST_SESSION_SEED, 'pilot-selection', 0)).toBe(
      deriveStreamSeed(TEST_SESSION_SEED, 'pilot-selection', 0),
    );
  });

  it('produces independent pilot-selection and combat-mission stream sequences', () => {
    const pilot = testPilotSelectionStream();
    const combat = testCombatMissionStream(0);
    const pilotValues = [pilot.nextUint32(), pilot.nextUint32()];
    const combatValues = [combat.nextUint32(), combat.nextUint32()];
    expect(pilotValues).toEqual([554841747, 2570790834]);
    expect(combatValues).toEqual([1437069935, 1763999852]);
    expect(pilotValues).not.toEqual(combatValues);
  });

  it('produces a different sequence for each combat-mission ordinal', () => {
    const first = createCombatMissionStream(TEST_SESSION_SEED, 0);
    const second = createCombatMissionStream(TEST_SESSION_SEED, 1);
    expect([first.nextUint32(), first.nextUint32()]).not.toEqual([
      second.nextUint32(),
      second.nextUint32(),
    ]);
  });

  it('createStream matches deriveStreamSeed plus Mulberry32', () => {
    const stream = createStream(TEST_SESSION_SEED, 'pilot-selection', 0);
    expect(stream.nextUint32()).toBe(554841747);
  });

  it('createPilotSelectionStream uses the approved stream contract', () => {
    const stream = createPilotSelectionStream(TEST_SESSION_SEED);
    expect(stream.nextUint32()).toBe(554841747);
  });

  it('rejects invalid session seeds', () => {
    for (const invalid of [-1, 4294967296, 1.5, Number.NaN]) {
      expect(() => deriveStreamSeed(invalid, 'pilot-selection', 0)).toThrow(
        RangeError,
      );
    }
  });

  it('rejects invalid ordinals', () => {
    for (const invalid of [-1, 1.5, Number.NaN]) {
      expect(() =>
        deriveStreamSeed(TEST_SESSION_SEED, 'combat-mission', invalid),
      ).toThrow(RangeError);
    }
  });

  it('rejects an empty stream name', () => {
    expect(() => deriveStreamSeed(TEST_SESSION_SEED, '', 0)).toThrow(
      RangeError,
    );
  });
});
