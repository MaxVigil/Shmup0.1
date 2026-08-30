import type { PilotRecord } from '@content/index';
import type { AircraftId, MissionId, WeaponType } from '@domain/index';

/**
 * Immutable Mission Snapshot (Base §9.4, S07; Epic §13.2): the complete input
 * Combat receives from one accepted Start Mission command. It captures the
 * current shared values exactly once and is never mutated by presentation or
 * Phaser. `missionId` identifies the validated authored mission started by this
 * attempt (V02-WI-03 mission registry). `combatMissionSeed` is the derived
 * deterministic stream seed (Technical Foundation §8), `missionInstanceOrdinal`
 * owns the per-session instance counter (each incrementing exactly once per
 * accepted start), and `missionAttemptId` is the campaign-authoritative durable
 * attempt serial allocated atomically by the mission-start transaction
 * (V02-WI-02 correction C03) — carried separately so every persisted
 * mission-ending callback can require an exact durable match that survives
 * reload and other application instances.
 */
export interface MissionSnapshot {
  readonly missionId: MissionId;
  readonly missionInstanceOrdinal: number;
  /** Campaign-authoritative durable per-attempt identity (V02-WI-02 C03). */
  readonly missionAttemptId: number;
  readonly combatMissionSeed: number;
  readonly aircraftId: AircraftId;
  readonly hullIntegrity: number;
  readonly equippedWeapon: WeaponType;
  readonly pilot: PilotRecord;
  readonly mouseMovementEnabled: boolean;
}
