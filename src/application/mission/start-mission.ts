import { COMBAT_MISSION_STREAM, deriveStreamSeed } from '@domain/index';
import type { MissionId } from '@domain/index';
import type { ContentCatalogue } from '../content';
import type { CampaignStorePort } from '../persistence';
import type { SessionStore } from '../session';
import type { MissionSnapshot } from './snapshot';

export type MissionStartResult =
  | { readonly kind: 'accepted'; readonly snapshot: MissionSnapshot }
  | {
      readonly kind: 'rejected';
      readonly reason:
        | 'no-session'
        | 'mission-not-found'
        | 'mission-not-available'
        | 'mission-not-ready'
        | 'active-mission-exists'
        | 'mission-result-pending'
        | 'persist-failed';
    };

export interface StartMissionDeps {
  readonly store: SessionStore;
  readonly campaignStore: CampaignStorePort;
  readonly content: ContentCatalogue;
}

/**
 * One accepted Start Mission command (Base §5.5, §9.4; Epic §13.2, V02-AC-020;
 * V02-WI-03 delta: selected-mission validation). The caller supplies the
 * authored mission id selected in Mission Details; the command validates that
 * the mission exists in the validated registry and is unlocked by the current
 * persisted progression (a locked mission can never reach the mission-start
 * transaction — the UI also prevents it, but the application boundary is the
 * authority).
 *
 * When accepted, the command calls the atomic campaign-start port (V02-WI-02
 * correction C04): the adapter validates the campaign, allocates the next
 * globally unique monotonic attempt id from the dedicated non-resetting
 * allocator store, persists the exact `missionInProgress` marker, and returns
 * the applied campaign plus the allocated id — all in one IndexedDB
 * transaction. Combat becomes active ONLY after that durable write succeeds
 * (Epic §13.2). The command carries the allocated id in the immutable Mission
 * Snapshot as `missionAttemptId`, SEPARATE from the session-local
 * `missionInstanceOrdinal`; it is never inferred, predicted, or precomputed
 * outside the transaction. The port rejects when a mission is already in
 * progress, so repeated/racing start callbacks can never create a second
 * snapshot or run.
 *
 * If the persistence write fails, Combat does not start and the existing
 * mission-initialization-failure UX applies; no reward or progression changes
 * (Epic §13.2).
 */
export async function startMission(
  deps: StartMissionDeps,
  missionId: MissionId,
): Promise<MissionStartResult> {
  const session = deps.store.getState();
  if (session === null) {
    return { kind: 'rejected', reason: 'no-session' };
  }
  // Selected-mission validation resolves from the injected validated catalogue
  // (V02-WI-03 correction): a mission id missing from the injected catalogue is
  // rejected before any mission-start transaction, so a mismatched injected
  // catalogue can never start a substituted global mission.
  const mission = deps.content.missions.find(
    (candidate) => candidate.id === missionId,
  );
  if (mission === undefined) {
    return { kind: 'rejected', reason: 'mission-not-found' };
  }
  if (!session.unlockedMissionIds.includes(missionId)) {
    return { kind: 'rejected', reason: 'mission-not-available' };
  }
  // V02-WI-04/WI-05 bounded staging: Missions 01 and 02 carry their exact
  // authored Arrival Groups (V02-DEC-021/026) and may start; an unlocked
  // Mission 03 (reachable only after Mission 02 Success) is rejected before
  // any mission-start transaction until the Product Owner records its exact
  // staging — the runtime never infers geometry for a mission that has none.
  const hasRuntimeStaging = mission.encounters.some(
    (encounter) => (encounter.staging?.length ?? 0) > 0,
  );
  if (!hasRuntimeStaging) {
    return { kind: 'rejected', reason: 'mission-not-ready' };
  }
  if (session.activeMission !== 'none') {
    return { kind: 'rejected', reason: 'active-mission-exists' };
  }
  // S12-WI01: while a committed Mission Result is pending (the Result Overlay
  // is the only continuation point), a new Start Mission command is rejected at
  // the application boundary as well as through the blocking UI.
  if (session.missionResult !== null) {
    return { kind: 'rejected', reason: 'mission-result-pending' };
  }
  const missionInstanceOrdinal = session.missionInstanceCount;

  let outcome;
  try {
    outcome = await deps.campaignStore.startMission(missionId);
  } catch {
    // Allocator overflow or infrastructure failure: fail safely before any
    // partial campaign state; no id is reissued and no marker is written.
    return { kind: 'rejected', reason: 'persist-failed' };
  }
  if (outcome.kind === 'missing' || outcome.kind === 'invalid') {
    return { kind: 'rejected', reason: 'persist-failed' };
  }
  if (outcome.kind === 'no-change') {
    // missionInProgress is already persisted for this run (stale/racing start
    // callback): no second snapshot, Pilot, or run is created.
    return { kind: 'rejected', reason: 'active-mission-exists' };
  }
  const snapshot: MissionSnapshot = {
    missionId,
    missionInstanceOrdinal,
    missionAttemptId: outcome.attemptId,
    combatMissionSeed: deriveStreamSeed(
      session.sessionSeed,
      COMBAT_MISSION_STREAM,
      missionInstanceOrdinal,
    ),
    aircraftId: session.aircraftId,
    hullIntegrity: session.hullIntegrity,
    equippedWeapon: session.equippedWeapon,
    pilot: session.pilot,
    mouseMovementEnabled: session.mouseMovementEnabled,
  };

  deps.store.dispatch({ type: 'mission/start', snapshot });
  return { kind: 'accepted', snapshot };
}
