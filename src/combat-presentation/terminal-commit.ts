import type { MissionResult } from '@application/mission';
import type { TerminalCommitOutcome } from '@application/combat';
import type { SessionState } from '@application/session';
import type {
  CommitMissionResultResult,
  SuccessEconomyRelay,
} from '@application/mission';

/**
 * V02-WI-04 C02 binding adapter: maps the command's typed
 * `CommitMissionResultResult` to the Combat `TerminalCommitOutcome`. Extracted
 * from the Combat Screen so every branch (committed / inert / failed) is
 * deterministically unit-testable; rejected Promises are caught by the binding
 * and mapped separately, never surfacing as unhandled rejections.
 */
export function mapCommitMissionOutcome(
  result: CommitMissionResultResult,
): TerminalCommitOutcome {
  if (result.outcome === 'committed' && result.result !== null) {
    return { status: 'committed', result: result.result };
  }
  if (result.outcome === 'inert') {
    return { status: 'inert' };
  }
  return { status: 'failed' };
}

/**
 * V02-WI-04 C02 / V02-WI-05 C03 pure terminal-persistence outcome disposition.
 *
 * The typed campaign-transaction outcome maps to exactly one presentation
 * action:
 * - a committed Success/Evacuation authorizes the deterministic exit;
 * - a committed Defeat/Game Over returns the immutable result to the boundary,
 *   which dispatches it only when presentation is safe or holds it behind the
 *   explicit Resume-only continuation when the browser-safety latch is set;
 * - `inert` opens Save Conflict (Reload is the only continuation);
 * - `failed`/`rejected` open Save Error (Retry Save is the only continuation).
 *
 * Extracted from the Combat entry so the mapping is deterministically
 * unit-testable without a Phaser runtime.
 */
export type TerminalCommitDisposition =
  | { readonly kind: 'authorize-exit'; readonly result: MissionResult }
  | { readonly kind: 'present-defeat'; readonly result: MissionResult }
  | { readonly kind: 'save-error' }
  | { readonly kind: 'save-conflict' };

export function terminalCommitDisposition(
  outcome: TerminalCommitOutcome,
): TerminalCommitDisposition {
  if (outcome.status === 'committed') {
    // Success and Evacuation share the deterministic bounded centre-and-up
    // exit sequence (Epic §13.3–13.4): the committed outcome authorizes it and
    // the session dispatch is deferred until the exit completes. Defeat has no
    // exit sequence (Epic §13.5); its committed result is returned so the
    // lifecycle boundary can evaluate the browser-safety latch before any
    // Result/Game Over presentation (Epic §13.7).
    return outcome.result.kind === 'defeat'
      ? { kind: 'present-defeat', result: outcome.result }
      : { kind: 'authorize-exit', result: outcome.result };
  }
  return outcome.status === 'inert'
    ? { kind: 'save-conflict' }
    : { kind: 'save-error' };
}

/**
 * V02-WI-04 C02 single-flight Retry Save controller. Exactly one retry of the
 * frozen terminal payload may be in flight at a time; `beginRetry` returns
 * false for a repeated click while one is pending, and `finishRetry` is called
 * from the typed completion callback (committed, inert, failed, or rejected) so
 * the user may retry again after a repeated failure while Combat stays frozen.
 */
export interface TerminalRetryController {
  readonly beginRetry: () => boolean;
  readonly finishRetry: () => void;
}

export function createTerminalRetryController(): TerminalRetryController {
  let inFlight = false;
  return {
    beginRetry() {
      if (inFlight) {
        return false;
      }
      inFlight = true;
      return true;
    },
    finishRetry() {
      inFlight = false;
    },
  };
}

/**
 * V02-WI-04 C02 immutable terminal-payload capture. The first relay of a
 * terminal freezes the economy relay exactly once; every Retry Save reuses
 * that frozen payload plus the originating attempt/instance identity, so a
 * retry can never observe a different simulation economy or reward/penalty
 * snapshot (the simulation is already frozen at terminal, and the capture is
 * deterministic regardless).
 */
export interface FrozenTerminalPayload {
  readonly currentEconomy: () => SuccessEconomyRelay | null;
  readonly freezeEconomy: (economy: SuccessEconomyRelay) => SuccessEconomyRelay;
}

export function createFrozenTerminalPayload(): FrozenTerminalPayload {
  let frozen: SuccessEconomyRelay | null = null;
  return {
    currentEconomy: () => frozen,
    freezeEconomy: (economy) => {
      frozen ??= economy;
      return frozen;
    },
  };
}

/**
 * V02-WI-05 C04 exact originating snapshot identity used at the terminal
 * commitment/presentation boundary. The session ordinal restarts per session
 * and is never durable attempt authority: the persisted mission id plus the
 * globally unique, non-resetting campaign attempt id are required too.
 */
export interface TerminalSnapshotIdentity {
  readonly missionId: string;
  readonly missionAttemptId: number;
  readonly missionInstanceOrdinal: number;
}

/** True while the session still owns the exact originating Mission Snapshot. */
export function ownsTerminalSnapshot(
  session: SessionState | null,
  identity: TerminalSnapshotIdentity,
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
 * One boundary action for a resolved terminal commitment (V02-WI-05 C03/C04).
 * This is the exact decision the Combat presentation entry applies:
 * - committed Success/Evacuation authorizes the deterministic exit;
 * - a committed Defeat/Game Over is presented immediately only when no
 *   browser-safety latch is set; under the latch it is HELD frozen behind the
 *   explicit Resume-only continuation and is never re-written/retried;
 * - failed/rejected and inert outcomes open Save Error / Save Conflict;
 * - a completion that no longer owns the exact snapshot is stale and inert.
 */
export type TerminalCommitBoundaryPlan =
  | { readonly kind: 'authorize-exit'; readonly result: MissionResult }
  | { readonly kind: 'present'; readonly result: MissionResult }
  | { readonly kind: 'hold'; readonly result: MissionResult }
  | { readonly kind: 'save-error' }
  | { readonly kind: 'save-conflict' }
  | { readonly kind: 'stale' };

export function planCommittedTerminal(
  outcome: TerminalCommitOutcome,
  session: SessionState | null,
  identity: TerminalSnapshotIdentity,
): TerminalCommitBoundaryPlan {
  if (!ownsTerminalSnapshot(session, identity)) {
    return { kind: 'stale' };
  }
  // The committed payload itself must carry the originating instance ordinal;
  // a result bound to another instance can never be presented by this owner.
  if (
    outcome.status === 'committed' &&
    (outcome.result === null ||
      outcome.result.missionInstanceOrdinal !== identity.missionInstanceOrdinal)
  ) {
    return { kind: 'stale' };
  }
  const disposition = terminalCommitDisposition(outcome);
  if (disposition.kind === 'authorize-exit') {
    return { kind: 'authorize-exit', result: disposition.result };
  }
  if (disposition.kind === 'present-defeat') {
    return session!.combatLifecycle.browserSafetyLatched
      ? { kind: 'hold', result: disposition.result }
      : { kind: 'present', result: disposition.result };
  }
  return disposition;
}

/** Pure eligibility gate for presenting one held committed Defeat/Game Over
 *  after an explicit Resume (running with no blocking Overlay, exact snapshot). */
export function mayPresentHeldDefeat(
  session: SessionState | null,
  identity: TerminalSnapshotIdentity,
): boolean {
  return (
    ownsTerminalSnapshot(session, identity) &&
    session!.combatLifecycle.running &&
    session!.combatLifecycle.overlay === 'none'
  );
}
