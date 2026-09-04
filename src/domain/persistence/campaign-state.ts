import type { AircraftId, PilotId } from '../identifiers';
import { isHullIntegrity } from '../model';
import type { MissionId, WeaponType } from '../model';
import { createPilotSelectionStream } from '../random';

/**
 * Versioned v0.2 campaign persistence contract (Epic §14.1, V02-AC-017–021).
 * `schemaVersion: 1` is the first real persisted campaign schema; there is no
 * historical schema, so a legacy migration format is never invented. Unknown
 * or unsupported versions are a non-overwriting Save Data Error.
 *
 * The campaign record is the durable run authority: Pilot, Credits, Hull,
 * equipped Primary Weapon, mission progression, run status, and the
 * `missionInProgress` active-mission marker. It is stored as one
 * application-owned record so every mutation is one atomic before/after state.
 */
export const CAMPAIGN_SCHEMA_VERSION = 1 as const;

export type CampaignRunStatus = 'active' | 'game-over';

/**
 * Persisted active-mission marker (Epic §13.2, V02-AC-020). `missionId`
 * identifies the mission; `attemptId` is the globally unique monotonic
 * per-attempt identity issued by the platform-owned non-resetting allocator
 * store inside the same atomic mission-start transaction (V02-WI-02 correction
 * C04). It is never the session-local Mission Instance ordinal (which restarts
 * in another tab/application instance and after reload) and never a
 * campaign-carried counter (confirmed New Game and corruption recovery replace
 * the campaign record and would reuse old identities) — so a stale failure,
 * Success, Defeat, or Aborted callback can only affect the exact attempt that
 * started it.
 */
export interface MissionInProgressMarker {
  readonly missionId: MissionId;
  readonly attemptId: number;
}

export interface CampaignStateV1 {
  readonly schemaVersion: 1;
  readonly runStatus: CampaignRunStatus;
  readonly credits: number;
  readonly aircraftId: AircraftId;
  readonly hullIntegrity: number;
  readonly equippedWeapon: WeaponType;
  readonly unlockedMissionIds: readonly MissionId[];
  readonly completedMissionIds: readonly MissionId[];
  /** Persisted active-mission marker; cleared only by an exact-attempt
   *  terminal commitment, an exact-attempt initialization-failure rollback, or
   *  startup Defeat recovery (Epic §4, §13.2, §14.3). */
  readonly missionInProgress: MissionInProgressMarker | null;
  readonly pilotId: PilotId;
}

/**
 * v0.2 economy values required by WI-02 consumers (Epic §12). The full v0.2
 * authored economy catalogue arrives with the mission/content consumers
 * (V02-WI-04/WI-05); until then these approved spec-table values live here as
 * named constants with their canonical source so they are never duplicated as
 * magic numbers (Code Principles §12).
 */
export const V02_STARTING_CREDITS = 12;
export const V02_DEFEAT_REPAIR_COST_CREDITS = 8;

/** Input for the canonical v0.2 New Game factory. Domain stays framework- and
 *  content-independent; the application supplies the validated catalogue
 *  values (Code Principles §12). */
export interface NewGameInput {
  readonly aircraftId: AircraftId;
  readonly maximumHullIntegrity: number;
  readonly pilotIds: readonly PilotId[];
  /** Session RNG seed used by the approved pilot-selection stream. */
  readonly sessionSeed: number;
}

/**
 * Canonical v0.2 New Game state (Epic §13.6, §14.1; V02-AC-001): 12 Starting
 * Credits, full Hull, default Machine Gun, only Interception 01 unlocked, no
 * completed missions, no mission in progress, and one Pilot drawn with equal
 * probability through the approved pilot-selection stream.
 */
export function createNewGameCampaign(input: NewGameInput): CampaignStateV1 {
  if (!isHullIntegrity(input.maximumHullIntegrity)) {
    throw new Error(
      'New Game creation failed: maximum Hull Integrity is not a valid Hull value',
    );
  }
  const pilotStream = createPilotSelectionStream(input.sessionSeed);
  const pilotIndex = pilotStream.nextInt(input.pilotIds.length);
  const pilotId = input.pilotIds[pilotIndex];
  if (pilotId === undefined) {
    throw new Error(
      'New Game creation failed: no Pilot selected from the approved list',
    );
  }
  return {
    schemaVersion: CAMPAIGN_SCHEMA_VERSION,
    runStatus: 'active',
    credits: V02_STARTING_CREDITS,
    aircraftId: input.aircraftId,
    hullIntegrity: input.maximumHullIntegrity,
    equippedWeapon: 'machine-gun',
    unlockedMissionIds: ['interception-01'],
    completedMissionIds: [],
    missionInProgress: null,
    pilotId,
  };
}
