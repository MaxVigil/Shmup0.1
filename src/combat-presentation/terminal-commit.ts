import type { MissionResult } from '@application/mission';
import type { TerminalCommitOutcome } from '@application/combat';
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
 * V02-WI-04 C02 pure terminal-persistence outcome disposition.
 *
 * The typed campaign-transaction outcome maps to exactly one presentation
 * action:
 * - a committed Success authorizes the deterministic exit and closes any
 *   Save Error recovery state;
 * - a committed Defeat already dispatched its result through the v0.1 seam and
 *   only closes any Save Error recovery state;
 * - `inert` opens Save Conflict (Reload is the only continuation);
 * - `failed`/`rejected` open Save Error (Retry Save is the only continuation).
 *
 * Extracted from the Combat entry so the mapping is deterministically
 * unit-testable without a Phaser runtime.
 */
export type TerminalCommitDisposition =
  | { readonly kind: 'authorize-success'; readonly result: MissionResult }
  | { readonly kind: 'recover' }
  | { readonly kind: 'save-error' }
  | { readonly kind: 'save-conflict' };

export function terminalCommitDisposition(
  outcome: TerminalCommitOutcome,
): TerminalCommitDisposition {
  if (outcome.status === 'committed') {
    return outcome.result.kind === 'success'
      ? { kind: 'authorize-success', result: outcome.result }
      : { kind: 'recover' };
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
