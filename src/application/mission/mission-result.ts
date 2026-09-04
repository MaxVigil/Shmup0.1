/**
 * S12 typed terminal mission results (Base §9.5, MASTER-AC-005; Epic §13,
 * V02-AC-020). One typed result and one idempotent application-owned
 * commitment path bound to the originating Mission Instance. V02-WI-02: the
 * result carries the pre-committed persisted campaign values (`creditsAfter`,
 * `hullIntegrityAfter`) produced by the domain transition inside the atomic
 * campaign transaction; the session reducer applies them defensively and never
 * computes economy as a parallel authority. V02-WI-03: a Success result also
 * carries the pre-committed persisted mission progression
 * (`unlockedMissionIdsAfter`, `completedMissionIdsAfter`) so the session
 * mirrors the durable unlock/completion exactly once (V02-AC-002).
 *
 * V02-WI-04: the Success result additionally relays the simulation-owned
 * mission run facts (Destroyed/Escaped counts by type, pending combat rewards,
 * escape penalties) so the v0.2 Success Result Overlay (Epic §15.4) presents
 * the committed run without mutating or re-computing any economy.
 */
import type { CampaignRunStatus, EnemyType, MissionId } from '@domain/index';

/** Authoritative terminal trigger emitted by the Combat simulation. */
export type CombatTerminalResult =
  | { readonly kind: 'success' }
  | { readonly kind: 'defeat' }
  | { readonly kind: 'evacuated' };

/** Per-role destroyed/escaped counts relayed from the authoritative Combat
 *  simulation at the Success commitment instant. */
export type RoleCounts = Readonly<Record<EnemyType, number>>;

/** One typed Mission Result committed through `mission/result`. */
export type MissionResult =
  | {
      readonly kind: 'success';
      readonly missionInstanceOrdinal: number;
      readonly creditsAfter: number;
      readonly hullIntegrityAfter: number;
      /** Total Credits earned by this Success (`netCombat + completionReward`). */
      readonly creditsEarned: number;
      /** Pending combat rewards (Epic §12) relayed for presentation. */
      readonly combatRewards: number;
      /** Pending escape penalties (Epic §12) relayed for presentation. */
      readonly escapePenalties: number;
      /** Net combat payout `max(0, combatRewards - escapePenalties)`. */
      readonly netCombatReward: number;
      readonly completionReward: number;
      /** The mission newly unlocked by this Success, or `null` (Epic §15.4). */
      readonly newlyUnlockedMissionId: MissionId | null;
      readonly destroyedCounts: RoleCounts;
      readonly escapedCounts: RoleCounts;
      /** Durable mission progression after the atomic commitment (V02-WI-03). */
      readonly unlockedMissionIdsAfter: readonly MissionId[];
      readonly completedMissionIdsAfter: readonly MissionId[];
    }
  | {
      readonly kind: 'evacuated';
      readonly missionInstanceOrdinal: number;
      readonly creditsAfter: number;
      readonly hullIntegrityAfter: number;
      /** Total Credits earned by this Evacuation (`floor(netCombat × 0.5)`). */
      readonly creditsEarned: number;
      /** Pending combat rewards frozen at the successful Evacuation. */
      readonly combatRewards: number;
      /** Pending escape penalties frozen at the successful Evacuation. */
      readonly escapePenalties: number;
      /** `max(0, combatRewards - escapePenalties)` before the 50% retention. */
      readonly netCombatReward: number;
      readonly destroyedCounts: RoleCounts;
      readonly escapedCounts: RoleCounts;
      /** Durable mission progression (unchanged by Evacuation — V02-AC-015). */
      readonly unlockedMissionIdsAfter: readonly MissionId[];
      readonly completedMissionIdsAfter: readonly MissionId[];
    }
  | {
      readonly kind: 'defeat';
      readonly missionInstanceOrdinal: number;
      readonly creditsAfter: number;
      readonly hullIntegrityAfter: number;
      /** Durable run status after the atomic Defeat commitment (V02-WI-05):
       *  `active` after an affordable full Repair, `game-over` when Credits
       *  were below the Repair cost. */
      readonly runStatusAfter: CampaignRunStatus;
      /** Credits deducted by the full Repair when affordable (`0` on
       *  Game Over, where no partial deduction occurs). */
      readonly repairCostCredits: number;
    }
  | {
      readonly kind: 'aborted';
      readonly missionInstanceOrdinal: number;
      readonly creditsAfter: number;
      readonly hullIntegrityAfter: number;
    };
