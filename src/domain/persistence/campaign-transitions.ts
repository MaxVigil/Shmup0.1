import { HULL_INTEGRITY_MAX, isHullIntegrity, isMissionId } from '../model';
import type { MissionId } from '../model';
import { V02_DEFEAT_REPAIR_COST_CREDITS } from './campaign-state';
import type { CampaignStateV1 } from './campaign-state';

/**
 * Pure campaign transitions (Epic §13.2–13.6, §14.2–14.3). Each function
 * transforms one persisted `CampaignStateV1` into one next state; every
 * transition clears or sets `missionInProgress` in the same coherent change so
 * the marker can never be cleared twice or double-applied. The platform
 * adapter runs these inside its atomic transaction; the session store is only
 * updated after the durable write succeeds.
 */

/** Result of one pure campaign transition. */
export type CampaignTransitionResult =
  | { readonly kind: 'applied'; readonly campaign: CampaignStateV1 }
  | { readonly kind: 'rejected'; readonly reason: string };

/**
 * Mission start transition (Epic §13.2, V02-AC-020; V02-WI-02 correction C04):
 * sets the persisted `missionInProgress` marker before Combat becomes active.
 * The `attemptId` is the globally unique monotonic identity issued by the
 * platform-owned non-resetting allocator store inside the same atomic
 * transaction as this transition — it is never derived from the session or the
 * replaceable campaign record, so confirmed New Game, Save Data Error
 * replacement, and ordinary campaign replacement can never reset or reuse an
 * identity. Rejected when a mission is already in progress (stale/repeated
 * start callbacks), the run is over, the mission is not unlocked, or the
 * allocator-issued identity is not a safe non-negative integer.
 */
export function beginMission(
  campaign: CampaignStateV1,
  missionId: MissionId,
  attemptId: number,
): CampaignTransitionResult {
  if (campaign.runStatus === 'game-over') {
    return { kind: 'rejected', reason: 'run-is-game-over' };
  }
  if (campaign.missionInProgress !== null) {
    return { kind: 'rejected', reason: 'a-mission-is-already-in-progress' };
  }
  if (!campaign.unlockedMissionIds.includes(missionId)) {
    return { kind: 'rejected', reason: 'mission-is-not-unlocked' };
  }
  if (!Number.isSafeInteger(attemptId) || attemptId < 0) {
    return { kind: 'rejected', reason: 'invalid-attempt-identity' };
  }
  return {
    kind: 'applied',
    campaign: { ...campaign, missionInProgress: { missionId, attemptId } },
  };
}

/** True when the persisted marker belongs to the exact campaign attempt. */
function exactMarkerMatch(
  campaign: CampaignStateV1,
  attemptId: number,
): boolean {
  return campaign.missionInProgress?.attemptId === attemptId;
}

/** True when the persisted marker belongs to the exact originating mission id
 *  AND the exact campaign attempt id (V02-DEC-031). */
function exactOriginatingMarkerMatch(
  campaign: CampaignStateV1,
  missionId: MissionId,
  attemptId: number,
): boolean {
  const marker = campaign.missionInProgress;
  return (
    marker !== null &&
    marker.missionId === missionId &&
    marker.attemptId === attemptId
  );
}

/**
 * v0.2 Success transition (Epic §6.2, §12.2, V02-AC-002, V02-AC-013, V02-AC-020):
 * the authoritative atomic Success commitment through the campaign transaction —
 * grants the pending combat economy plus the authored mission completion reward,
 * marks the mission completed, unlocks exactly the one defined next mission when
 * the mission was not already completed, retains the Combat Hull, and clears the
 * active-mission marker — all in one coherent before/after state, only for the
 * exact campaign attempt that started the mission.
 *
 * Economy (Epic §12.2): `netCombat = max(0, combatRewards - escapePenalties)` and
 * the credits increase is `netCombat + completionReward`. Credits are integers
 * and can never go negative; escape penalties can reduce only the mission combat
 * contribution, never the existing persistent balance.
 *
 * Idempotency: the transition requires the persisted marker to belong to the
 * exact `attemptId` AND the exact `missionId` that started it. Repeated,
 * stale, or racing Success callbacks after the first commitment find no marker
 * (`no-mission-in-progress`) or a non-matching attempt (`attempt-does-not-match`)
 * and are rejected BEFORE any reward, unlock, Hull change, or marker clear, so
 * an unlock/completion can never duplicate (V02-AC-002, V02-AC-020). The
 * completion/unlock set is supplied by the application from the validated
 * mission registry — Domain never locates content globally.
 */
export function applyMissionSuccess(
  campaign: CampaignStateV1,
  attemptId: number,
  missionId: MissionId,
  combatHullIntegrity: number,
  combatRewards: number,
  escapePenalties: number,
  completionReward: number,
  unlockMissionId: MissionId | null,
): CampaignTransitionResult {
  if (campaign.missionInProgress === null) {
    return { kind: 'rejected', reason: 'no-mission-in-progress' };
  }
  if (!exactMarkerMatch(campaign, attemptId)) {
    return { kind: 'rejected', reason: 'attempt-does-not-match' };
  }
  if (campaign.missionInProgress.missionId !== missionId) {
    return { kind: 'rejected', reason: 'marker-mission-mismatch' };
  }
  if (
    !isHullIntegrity(combatHullIntegrity) ||
    !Number.isInteger(combatRewards) ||
    combatRewards < 0 ||
    !Number.isInteger(escapePenalties) ||
    escapePenalties < 0 ||
    !Number.isInteger(completionReward) ||
    completionReward < 0
  ) {
    return { kind: 'rejected', reason: 'invalid-success-result-values' };
  }
  if (unlockMissionId !== null && !isMissionId(unlockMissionId)) {
    return { kind: 'rejected', reason: 'invalid-unlock-target' };
  }
  const netCombat = Math.max(0, combatRewards - escapePenalties);
  const completedMissionIds = campaign.completedMissionIds.includes(missionId)
    ? campaign.completedMissionIds
    : [...campaign.completedMissionIds, missionId];
  const unlockedMissionIds =
    unlockMissionId !== null &&
    !campaign.unlockedMissionIds.includes(unlockMissionId)
      ? [...campaign.unlockedMissionIds, unlockMissionId]
      : campaign.unlockedMissionIds;
  return {
    kind: 'applied',
    campaign: {
      ...campaign,
      credits: campaign.credits + netCombat + completionReward,
      hullIntegrity: combatHullIntegrity,
      unlockedMissionIds,
      completedMissionIds,
      missionInProgress: null,
    },
  };
}

/**
 * Canonical v0.2 Evacuation commitment (Epic §12.3, §13.4–13.7, V02-AC-015,
 * V02-AC-020): a successful Evacuation freezes one immutable result and commits
 * `payout = floor(max(0, combatRewards - escapePenalties) × 0.5)` Credits,
 * retains the current Combat Hull, changes no completion/unlock/progression
 * state, and clears the active-mission marker — only for the exact campaign
 * attempt and mission that started it, so a stale or racing Evacuated callback
 * from an older attempt is inert before any reward, Hull, or marker change.
 * Enemies still active when Evacuation succeeds are neither `Escaped` nor an
 * additional penalty (Epic §12.3, §18).
 */
export function applyMissionEvacuation(
  campaign: CampaignStateV1,
  attemptId: number,
  missionId: MissionId,
  combatHullIntegrity: number,
  combatRewards: number,
  escapePenalties: number,
): CampaignTransitionResult {
  if (campaign.missionInProgress === null) {
    return { kind: 'rejected', reason: 'no-mission-in-progress' };
  }
  if (!exactMarkerMatch(campaign, attemptId)) {
    return { kind: 'rejected', reason: 'attempt-does-not-match' };
  }
  if (campaign.missionInProgress.missionId !== missionId) {
    return { kind: 'rejected', reason: 'marker-mission-mismatch' };
  }
  if (
    !isHullIntegrity(combatHullIntegrity) ||
    !Number.isInteger(combatRewards) ||
    combatRewards < 0 ||
    !Number.isInteger(escapePenalties) ||
    escapePenalties < 0
  ) {
    return { kind: 'rejected', reason: 'invalid-evacuation-result-values' };
  }
  const netCombat = Math.max(0, combatRewards - escapePenalties);
  const payout = Math.floor(netCombat * 0.5);
  return {
    kind: 'applied',
    campaign: {
      ...campaign,
      credits: campaign.credits + payout,
      hullIntegrity: combatHullIntegrity,
      missionInProgress: null,
    },
  };
}

/**
 * Canonical v0.2 Defeat commitment (Epic §12.4, §13.5, V02-AC-016, V02-AC-020):
 * zero mission reward and the paid full Repair / Game Over economy — only for
 * the exact campaign attempt AND the exact originating mission (V02-WI-02
 * correction C03; V02-WI-05 C04 adds the mission-identity check), so a stale
 * Defeat callback from an older attempt — or from the same attempt identity of
 * a different mission marker — is inert before any Credits, Hull, or marker
 * change. When persistent Credits are at least the full Repair cost, exactly
 * `V02_DEFEAT_REPAIR_COST_CREDITS` (8) Credits are deducted, Hull becomes 100,
 * and the run stays `active`; otherwise no partial deduction occurs, the run
 * enters `game-over`, and the marker is cleared in both branches. The caller
 * distinguishes the branches through the applied campaign's `runStatus`.
 */
export function applyMissionDefeat(
  campaign: CampaignStateV1,
  attemptId: number,
  missionId: MissionId,
): CampaignTransitionResult {
  if (campaign.missionInProgress === null) {
    return { kind: 'rejected', reason: 'no-mission-in-progress' };
  }
  if (!exactMarkerMatch(campaign, attemptId)) {
    return { kind: 'rejected', reason: 'attempt-does-not-match' };
  }
  if (campaign.missionInProgress.missionId !== missionId) {
    return { kind: 'rejected', reason: 'marker-mission-mismatch' };
  }
  if (campaign.credits >= V02_DEFEAT_REPAIR_COST_CREDITS) {
    return {
      kind: 'applied',
      campaign: {
        ...campaign,
        credits: campaign.credits - V02_DEFEAT_REPAIR_COST_CREDITS,
        hullIntegrity: HULL_INTEGRITY_MAX,
        missionInProgress: null,
      },
    };
  }
  return {
    kind: 'applied',
    campaign: {
      ...campaign,
      runStatus: 'game-over',
      missionInProgress: null,
    },
  };
}

/**
 * Temporary v0.1 Aborted (Return to Base) through the compatibility seam: no
 * reward or recovery; current Combat Hull retained and the marker cleared —
 * only for the exact campaign attempt id (V02-WI-02 correction C03), so a
 * stale Aborted callback from an older attempt is inert. The v0.2 spec removes
 * `Aborted` (Evacuation is the only voluntary exit); this transition exists
 * only until V02-WI-05 replaces the v0.1 seam flow.
 */
export function applySeamAbort(
  campaign: CampaignStateV1,
  attemptId: number,
  combatHullIntegrity: number,
): CampaignTransitionResult {
  if (campaign.missionInProgress === null) {
    return { kind: 'rejected', reason: 'no-mission-in-progress' };
  }
  if (!exactMarkerMatch(campaign, attemptId)) {
    return { kind: 'rejected', reason: 'attempt-does-not-match' };
  }
  if (!isHullIntegrity(combatHullIntegrity)) {
    return { kind: 'rejected', reason: 'invalid-abort-hull' };
  }
  return {
    kind: 'applied',
    campaign: {
      ...campaign,
      hullIntegrity: combatHullIntegrity,
      missionInProgress: null,
    },
  };
}

export type DefeatRecoveryOutcome = 'repaired' | 'game-over';

export interface DefeatRecoveryResult {
  readonly kind: 'recovered';
  readonly campaign: CampaignStateV1;
  readonly outcome: DefeatRecoveryOutcome;
}

/**
 * Combat-initialization-failure cleanup (Base AC-014, Epic §13.2, V02-DEC-031,
 * V02-AC-020): atomically clears the persisted `missionInProgress` marker for
 * the EXACT originating Mission Snapshot — its mission id AND its durable
 * campaign attempt id — after a start whose lazy Combat initialization
 * rejected, so the failed start can be retried in the same session and can
 * never become a paid Defeat on reload.
 *
 * Exact originating-marker matching: the marker stores the originating mission
 * id plus the campaign-authoritative attempt id. A stale failure callback that
 * arrives after a NEWER attempt of the same mission set its own marker is
 * rejected as `attempt-does-not-match`; a schema-valid but untrusted marker
 * that belongs to ANOTHER mission is rejected as `mission-does-not-match`
 * (V02-WI-05: the durable cleanup owner never clears by attempt id alone). A
 * callback that finds no marker at all is rejected as
 * `no-mission-in-progress` (stale/duplicate of an already-cleared rollback).
 */
export function clearMissionInProgress(
  campaign: CampaignStateV1,
  missionId: MissionId,
  attemptId: number,
): CampaignTransitionResult {
  if (campaign.missionInProgress === null) {
    return { kind: 'rejected', reason: 'no-mission-in-progress' };
  }
  if (campaign.missionInProgress.missionId !== missionId) {
    return { kind: 'rejected', reason: 'mission-does-not-match' };
  }
  if (!exactOriginatingMarkerMatch(campaign, missionId, attemptId)) {
    return { kind: 'rejected', reason: 'attempt-does-not-match' };
  }
  return {
    kind: 'applied',
    campaign: { ...campaign, missionInProgress: null },
  };
}

/**
 * Startup active-mission Defeat recovery (Epic §14.3, V02-AC-018): the
 * persisted `missionInProgress` marker is resolved exactly once as Defeat with
 * zero reward. When Credits are at least the full Repair cost, exactly 8
 * Credits are deducted and Hull becomes 100; otherwise no partial deduction
 * occurs and the run enters Game Over. The marker is cleared in both cases so
 * a repeat startup cannot re-resolve or double-deduct.
 */
export function applyDefeatRecoveryOrGameOver(
  campaign: CampaignStateV1,
):
  | DefeatRecoveryResult
  | { readonly kind: 'rejected'; readonly reason: string } {
  if (campaign.missionInProgress === null) {
    return { kind: 'rejected', reason: 'no-mission-in-progress' };
  }
  if (campaign.credits >= V02_DEFEAT_REPAIR_COST_CREDITS) {
    return {
      kind: 'recovered',
      campaign: {
        ...campaign,
        credits: campaign.credits - V02_DEFEAT_REPAIR_COST_CREDITS,
        hullIntegrity: HULL_INTEGRITY_MAX,
        missionInProgress: null,
      },
      outcome: 'repaired',
    };
  }
  return {
    kind: 'recovered',
    campaign: {
      ...campaign,
      runStatus: 'game-over',
      missionInProgress: null,
    },
    outcome: 'game-over',
  };
}
