import type { PilotRecord } from '@content/index';
import type { AircraftId, WeaponType } from '@domain/index';

/**
 * Immutable Mission Snapshot (Base §9.4, S07): the complete input Combat
 * receives from one accepted Start Mission command. It captures the current
 * shared values exactly once and is never mutated by presentation or Phaser.
 * `combatMissionSeed` is the derived deterministic stream seed (Technical
 * Foundation §8) and `missionInstanceOrdinal` owns the per-session instance
 * counter, each incrementing exactly once per accepted start.
 */
export interface MissionSnapshot {
  readonly missionInstanceOrdinal: number;
  readonly combatMissionSeed: number;
  readonly aircraftId: AircraftId;
  readonly hullIntegrity: number;
  readonly equippedWeapon: WeaponType;
  readonly pilot: PilotRecord;
  readonly mouseMovementEnabled: boolean;
}
