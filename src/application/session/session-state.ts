import type { PilotRecord } from '@content/index';
import type {
  AircraftId,
  CampaignRunStatus,
  MissionId,
  WeaponType,
} from '@domain/index';
import type { CombatLifecycleState } from '../combat/lifecycle';
import type { MissionSnapshot } from '../mission/snapshot';

/**
 * Persisted campaign run status (Epic §14.1, V02-AC-016–018); re-exported for
 * the session surface.
 */
export type { CampaignRunStatus };

/**
 * The canonical Base Screen discriminant (Base §3.1). Navigation between these
 * two Screens is the only Base Screen transition in the MVP.
 */
export type BaseScreenId = 'operations' | 'hangar';

/**
 * The presented Mission Result read model (S12): only Success/Defeat are
 * presented by the Result Overlay; Aborted opens Operations directly. The
 * `missionInstanceOrdinal` binds consumption to the originating mission.
 */
export interface PresentedMissionResult {
  readonly kind: 'success' | 'defeat';
  readonly missionInstanceOrdinal: number;
  /** Credits earned by the presented Success (temporary seam overlay value). */
  readonly creditsEarned: number;
}

/**
 * The single authoritative Shared Session State (Base §9.1, §9.3; Epic §14.1).
 * Application and presentation read this; mutations occur only through named
 * actions in `src/application/session/store.ts`. WI-02 hydrates it exactly
 * once from the persisted campaign plus persisted user Settings.
 */
export interface SessionState {
  readonly currentScreen: BaseScreenId;
  readonly credits: number;
  readonly aircraftId: AircraftId;
  readonly hullIntegrity: number;
  readonly equippedWeapon: WeaponType;
  readonly mouseMovementEnabled: boolean;
  readonly runStatus: CampaignRunStatus;
  /** Authored mission ids unlocked by the persisted campaign (Epic §6.1,
   *  V02-AC-001). Replaces the v0.1 single `missionAvailable` boolean; a mission
   *  is launchable only when present here (V02-WI-03). */
  readonly unlockedMissionIds: readonly MissionId[];
  /** Authored mission ids completed by a first-or-later Success (Epic §6.2,
   *  V02-AC-002); completed missions remain replayable. */
  readonly completedMissionIds: readonly MissionId[];
  readonly activeMission: 'none' | MissionSnapshot;
  /** Session RNG seed (Technical Foundation §8), retained for stream derivation. */
  readonly sessionSeed: number;
  /** Number of accepted mission starts this session; each increments once. */
  readonly missionInstanceCount: number;
  /** Set when a Combat initialization failure returns to Base (Base AC-014). */
  readonly missionStartFailed: boolean;
  /** The mission whose Combat initialization failed (Base AC-014, V02-WI-03);
   *  `null` when no failure is signalled. Lets Operations reopen the correct
   *  Mission Details with `Unable to start mission.` after the persisted
   *  marker is rolled back. */
  readonly missionStartFailedMissionId: MissionId | null;
  /** Committed terminal mission outcome presented by the Result Overlay
   *  (Success/Defeat); `null` when no result is pending (S12). */
  readonly missionResult: PresentedMissionResult | null;
  /** S13 application-owned Combat lifecycle (running/paused, active blocking
   *  Combat Overlay, Debug restoration origin, browser-safety latch). It is
   *  meaningful only while an Active Mission exists; mission start enters the
   *  running state and mission resolution resets it to idle. */
  readonly combatLifecycle: CombatLifecycleState;
  readonly pilot: PilotRecord;
}
