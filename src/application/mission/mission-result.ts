import type { SessionStore } from '../session';

/**
 * S12 typed terminal mission results (Base §9.5, MASTER-AC-005). One typed
 * result and one idempotent application-owned commitment path bound to the
 * originating Mission Instance: Combat emits only the authoritative terminal
 * trigger + final Combat Hull; Phaser and React never calculate a result,
 * mutate Credits or Hull, or apply a reward. The session reducer accepts a
 * terminal result only when its `missionInstanceOrdinal` exactly matches the
 * active Mission Snapshot, so a delayed or duplicated terminal/Aborted/Continue
 * command from an older mission can never resolve, reward, recover, abort, or
 * clear the result of another Mission Instance.
 */

/** Authoritative terminal trigger emitted by the Combat simulation. */
export type CombatTerminalResult =
  { readonly kind: 'success' } | { readonly kind: 'defeat' };

/** One typed Mission Result committed through `mission/result`. */
export type MissionResult =
  | {
      readonly kind: 'success';
      readonly missionInstanceOrdinal: number;
      readonly combatHullIntegrity: number;
    }
  | { readonly kind: 'defeat'; readonly missionInstanceOrdinal: number }
  | {
      readonly kind: 'aborted';
      readonly missionInstanceOrdinal: number;
      readonly combatHullIntegrity: number;
    };

/** Packages the Combat terminal trigger + final Hull into a committed result
 *  bound to the originating Mission Instance. */
export function buildMissionResult(
  terminal: CombatTerminalResult,
  combatHullIntegrity: number,
  missionInstanceOrdinal: number,
): MissionResult {
  if (terminal.kind === 'defeat') {
    return { kind: 'defeat', missionInstanceOrdinal };
  }
  return { kind: 'success', missionInstanceOrdinal, combatHullIntegrity };
}

/**
 * Aborted application integration seam (Base AC-034): the same typed, idempotent
 * commitment path — no reward or emergency recovery, current Combat Hull
 * retained, active mission discarded, Operations opens directly without a
 * Mission Result Overlay. The caller must supply the originating
 * `missionInstanceOrdinal`; the seam never reads the current active mission at
 * dispatch time, so a stale callback cannot target a newer mission. S13 owns
 * the Pause Overlay and the Return-to-Base user control that invokes this seam.
 */
export function abortMission(
  store: SessionStore,
  combatHullIntegrity: number,
  missionInstanceOrdinal: number,
): void {
  store.dispatch({
    type: 'mission/result',
    result: {
      kind: 'aborted',
      missionInstanceOrdinal,
      combatHullIntegrity,
    },
  });
}
