import type { PilotRecord } from '@content/index';
import type { AircraftId } from '@domain/index';
import type { WeaponType } from '@domain/index';
import type { MissionSnapshot } from '../mission/snapshot';

/**
 * The canonical Base Screen discriminant (Base §3.1). Navigation between these
 * two Screens is the only Base Screen transition in the MVP.
 */
export type BaseScreenId = 'operations' | 'hangar';

/**
 * The single authoritative Shared Session State (Base §9.1, §9.3). Application
 * and presentation read this; mutations occur only through named actions in
 * `src/application/session/store.ts`.
 */
export interface SessionState {
  readonly currentScreen: BaseScreenId;
  readonly credits: number;
  readonly aircraftId: AircraftId;
  readonly hullIntegrity: number;
  readonly equippedWeapon: WeaponType;
  readonly mouseMovementEnabled: boolean;
  readonly missionAvailable: boolean;
  readonly activeMission: 'none' | MissionSnapshot;
  /** Session RNG seed (Technical Foundation §8), retained for stream derivation. */
  readonly sessionSeed: number;
  /** Number of accepted mission starts this session; each increments once. */
  readonly missionInstanceCount: number;
  /** Set when a Combat initialization failure returns to Base (Base AC-014). */
  readonly missionStartFailed: boolean;
  readonly pilot: PilotRecord;
}
