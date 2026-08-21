import type { PilotRecord } from '@content/index';
import type { AircraftId } from '@domain/index';
import type { WeaponType } from '@domain/index';

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
  readonly activeMission: 'none';
  readonly pilot: PilotRecord;
}
