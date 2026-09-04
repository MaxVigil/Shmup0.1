import {
  applyMissionDefeat,
  applyMissionEvacuation,
  applyMissionSuccess,
  V02_DEFEAT_REPAIR_COST_CREDITS,
} from '@domain/index';
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

/** Result of one terminal commitment: the typed pre-committed MissionResult is
 *  returned to the caller (the lifecycle/presentation boundary) for EVERY
 *  outcome. Success/Evacuation defer their session dispatch to the
 *  deterministic exit-sequence completion (Epic §13.3–13.4); a committed
 *  Defeat/Game Over dispatches only after that boundary evaluates the
 *  browser-safety manual-resume latch (Epic §13.5, §13.7, V02-AC-020).
 *  Persist-then-session ordering is preserved because a session dispatch only
 *  ever follows a resolved `committed` outcome. */
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
 * The canonical v0.2 Defeat economy (zero reward; paid full Repair / Game Over)
 * applies in V02-WI-05; no v0.1 free-recovery seam remains.
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
  // V02-WI-05 C04: the exact durable snapshot attempt identity must match too —
  // a same-ordinal session is not enough because the ordinal restarts per
  // session, while the campaign attempt id is globally unique and non-resetting.
  if (session.activeMission.missionAttemptId !== missionAttemptId) {
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
  // Newly-unlocked-mission detection from the authoritative pre-commit session
  // progression (Epic §15.4: the row shows only when a mission was newly
  // unlocked by this Success).
  const newlyUnlockedMissionId =
    terminal.kind === 'success' &&
    mission!.unlocksMissionId !== null &&
    !session.unlockedMissionIds.includes(mission!.unlocksMissionId)
      ? mission!.unlocksMissionId
      : null;
  // The pending-mission-economy relay is frozen at the commitment instant by
  // the simulation for Success and a successful Evacuation; Defeat commits zero
  // reward and consumes no relay.
  const economy =
    terminal.kind === 'success' || terminal.kind === 'evacuated'
      ? successEconomy
      : undefined;
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
    if (terminal.kind === 'evacuated') {
      // Canonical v0.2 Evacuation (Epic §12.3, §13.4, V02-AC-015): payout is
      // `floor(max(0, rewards - penalties) × 0.5)`, the current Combat Hull is
      // retained, no completion/unlock changes, and the marker is cleared.
      return applyMissionEvacuation(
        current,
        missionAttemptId,
        missionId,
        combatHullIntegrity,
        economy?.combatRewards ?? 0,
        economy?.escapePenalties ?? 0,
      );
    }
    // Canonical v0.2 Defeat (Epic §12.4, §13.5, V02-AC-016): zero reward; the
    // atomic transition deducts the full Repair cost and restores Hull to 100
    // when affordable, or enters Game Over without any partial deduction. The
    // marker must carry the exact originating mission id AND the exact attempt
    // id (V02-WI-05 C04), so a same-attempt marker of another mission can never
    // be charged or cleared by this live Defeat.
    return applyMissionDefeat(current, missionAttemptId, missionId);
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
  const netCombatReward = Math.max(
    0,
    (economy?.combatRewards ?? 0) - (economy?.escapePenalties ?? 0),
  );
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
          netCombatReward,
          completionReward: mission!.completionReward,
          newlyUnlockedMissionId,
          destroyedCounts: economy?.destroyedCounts ?? emptyRoleCounts(),
          escapedCounts: economy?.escapedCounts ?? emptyRoleCounts(),
          unlockedMissionIdsAfter: [...outcome.next.unlockedMissionIds],
          completedMissionIdsAfter: [...outcome.next.completedMissionIds],
        }
      : terminal.kind === 'evacuated'
        ? {
            kind: 'evacuated',
            missionInstanceOrdinal,
            creditsAfter: outcome.next.credits,
            hullIntegrityAfter: outcome.next.hullIntegrity,
            creditsEarned: outcome.next.credits - creditsBefore,
            combatRewards: economy?.combatRewards ?? 0,
            escapePenalties: economy?.escapePenalties ?? 0,
            netCombatReward,
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
            runStatusAfter: outcome.next.runStatus,
            repairCostCredits:
              outcome.next.runStatus === 'game-over'
                ? 0
                : V02_DEFEAT_REPAIR_COST_CREDITS,
          };
  // V02-WI-05 C03: every committed terminal result — Success, Evacuated,
  // affordable-Repair Defeat, and Game Over — is returned to the existing
  // lifecycle/presentation boundary. No result navigates before that boundary
  // evaluates the browser-safety latch: a Defeat that commits while the tab is
  // hidden or focus is lost is held behind the explicit Resume-only
  // continuation (Epic §13.5, §13.7), and a committed result is never retried
  // merely because presentation awaits Resume. The session dispatch therefore
  // only ever follows this resolved `committed` outcome.
  return { outcome: 'committed', result };
}
