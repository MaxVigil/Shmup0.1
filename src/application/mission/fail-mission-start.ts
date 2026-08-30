import { clearMissionInProgress } from '@domain/index';
import type { CampaignStorePort } from '../persistence';
import type { SessionStore } from '../session';

export type FailMissionStartOutcome = 'cleared' | 'inert' | 'failed';

export interface FailMissionStartDeps {
  readonly store: SessionStore;
  readonly campaignStore: CampaignStorePort;
}

/**
 * Combat-initialization-failure transaction (Base AC-014, Epic §13.2
 * correction, V02-AC-020): after a Start Mission persisted the
 * `missionInProgress` marker but the lazy Combat initialization rejected, this
 * application-owned command atomically clears ONLY the marker whose durable
 * per-attempt identity matches the failing attempt (`missionAttemptId`, the
 * campaign-authoritative serial from the Mission Snapshot — V02-WI-02
 * correction C03) through the campaign transaction and THEN reconciles the
 * in-memory session (`mission/start-failed`). The failure can therefore be
 * retried in the same session (the marker is no longer set) and can never
 * become a paid Defeat on reload (no marker, no 8-Credit deduction).
 *
 * Exact-attempt binding: the persisted marker carries the campaign-owned
 * attempt id. A stale failure callback that arrives after a NEWER attempt of
 * the same mission — including one started by an independent application
 * instance whose session-local ordinal restarts at zero — is rejected as
 * `attempt-does-not-match`; the command returns `inert` WITHOUT dispatching
 * `mission/start-failed`, so the newer session and marker stay intact. A
 * callback that finds no marker (`no-mission-in-progress`) is a stale
 * duplicate of an already-cleared rollback and still reconciles the in-memory
 * session once.
 *
 * Durable-write failure (V02-WI-02 correction C02): a rejected `update`
 * (infrastructure) or an unreadable record (`invalid`) is caught explicitly —
 * no unhandled rejection and no false claim that cleanup succeeded. The
 * command then does NOT dispatch `mission/start-failed`: the in-memory session
 * stays aligned with the still-present durable marker (no divergence) and the
 * approved Pause → Return to Base recovery remains the escape. A `missing`
 * record cannot carry a marker, so reconciling the in-memory failure is safe.
 */
export async function failMissionStart(
  deps: FailMissionStartDeps,
  missionAttemptId: number,
): Promise<FailMissionStartOutcome> {
  const session = deps.store.getState();
  if (session === null || session.activeMission === 'none') {
    return 'inert';
  }
  // The originating mission for the failure signal (V02-WI-03): Operations
  // reopens the correct Mission Details with `Unable to start mission.`.
  const missionId = session.activeMission.missionId;
  let outcome;
  try {
    outcome = await deps.campaignStore.update((current) =>
      clearMissionInProgress(current, missionAttemptId),
    );
  } catch {
    // Infrastructure failure: the durable marker state is unknown. Do not
    // claim cleanup succeeded and do not recreate a durable/in-memory
    // divergence; the session stays aligned with the persisted marker and the
    // approved Return to Base recovery remains available.
    return 'failed';
  }
  if (outcome.kind === 'invalid') {
    // Unreadable record: the marker state is unknown; the record must surface
    // as a Save Data Error on reload. Do not clear the in-memory mission.
    return 'failed';
  }
  if (outcome.kind === 'missing') {
    // No record, therefore no durable marker: reconciling the in-memory
    // failure cannot create a paid Defeat on reload.
    deps.store.dispatch({ type: 'mission/start-failed', missionId });
    return 'failed';
  }
  if (outcome.kind === 'no-change') {
    if (outcome.reason === 'attempt-does-not-match') {
      // A newer attempt owns the marker; leave its session and marker intact.
      return 'inert';
    }
    // Stale duplicate of an already-cleared rollback: reconcile once more.
    deps.store.dispatch({ type: 'mission/start-failed', missionId });
    return 'inert';
  }
  deps.store.dispatch({ type: 'mission/start-failed', missionId });
  return 'cleared';
}
