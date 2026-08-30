/**
 * S12 typed terminal mission results (Base §9.5, MASTER-AC-005; Epic §13,
 * V02-AC-020). One typed result and one idempotent application-owned
 * commitment path bound to the originating Mission Instance. V02-WI-02: the
 * result carries the pre-committed persisted campaign values (`creditsAfter`,
 * `hullIntegrityAfter`) produced by the domain transition inside the atomic
 * campaign transaction; the session reducer applies them defensively and never
 * computes economy as a parallel authority.
 */

/** Authoritative terminal trigger emitted by the Combat simulation. */
export type CombatTerminalResult =
  { readonly kind: 'success' } | { readonly kind: 'defeat' };

/** One typed Mission Result committed through `mission/result`. */
export type MissionResult =
  | {
      readonly kind: 'success';
      readonly missionInstanceOrdinal: number;
      readonly creditsAfter: number;
      readonly hullIntegrityAfter: number;
    }
  | {
      readonly kind: 'defeat';
      readonly missionInstanceOrdinal: number;
      readonly creditsAfter: number;
      readonly hullIntegrityAfter: number;
    }
  | {
      readonly kind: 'aborted';
      readonly missionInstanceOrdinal: number;
      readonly creditsAfter: number;
      readonly hullIntegrityAfter: number;
    };
