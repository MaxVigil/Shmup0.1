import type {
  CampaignRunStatus,
  CampaignStateV1,
  CampaignTransitionResult,
  MissionId,
} from '@domain/index';
import type { CampaignUpdateOutcome } from './campaign-store';
import { isDebugCommandEligible } from '../combat/debug-command';
import type { SessionStore } from '../session';
import type { PersistenceCommandDeps } from './commands';

/**
 * V02-WI-07 D02-A development-only campaign Debug authority (Epic §17,
 * V02-AC-026).
 *
 * The persisted campaign record is the ONLY authority for Credits, the active
 * `missionInProgress` marker, and `runStatus`; these helpers read and mutate it
 * exclusively through the application-owned `CampaignStorePort`
 * (`read`/`update`), never through IndexedDB/Dexie, React state, the Combat
 * simulation, or a mirrored session copy. Every mutation is the SAME atomic
 * read-modify-write transaction the shipped campaign commands use, and the
 * single Session Store is reconciled only AFTER a durable `applied` outcome.
 */

/** The exact persisted campaign facts the development Debug surface exposes. */
export interface DebugCampaignReadModel {
  readonly credits: number;
  /** The exact durable active-mission marker identity, or `null` (None). */
  readonly missionInProgress: {
    readonly missionId: MissionId;
    readonly attemptId: number;
  } | null;
  readonly runStatus: CampaignRunStatus;
}

/**
 * Read outcome. `unavailable` covers a missing, invalid, or unreadable record
 * (loading/unavailable): D02-A renders the existing absent value `—` and does
 * not swallow or re-report the path-qualified validation/migration causes owned
 * by D02-B.
 */
export type DebugCampaignReadOutcome =
  | { readonly kind: 'loaded'; readonly campaign: DebugCampaignReadModel }
  | { readonly kind: 'unavailable' };

export async function readDebugCampaign(
  deps: Pick<PersistenceCommandDeps, 'campaignStore'>,
): Promise<DebugCampaignReadOutcome> {
  try {
    const read = await deps.campaignStore.read();
    if (read.kind !== 'loaded') {
      return { kind: 'unavailable' };
    }
    const marker = read.campaign.missionInProgress;
    return {
      kind: 'loaded',
      campaign: {
        credits: read.campaign.credits,
        missionInProgress:
          marker === null
            ? null
            : { missionId: marker.missionId, attemptId: marker.attemptId },
        runStatus: read.campaign.runStatus,
      },
    };
  } catch {
    // A read infrastructure failure is reported as unavailable, never as a
    // fabricated campaign value and never as a D02-B diagnostic.
    return { kind: 'unavailable' };
  }
}

/**
 * The exact durable identity of the current Active Mission, read from the one
 * authoritative Session Store. `null` when no mission is active. This is the
 * only identity the Debug campaign commands accept; the marker is never derived
 * from the Combat simulation or from a React mirror.
 */
export interface ActiveMissionIdentity {
  readonly missionId: MissionId;
  readonly attemptId: number;
  readonly missionInstanceOrdinal: number;
}

export function activeMissionIdentity(
  store: SessionStore,
): ActiveMissionIdentity | null {
  const session = store.getState();
  if (session === null || session.activeMission === 'none') {
    return null;
  }
  return {
    missionId: session.activeMission.missionId,
    attemptId: session.activeMission.missionAttemptId,
    missionInstanceOrdinal: session.activeMission.missionInstanceOrdinal,
  };
}

/**
 * True only when the freshly read campaign proves an ACTIVE run whose persisted
 * marker exactly identifies the given current Mission Snapshot identity. This
 * single predicate gates both the bounded Credit command and the
 * `Reload for Recovery` affordance.
 */
export function debugCampaignMatchesActiveMission(
  campaign: DebugCampaignReadModel,
  identity: ActiveMissionIdentity,
): boolean {
  const marker = campaign.missionInProgress;
  return (
    campaign.runStatus === 'active' &&
    marker !== null &&
    marker.missionId === identity.missionId &&
    marker.attemptId === identity.attemptId
  );
}

/** The two exact Repair-boundary Credit values (Epic §12.4, V02-WI-07 D02-A):
 *  `7` proves the below-cost Game Over branch and `8` the affordable-Repair
 *  branch. No arbitrary numeric input exists. */
export type DebugCreditsValue = 7 | 8;

export type DebugCreditsOutcome =
  | { readonly kind: 'applied' }
  | { readonly kind: 'skipped'; readonly reason: string }
  | { readonly kind: 'failed' };

/** V02-WI-07 D02-A-C01 F3 recovery-reload outcome: `reloaded` means the fresh
 *  authoritative read proved an exact active marker match and browser
 *  navigation was invoked; every other case is inert. */
export type DebugRecoveryReloadOutcome =
  | { readonly kind: 'reloaded' }
  | { readonly kind: 'skipped'; readonly reason: string };

export interface DebugCampaignCommandDeps extends Pick<
  PersistenceCommandDeps,
  'store' | 'campaignStore'
> {
  /**
   * Build-time development Debug capability, passed in exactly like the Combat
   * session receives it and never read from a query string, storage, or a
   * mutable global. When false every command is inert.
   */
  readonly debugMode: boolean;
  /**
   * Browser navigation for the recovery reload. It is invoked ONLY after a
   * fresh authoritative read and a final identity/eligibility recheck both
   * prove the exact active marker match, so the command never owns navigation
   * policy of its own.
   */
  readonly navigate: () => void;
  /**
   * V02-WI-07 D02-A-C02 F4: the IMMUTABLE identity of the Mission Snapshot this
   * command instance was created for, bound by its owner (the Combat Screen)
   * from the session's Active Mission at construction — mission id, globally
   * unique durable attempt id, and local Mission Instance ordinal. Every direct
   * call compares it with the CURRENT Active Mission before acting, so a stale
   * command object can never read or write for a newer run, including a newer
   * run that reuses the local ordinal after a confirmed New Game.
   */
  readonly origin: ActiveMissionIdentity;
}

/**
 * V02-WI-07 D02-A development-only campaign Debug command boundary (Epic §17,
 * V02-AC-026). One instance is owned for the lifetime of a logical active
 * mission — created by the Combat Screen, not by the Debug Overlay — so its
 * single-flight latches and pending state survive Debug close/reopen
 * (D02-A-C01 F2). Both actions enforce the canonical development Debug
 * lifecycle/mission eligibility predicate the D01 simulation Debug commands use
 * (`isDebugCommandEligible`) against the BOUND originating Mission Snapshot
 * identity (D02-A-C02 F4), so a direct call outside the matching Debug
 * lifecycle, from another mission, from a stale command of an earlier run, or
 * in a production build is inert regardless of React visibility.
 */
export interface DebugCampaignCommand {
  /** The immutable Mission Snapshot identity this command is bound to (F4). */
  readonly origin: ActiveMissionIdentity;
  /** True while a Credit change is in flight (both Credit controls disabled). */
  isCreditsPending(): boolean;
  /** True while a recovery reload is in flight (the action is disabled). */
  isRecoveryReloadPending(): boolean;
  /** Subscribes presentation to the two pending states (no polling). */
  subscribe(listener: () => void): () => void;
  /**
   * Single-flight development-only Credit change. Repeated or concurrent
   * activations reuse the one in-flight execution, so a double activation can
   * never apply twice — including across a Debug close/reopen, because the
   * latch belongs to this owner rather than to a mounted Overlay.
   */
  setCredits(value: DebugCreditsValue): Promise<DebugCreditsOutcome>;
  /**
   * Single-flight recovery reload: a FRESH authoritative campaign read is
   * required on every activation (D02-A-C01 F3).
   */
  requestRecoveryReload(): Promise<DebugRecoveryReloadOutcome>;
}

/**
 * V02-WI-07 D02-A-C02 F4: true only while the CURRENT Active Mission is exactly
 * the Mission Snapshot this command instance was created for. The local Mission
 * Instance ordinal alone is never sufficient: a confirmed New Game restarts the
 * ordinal counter while the durable attempt allocator never reuses ids, so a
 * newer run can carry the same ordinal under a different mission/attempt.
 */
function currentMissionMatchesOrigin(deps: DebugCampaignCommandDeps): boolean {
  const session = deps.store.getState();
  if (session === null || session.activeMission === 'none') {
    return false;
  }
  const active = session.activeMission;
  return (
    active.missionId === deps.origin.missionId &&
    active.missionAttemptId === deps.origin.attemptId &&
    active.missionInstanceOrdinal === deps.origin.missionInstanceOrdinal
  );
}

/**
 * The canonical D01 Debug lifecycle eligibility rule, evaluated against the
 * BOUND originating ordinal: `activeMissionOrdinal` comes from the current
 * session while the compared snapshot ordinal is the immutable origin (F4), so
 * this is never an ordinal-versus-itself comparison. The authoritative lifecycle
 * Overlay must be exactly Debug and build-time `debugMode` must be enabled.
 */
function debugLifecycleEligible(deps: DebugCampaignCommandDeps): boolean {
  const session = deps.store.getState();
  if (session === null || session.activeMission === 'none') {
    return false;
  }
  return isDebugCommandEligible(
    {
      activeMissionOrdinal: session.activeMission.missionInstanceOrdinal,
      overlay: session.combatLifecycle.overlay,
      debugMode: deps.debugMode,
    },
    deps.origin.missionInstanceOrdinal,
  );
}

/** Read-scoped inert reasons for the F5 recheck that runs after the awaited read. */
const POST_READ_REASONS = {
  missing: 'mission-resolved-during-read',
  foreign: 'mission-replaced-during-read',
  ineligible: 'debug-closed-during-read',
} as const;

const CALL_REASONS = {
  missing: 'no-active-mission',
  foreign: 'not-originating-mission',
  ineligible: 'debug-not-eligible',
} as const;

/**
 * The command-boundary guard shared by both D02-A actions: it returns the exact
 * inert reason, or `null` when the call is authorised for the originating
 * Mission Snapshot. `phase` only selects the read-scoped reason labels used by
 * the post-read recheck, so the same authority rules apply before and after an
 * awaited read.
 */
function debugCampaignGuardFailure(
  deps: DebugCampaignCommandDeps,
  phase: 'call' | 'read',
): string | null {
  const reasons = phase === 'call' ? CALL_REASONS : POST_READ_REASONS;
  const session = deps.store.getState();
  if (session === null || session.activeMission === 'none') {
    return reasons.missing;
  }
  if (!currentMissionMatchesOrigin(deps)) {
    return reasons.foreign;
  }
  return debugLifecycleEligible(deps) ? null : reasons.ineligible;
}

export function createDebugCampaignCommand(
  deps: DebugCampaignCommandDeps,
): DebugCampaignCommand {
  const listeners = new Set<() => void>();
  let creditsInFlight: Promise<DebugCreditsOutcome> | null = null;
  let reloadInFlight: Promise<DebugRecoveryReloadOutcome> | null = null;
  const notify = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };
  return {
    origin: deps.origin,
    isCreditsPending: () => creditsInFlight !== null,
    isRecoveryReloadPending: () => reloadInFlight !== null,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setCredits(value: DebugCreditsValue): Promise<DebugCreditsOutcome> {
      if (creditsInFlight !== null) {
        return creditsInFlight;
      }
      creditsInFlight = performSetCredits(deps, value).finally(() => {
        creditsInFlight = null;
        notify();
      });
      notify();
      return creditsInFlight;
    },
    requestRecoveryReload(): Promise<DebugRecoveryReloadOutcome> {
      if (reloadInFlight !== null) {
        return reloadInFlight;
      }
      reloadInFlight = performRecoveryReload(deps).finally(() => {
        reloadInFlight = null;
        notify();
      });
      notify();
      return reloadInFlight;
    },
  };
}

async function performSetCredits(
  deps: DebugCampaignCommandDeps,
  value: DebugCreditsValue,
): Promise<DebugCreditsOutcome> {
  // The guard binds this direct call to the immutable originating Mission
  // Snapshot identity (F4) AND to the canonical Debug lifecycle, so a stale
  // command of an earlier run — including a newer run that reuses the local
  // ordinal — can never write.
  const guardFailure = debugCampaignGuardFailure(deps, 'call');
  if (guardFailure !== null) {
    return { kind: 'skipped', reason: guardFailure };
  }
  let outcome: CampaignUpdateOutcome;
  try {
    outcome = await deps.campaignStore.update((current) =>
      applyDebugCredits(current, deps.origin, value),
    );
  } catch {
    // A thrown transaction is a failure: nothing was committed and the session
    // is never reconciled, so no false in-memory value can appear.
    return { kind: 'failed' };
  }
  if (outcome.kind !== 'applied') {
    return { kind: 'skipped', reason: outcome.kind };
  }
  // Persist FIRST, then reconcile: the single Session Store mirrors the durable
  // value only when the CURRENT active snapshot still matches the originating
  // mission id, durable attempt id, AND instance ordinal (D02-A-C01 F1).
  deps.store.dispatch({
    type: 'session/debug-set-credits',
    credits: value,
    missionId: deps.origin.missionId,
    missionAttemptId: deps.origin.attemptId,
    missionInstanceOrdinal: deps.origin.missionInstanceOrdinal,
  });
  return { kind: 'applied' };
}

/**
 * V02-WI-07 D02-A-C01 F3 / D02-A-C02 F5: re-read the persisted campaign on EVERY
 * activation and navigate only when BOTH that fresh read proves an active run
 * whose marker exactly identifies the originating Mission Snapshot AND the
 * identity/eligibility state still holds immediately before navigation.
 *
 * The read is asynchronous, so the player can close Debug, resolve the mission,
 * or replace the run while it is in flight; the pre-await check cannot authorise
 * a later navigation. A marker that changed, cleared, belongs to another
 * mission, a missing/invalid record, an unreadable read, or a Debug lifecycle
 * that is no longer eligible all leave the browser where it is. Boot remains the
 * sole recovery transition owner.
 */
async function performRecoveryReload(
  deps: DebugCampaignCommandDeps,
): Promise<DebugRecoveryReloadOutcome> {
  const guardFailure = debugCampaignGuardFailure(deps, 'call');
  if (guardFailure !== null) {
    return { kind: 'skipped', reason: guardFailure };
  }
  const outcome = await readDebugCampaign({
    campaignStore: deps.campaignStore,
  });
  const postReadFailure = debugCampaignGuardFailure(deps, 'read');
  if (postReadFailure !== null) {
    // Even a read that returned the old exact marker cannot authorise
    // navigation once the bound mission or the Debug lifecycle has moved on.
    return { kind: 'skipped', reason: postReadFailure };
  }
  if (outcome.kind !== 'loaded') {
    return { kind: 'skipped', reason: 'campaign-unavailable' };
  }
  if (!debugCampaignMatchesActiveMission(outcome.campaign, deps.origin)) {
    return { kind: 'skipped', reason: 'marker-does-not-match' };
  }
  deps.navigate();
  return { kind: 'reloaded' };
}

/**
 * The pure atomic transform: exactly one persisted Credits write, and only while
 * the run is active AND the persisted marker exactly matches the originating
 * Mission Snapshot identity. Every other case is rejected, which the adapter
 * reports as `no-change`, leaving durable and in-memory state untouched.
 */
function applyDebugCredits(
  current: CampaignStateV1,
  identity: ActiveMissionIdentity,
  value: DebugCreditsValue,
): CampaignTransitionResult {
  if (current.runStatus !== 'active') {
    return { kind: 'rejected', reason: 'run-not-active' };
  }
  const marker = current.missionInProgress;
  if (marker === null) {
    return { kind: 'rejected', reason: 'no-mission-in-progress' };
  }
  if (marker.missionId !== identity.missionId) {
    return { kind: 'rejected', reason: 'marker-mission-mismatch' };
  }
  if (marker.attemptId !== identity.attemptId) {
    return { kind: 'rejected', reason: 'attempt-does-not-match' };
  }
  return { kind: 'applied', campaign: { ...current, credits: value } };
}
