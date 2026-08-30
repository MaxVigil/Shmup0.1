import { applyMissionSuccess, applySeamDefeat } from '@domain/index';
import type { ContentCatalogue } from '../content';
import type { CampaignStorePort } from '../persistence';
import type { SessionStore } from '../session';
import type { CombatTerminalResult, MissionResult } from './mission-result';

export type MissionCommitOutcome = 'committed' | 'inert' | 'failed';

export interface CommitMissionResultDeps {
  readonly store: SessionStore;
  readonly campaignStore: CampaignStorePort;
  readonly content: ContentCatalogue;
}

/**
 * Terminal result commitment through the canonical persisted campaign
 * transaction (Epic §13.3/§13.5, §14.2, V02-AC-020). Combat emits only the
 * authoritative terminal trigger + final Combat Hull; this application command
 * applies the domain transition inside one atomic read-modify-write (clearing
 * `missionInProgress`, applying the result economy, and — on Success — the
 * authored completion reward, completed marking, and next-mission unlock from
 * the validated mission registry), and only after the durable write succeeds
 * does it dispatch the typed result to the session.
 *
 * Exactly-once/idempotency: the transition requires the persisted marker to
 * belong to the exact campaign `attemptId` AND the exact `missionId` that
 * started it (V02-WI-02 correction C03, V02-WI-03), so a stale or racing
 * Success/Defeat callback from an older application instance or mission attempt
 * is inert BEFORE any reward, Hull change, unlock, completion, or marker clear,
 * and repeated callbacks after the first commit are inert and can never
 * duplicate rewards, costs, unlocks, Pilots, runs, or terminal transitions
 * (V02-AC-002, V02-AC-020). A stale command for an older Mission Instance is
 * also inert at the session boundary.
 *
 * The temporary v0.1 Defeat rule (free 25-Hull emergency recovery) still runs
 * through the seam until V02-WI-05 replaces it with the paid full Repair /
 * Game Over economy.
 */
export async function commitMissionResult(
  deps: CommitMissionResultDeps,
  terminal: CombatTerminalResult,
  combatHullIntegrity: number,
  missionAttemptId: number,
  missionInstanceOrdinal: number,
): Promise<MissionCommitOutcome> {
  const session = deps.store.getState();
  if (session === null || session.activeMission === 'none') {
    return 'inert';
  }
  if (session.activeMission.missionInstanceOrdinal !== missionInstanceOrdinal) {
    return 'inert';
  }
  const { missionId } = session.activeMission;
  const mission =
    terminal.kind === 'success'
      ? deps.content.missions.find((candidate) => candidate.id === missionId)
      : undefined;
  if (terminal.kind === 'success' && mission === undefined) {
    // Defensive: the validated registry guarantees every authored mission id.
    return 'inert';
  }
  const outcome = await deps.campaignStore.update((current) => {
    if (terminal.kind === 'success') {
      return applyMissionSuccess(
        current,
        missionAttemptId,
        missionId,
        combatHullIntegrity,
        mission!.completionReward,
        mission!.unlocksMissionId,
      );
    }
    return applySeamDefeat(current, missionAttemptId);
  });
  if (outcome.kind === 'missing' || outcome.kind === 'invalid') {
    return 'failed';
  }
  if (outcome.kind === 'no-change') {
    // The marker was already cleared or belongs to another campaign attempt:
    // the result was already committed through the canonical transaction and
    // the session already presents it, or a stale callback for an older
    // attempt must stay inert. No reward, Hull change, unlock, or marker clear
    // occurs.
    return 'inert';
  }
  const result: MissionResult =
    terminal.kind === 'success'
      ? {
          kind: 'success',
          missionInstanceOrdinal,
          creditsAfter: outcome.next.credits,
          hullIntegrityAfter: outcome.next.hullIntegrity,
          creditsEarned: mission?.completionReward ?? 0,
          unlockedMissionIdsAfter: [...outcome.next.unlockedMissionIds],
          completedMissionIdsAfter: [...outcome.next.completedMissionIds],
        }
      : {
          kind: 'defeat',
          missionInstanceOrdinal,
          creditsAfter: outcome.next.credits,
          hullIntegrityAfter: outcome.next.hullIntegrity,
        };
  deps.store.dispatch({ type: 'mission/result', result });
  return 'committed';
}
