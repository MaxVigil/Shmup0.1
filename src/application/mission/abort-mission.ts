import { applySeamAbort } from '@domain/index';
import type { CampaignStorePort } from '../persistence';
import type { SessionStore } from '../session';

export type AbortMissionOutcome = 'committed' | 'inert' | 'failed';

export interface AbortMissionDeps {
  readonly store: SessionStore;
  readonly campaignStore: CampaignStorePort;
}

/**
 * Persisted Aborted (Return to Base) commitment through the compatibility
 * seam (Base AC-034; Epic §13, V02-AC-020). The atomic campaign transaction
 * clears the `missionInProgress` marker and retains the current Combat Hull —
 * only for the exact campaign attempt id (V02-WI-02 correction C03), so a
 * stale or racing Return-to-Base callback from an older application instance
 * or mission attempt is inert before any marker clear or Hull change; only
 * after the durable write succeeds is the session updated.
 */
export async function abortMission(
  deps: AbortMissionDeps,
  combatHullIntegrity: number,
  missionAttemptId: number,
  missionInstanceOrdinal: number,
): Promise<AbortMissionOutcome> {
  const session = deps.store.getState();
  if (session === null || session.activeMission === 'none') {
    return 'inert';
  }
  if (session.activeMission.missionInstanceOrdinal !== missionInstanceOrdinal) {
    return 'inert';
  }
  const outcome = await deps.campaignStore.update((current) =>
    applySeamAbort(current, missionAttemptId, combatHullIntegrity),
  );
  if (outcome.kind === 'missing' || outcome.kind === 'invalid') {
    return 'failed';
  }
  if (outcome.kind === 'no-change') {
    // The marker was already cleared or belongs to another campaign attempt;
    // a stale duplicate is inert.
    return 'inert';
  }
  deps.store.dispatch({
    type: 'mission/result',
    result: {
      kind: 'aborted',
      missionInstanceOrdinal,
      creditsAfter: outcome.next.credits,
      hullIntegrityAfter: outcome.next.hullIntegrity,
    },
  });
  return 'committed';
}
