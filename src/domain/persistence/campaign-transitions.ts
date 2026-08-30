import { HULL_INTEGRITY_MAX, isHullIntegrity } from '../model';
import type { MissionId } from '../model';
import {
  LEGACY_DEFEAT_RECOVERY_HULL,
  V02_DEFEAT_REPAIR_COST_CREDITS,
} from './campaign-state';
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

/**
 * Temporary v0.1 single-mission Success through the compatibility seam: grants
 * the approved completion reward and retains the Combat Hull, clearing the
 * active-mission marker in the same coherent transition — only for the exact
 * campaign attempt id that started the mission (V02-WI-02 correction C03), so
 * a stale Success callback from an older application instance or attempt is
 * inert before any reward or Hull change. The reward value is supplied by the
 * current single-mission flow (content `reward`), not a second economy
 * authority; V02-WI-04 replaces this with the pending combat economy.
 */
export function applySeamSuccess(
  campaign: CampaignStateV1,
  attemptId: number,
  combatHullIntegrity: number,
  completionReward: number,
): CampaignTransitionResult {
  if (campaign.missionInProgress === null) {
    return { kind: 'rejected', reason: 'no-mission-in-progress' };
  }
  if (!exactMarkerMatch(campaign, attemptId)) {
    return { kind: 'rejected', reason: 'attempt-does-not-match' };
  }
  if (
    !isHullIntegrity(combatHullIntegrity) ||
    !Number.isInteger(completionReward) ||
    completionReward < 0
  ) {
    return { kind: 'rejected', reason: 'invalid-success-result-values' };
  }
  return {
    kind: 'applied',
    campaign: {
      ...campaign,
      credits: campaign.credits + completionReward,
      hullIntegrity: combatHullIntegrity,
      missionInProgress: null,
    },
  };
}

/**
 * Temporary v0.1 single-mission Defeat through the compatibility seam: zero
 * reward and the free emergency recovery to exactly 25 Hull (Base §9.5) — only
 * for the exact campaign attempt id (V02-WI-02 correction C03), so a stale
 * Defeat callback from an older attempt is inert before any Hull change.
 * V02-WI-05 replaces this with the zero-reward paid full Repair / Game Over
 * economy; the seam never applies the v0.2 Repair rule as a parallel authority.
 */
export function applySeamDefeat(
  campaign: CampaignStateV1,
  attemptId: number,
): CampaignTransitionResult {
  if (campaign.missionInProgress === null) {
    return { kind: 'rejected', reason: 'no-mission-in-progress' };
  }
  if (!exactMarkerMatch(campaign, attemptId)) {
    return { kind: 'rejected', reason: 'attempt-does-not-match' };
  }
  return {
    kind: 'applied',
    campaign: {
      ...campaign,
      hullIntegrity: LEGACY_DEFEAT_RECOVERY_HULL,
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
 * Combat-initialization-failure cleanup (Base AC-014, Epic §13.2 correction,
 * V02-WI-02 correction C02): atomically clears the persisted
 * `missionInProgress` marker for the EXACT originating attempt after a start
 * whose lazy Combat initialization rejected, so the failed start can be
 * retried in the same session and can never become a paid Defeat on reload.
 *
 * Exact-attempt matching: the marker stores the originating session Mission
 * Instance ordinal; a stale failure callback that arrives after a NEWER
 * attempt of the same mission set its own marker is rejected as
 * `attempt-does-not-match` and leaves the newer marker untouched. A callback
 * that finds no marker at all is rejected as `no-mission-in-progress`
 * (stale/duplicate of an already-cleared rollback).
 */
export function clearMissionInProgress(
  campaign: CampaignStateV1,
  attemptId: number,
): CampaignTransitionResult {
  if (campaign.missionInProgress === null) {
    return { kind: 'rejected', reason: 'no-mission-in-progress' };
  }
  if (!exactMarkerMatch(campaign, attemptId)) {
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
