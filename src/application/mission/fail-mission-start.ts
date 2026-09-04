import { clearMissionInProgress } from '@domain/index';
import type { MissionId } from '@domain/index';
import type { CampaignStorePort } from '../persistence';
import type { SessionState, SessionStore } from '../session';

export type FailMissionStartOutcome =
  'cleared' | 'absent' | 'conflict' | 'inert' | 'failed' | 'busy';

export interface FailMissionStartDeps {
  readonly store: SessionStore;
  readonly campaignStore: CampaignStorePort;
}

/**
 * The immutable originating Mission Snapshot identity of one failed Combat
 * initialization (V02-DEC-031). The session-local `missionInstanceOrdinal`
 * restarts per session/application instance and is never durable authority;
 * the persisted marker is cleared only when BOTH the exact mission id AND the
 * exact campaign-authoritative attempt id match.
 */
export interface MissionStartRecoveryIdentity {
  readonly missionId: MissionId;
  readonly missionAttemptId: number;
  readonly missionInstanceOrdinal: number;
}

/** True while the session still owns the exact originating Mission Snapshot. */
export function ownsMissionStartSnapshot(
  session: SessionState | null,
  identity: MissionStartRecoveryIdentity,
): boolean {
  return (
    session !== null &&
    session.activeMission !== 'none' &&
    session.activeMission.missionId === identity.missionId &&
    session.activeMission.missionAttemptId === identity.missionAttemptId &&
    session.activeMission.missionInstanceOrdinal ===
      identity.missionInstanceOrdinal
  );
}

/**
 * Combat-initialization-failure cleanup transaction (Base AC-014, Epic §13.2,
 * V02-DEC-031, V02-AC-020): after a Start Mission persisted the exact
 * `missionInProgress` marker but the lazy Combat initialization rejected, this
 * application-owned command atomically clears ONLY the marker whose durable
 * identity matches the originating Mission Snapshot's exact mission id plus
 * attempt id through the campaign transaction. The command never dispatches
 * session state itself; the single-flight `MissionStartRecoveryController`
 * applies the typed outcome to the application store only while this
 * application still owns the originating snapshot and is not disposed, so an
 * unmount/disposal or a late Promise completion can never reopen an Overlay or
 * clear another attempt.
 *
 * Authority classification (the command never guesses):
 * - an applied clear returns `cleared`; an already-absent marker
 *   (`no-mission-in-progress`) or a missing campaign record returns `absent`.
 *   Both are safe reconciliations to that mission's Mission Details with
 *   `Unable to start mission.` (economy, Hull, progression, Pilot, Settings,
 *   and allocator remain unchanged; no result, Repair, reward, penalty,
 *   unlock, abort, or startup-Defeat path runs);
 * - a durable marker that belongs to ANOTHER mission or attempt returns
 *   `conflict` only while this session still owns the originating snapshot;
 *   otherwise the completion is a stale no-op (`inert`);
 * - a thrown/rejected update or an unreadable campaign record returns
 *   `failed` — cleanup cannot be proven safe and nothing is cleared or
 *   claimed.
 */
export async function failMissionStart(
  deps: FailMissionStartDeps,
  identity: MissionStartRecoveryIdentity,
): Promise<FailMissionStartOutcome> {
  const session = deps.store.getState();
  if (!ownsMissionStartSnapshot(session, identity)) {
    return 'inert';
  }
  let outcome;
  try {
    outcome = await deps.campaignStore.update((current) =>
      clearMissionInProgress(
        current,
        identity.missionId,
        identity.missionAttemptId,
      ),
    );
  } catch {
    // Infrastructure failure: the durable marker state is unknown.
    return 'failed';
  }
  if (outcome.kind === 'invalid') {
    // Unreadable record: the marker state is unknown and must surface as a
    // Save Data Error on reload rather than being overwritten.
    return 'failed';
  }
  if (outcome.kind === 'missing') {
    // No campaign record, therefore no durable marker: reconciling the
    // in-memory failure cannot create a paid Defeat on reload.
    return 'absent';
  }
  if (outcome.kind === 'no-change') {
    if (outcome.reason === 'no-mission-in-progress') {
      // Stale duplicate of an already-cleared rollback: safe reconciliation.
      return 'absent';
    }
    // The durable marker belongs to another mission or campaign attempt.
    // Classify precisely: a session that already moved to a newer snapshot is
    // a strict no-op; a still-current originating snapshot whose durable
    // authority belongs to another marker is the Save Conflict case.
    return ownsMissionStartSnapshot(deps.store.getState(), identity)
      ? 'conflict'
      : 'inert';
  }
  return 'cleared';
}

/**
 * V02-DEC-031 single-flight Mission Start Recovery controller. `Retry Cleanup`
 * is the only continuation of the blocking Mission Start Recovery Error
 * Overlay and re-runs the SAME originating mission id plus attempt id through
 * `failMissionStart`. Exactly one cleanup may be in flight at a time; a
 * repeated activation while one is pending resolves `busy` without touching
 * durability or state, and a repeated failure keeps the recovery shell open
 * for another retry. Store dispatches happen ONLY here and ONLY while the
 * controller is not disposed and the session still owns the exact originating
 * snapshot, so unmount/disposal and late Promise completions cannot reopen an
 * Overlay or clear another attempt (store identity guards provide the second
 * line of defence).
 */
export interface MissionStartRecoveryController {
  /** Runs the initial cleanup after Combat owner initialization failed. */
  readonly run: () => Promise<FailMissionStartOutcome>;
  /** Single-flight retry of the same originating cleanup. */
  readonly retry: () => Promise<FailMissionStartOutcome>;
  readonly dispose: () => void;
}

export function createMissionStartRecoveryController(
  deps: FailMissionStartDeps,
  identity: MissionStartRecoveryIdentity,
): MissionStartRecoveryController {
  let disposed = false;
  let inFlight = false;
  const applyDisposition = (outcome: FailMissionStartOutcome): void => {
    if (disposed) {
      return;
    }
    if (!ownsMissionStartSnapshot(deps.store.getState(), identity)) {
      return;
    }
    if (outcome === 'cleared' || outcome === 'absent') {
      // A safe reconcile returns to that mission's Mission Details with
      // `Unable to start mission.` exactly once (the identity-bound reducer
      // makes any duplicate inert).
      deps.store.dispatch({
        type: 'mission/start-failed',
        missionId: identity.missionId,
        missionAttemptId: identity.missionAttemptId,
        missionInstanceOrdinal: identity.missionInstanceOrdinal,
      });
      return;
    }
    if (outcome === 'conflict') {
      // Durable mission/attempt authority belongs to another marker: cleanup
      // is not attempted or claimed; open the exact Save Conflict state.
      deps.store.dispatch({
        type: 'combat-terminal/save-conflict',
        missionInstanceOrdinal: identity.missionInstanceOrdinal,
      });
      return;
    }
    if (outcome === 'failed') {
      // Cleanup cannot be proven safe: stay in the frozen non-interactive
      // Combat shell and open the blocking Mission Start Recovery Error
      // Overlay (Retry Cleanup is its only action).
      deps.store.dispatch({
        type: 'combat-start/recovery-error',
        missionInstanceOrdinal: identity.missionInstanceOrdinal,
      });
    }
  };
  const attempt = async (): Promise<FailMissionStartOutcome> => {
    if (disposed) {
      return 'inert';
    }
    if (inFlight) {
      return 'busy';
    }
    inFlight = true;
    try {
      const outcome = await failMissionStart(deps, identity);
      applyDisposition(outcome);
      return outcome;
    } catch {
      // Defensive: `failMissionStart` reports every persistence outcome through
      // its typed result. A rejected command (programming/contract violation)
      // must never surface as an unhandled rejection; open the recovery shell
      // only while this application still owns the originating snapshot.
      applyDisposition('failed');
      return 'failed';
    } finally {
      inFlight = false;
    }
  };
  return {
    run: attempt,
    retry: attempt,
    dispose: () => {
      disposed = true;
    },
  };
}
