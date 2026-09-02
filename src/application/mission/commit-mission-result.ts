import { applyMissionSuccess, applySeamDefeat } from '@domain/index';
import type { EnemyType } from '@domain/index';
import type { ContentCatalogue } from '../content';
import type { CampaignStorePort } from '../persistence';
import type { SessionStore } from '../session';
import type {
  CombatTerminalResult,
  MissionResult,
  RoleCounts,
} from './mission-result';

export type MissionCommitOutcome = 'committed' | 'inert' | 'failed';

export interface CommitMissionResultDeps {
  readonly store: SessionStore;
  readonly campaignStore: CampaignStorePort;
  readonly content: ContentCatalogue;
}

/**
 * Pending-mission-economy relay (Epic §12, V02-AC-013): the simulation-owned
 * integers and per-role counts at the Success commitment instant. The command
 * never computes or mutates economy as an authority — the domain transition
 * applies `max(0, combatRewards - escapePenalties) + completionReward` inside
 * the atomic campaign transaction; the counts are presentation-only run facts.
 */
export interface SuccessEconomyRelay {
  readonly combatRewards: number;
  readonly escapePenalties: number;
  readonly destroyedCounts: RoleCounts;
  readonly escapedCounts: RoleCounts;
}

/** Empty per-role count record for a run with no role events. */
export function emptyRoleCounts(): RoleCounts {
  const record: Record<EnemyType, number> = {
    'basic-drone': 0,
    'ranged-drone': 0,
    'hunter-drone': 0,
    'elite-drone': 0,
  };
  return record;
}

/** Result of one terminal commitment: the typed pre-committed MissionResult
 *  is returned to the caller so the session dispatch can be deferred to the
 *  deterministic Success exit-sequence completion (Epic §13.3); Defeat keeps
 *  the immediate v0.1 seam dispatch. Persist-then-session ordering is preserved
 *  because the dispatch only ever follows a resolved `committed` outcome. */
export interface CommitMissionResultResult {
  readonly outcome: MissionCommitOutcome;
  readonly result: MissionResult | null;
}

/**
 * Terminal result commitment through the canonical persisted campaign
 * transaction (Epic §13.3/§13.5, §14.2, V02-AC-020). Combat emits only the
 * authoritative terminal trigger + final Combat Hull + (on Success) the pending
 * economy relay; this application command applies the domain transition inside
 * one atomic read-modify-write (clearing `missionInProgress`, applying the
 * result economy, and — on Success — the authored completion reward, completed
 * marking, and next-mission unlock from the validated mission registry) and
 * returns the typed pre-committed MissionResult for session presentation.
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
  successEconomy?: SuccessEconomyRelay,
): Promise<CommitMissionResultResult> {
  const session = deps.store.getState();
  if (session === null || session.activeMission === 'none') {
    return { outcome: 'inert', result: null };
  }
  if (session.activeMission.missionInstanceOrdinal !== missionInstanceOrdinal) {
    return { outcome: 'inert', result: null };
  }
  const { missionId } = session.activeMission;
  const creditsBefore = session.credits;
  const mission =
    terminal.kind === 'success'
      ? deps.content.missions.find((candidate) => candidate.id === missionId)
      : undefined;
  if (terminal.kind === 'success' && mission === undefined) {
    // Defensive: the validated registry guarantees every authored mission id.
    return { outcome: 'inert', result: null };
  }
  // Newly-unlocked-mission detection from the authoritative pre-commit session
  // progression (Epic §15.4: the row shows only when a mission was newly
  // unlocked by this Success).
  const newlyUnlockedMissionId =
    terminal.kind === 'success' &&
    mission!.unlocksMissionId !== null &&
    !session.unlockedMissionIds.includes(mission!.unlocksMissionId)
      ? mission!.unlocksMissionId
      : null;
  const economy = terminal.kind === 'success' ? successEconomy : undefined;
  const outcome = await deps.campaignStore.update((current) => {
    if (terminal.kind === 'success') {
      return applyMissionSuccess(
        current,
        missionAttemptId,
        missionId,
        combatHullIntegrity,
        economy?.combatRewards ?? 0,
        economy?.escapePenalties ?? 0,
        mission!.completionReward,
        mission!.unlocksMissionId,
      );
    }
    return applySeamDefeat(current, missionAttemptId);
  });
  if (outcome.kind === 'missing' || outcome.kind === 'invalid') {
    return { outcome: 'failed', result: null };
  }
  if (outcome.kind === 'no-change') {
    // The marker was already cleared or belongs to another campaign attempt:
    // the result was already committed through the canonical transaction and
    // the session already presents it, or a stale callback for an older
    // attempt must stay inert. No reward, Hull change, unlock, or marker clear
    // occurs.
    return { outcome: 'inert', result: null };
  }
  const result: MissionResult =
    terminal.kind === 'success'
      ? {
          kind: 'success',
          missionInstanceOrdinal,
          creditsAfter: outcome.next.credits,
          hullIntegrityAfter: outcome.next.hullIntegrity,
          creditsEarned: outcome.next.credits - creditsBefore,
          combatRewards: economy?.combatRewards ?? 0,
          escapePenalties: economy?.escapePenalties ?? 0,
          netCombatReward: Math.max(
            0,
            (economy?.combatRewards ?? 0) - (economy?.escapePenalties ?? 0),
          ),
          completionReward: mission!.completionReward,
          newlyUnlockedMissionId,
          destroyedCounts: economy?.destroyedCounts ?? emptyRoleCounts(),
          escapedCounts: economy?.escapedCounts ?? emptyRoleCounts(),
          unlockedMissionIdsAfter: [...outcome.next.unlockedMissionIds],
          completedMissionIdsAfter: [...outcome.next.completedMissionIds],
        }
      : {
          kind: 'defeat',
          missionInstanceOrdinal,
          creditsAfter: outcome.next.credits,
          hullIntegrityAfter: outcome.next.hullIntegrity,
        };
  // The v0.1 Defeat seam dispatches immediately (no exit sequence). A Success
  // result is returned to the caller (the presentation entry) so its session
  // dispatch can be deferred to the deterministic centre-and-up exit
  // completion (Epic §13.3); the persist-then-session ordering is preserved
  // because any dispatch only ever follows this committed outcome.
  if (result.kind !== 'success') {
    deps.store.dispatch({ type: 'mission/result', result });
  }
  return { outcome: 'committed', result };
}
