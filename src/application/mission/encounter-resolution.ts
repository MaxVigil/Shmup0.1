import type { MissionId } from '@domain/index';
import { createMissionDataStream } from '@domain/index';
import type {
  EncounterCompositionEntry,
  EncounterEntryRegion,
  EncounterFormation,
  MissionDefinition,
  RoleDelay,
} from '../content';

/**
 * Deterministic encounter-data resolution contract (Epic §7.2, V02-AC-003–004;
 * V02-WI-03 delta). Given the same (mission definition, seed, fixed step), it
 * always resolves the same encounter identities, timestamps, compositions,
 * authored ordering, typed entry/formation/delay data, and approved seeded
 * entry regions. It reads ONLY the authored mission definition and the supplied
 * seed — never the current Hull, loadout, Aircraft position, score, or
 * performance — so spawn data cannot react to the player (no Reactive Spawn
 * Cheating). Combat (V02-WI-04+) will consume this resolved plan as its
 * authored input.
 *
 * The only seeded draw is the approved binary entry-region pair for encounters
 * whose authored entry is `seeded` (exactly `upper-left`, `upper-right`, Epic
 * §8). Draws come from the dedicated `mission-data` stream derived from the
 * already-derived mission seed, so consuming this contract never changes the
 * authoritative Combat spawn stream sequence (Technical Foundation §8).
 */

export interface ResolvedEncounter {
  /** Stable authored encounter identity (content `id`). */
  readonly encounterId: string;
  /** Authored Mission Clock arrival time in seconds. */
  readonly timeSeconds: number;
  /** Exact fixed-step spawn index (`round(timeSeconds / stepSeconds)`). */
  readonly stepIndex: number;
  /** Authored composition, unchanged by the seed. */
  readonly composition: readonly EncounterCompositionEntry[];
  /**
   * Resolved authored entry region, or `null` when the Epic §8 row names no
   * entry region (`unspecified`). Seeded variants resolve deterministically
   * from the `mission-data` stream; fixed regions pass through unchanged.
   */
  readonly entryRegion: EncounterEntryRegion | null;
  /** The authored seeded variant pair when the entry is `seeded`, else `null`. */
  readonly entryVariants: readonly ['upper-left', 'upper-right'] | null;
  /** Bounded semantic authored formation identifier, or `null` (Epic §8). */
  readonly formation: EncounterFormation | null;
  /** Explicit authored role-level arrival offsets (Epic §8 `+N s`), preserved
   *  with their delayed role for the V02-WI-04 consumer; empty when none. */
  readonly roleDelays: readonly RoleDelay[];
}

export interface MissionEncounterPlan {
  readonly missionId: MissionId;
  /** Resolved encounters in strict authored/Mission Clock order. */
  readonly encounters: readonly ResolvedEncounter[];
  /** Mission Clock time of the final scheduled arrival (Epic §8.1–8.3). */
  readonly finalArrivalTimeSeconds: number;
  /** Fixed-step index of the final scheduled arrival. */
  readonly finalArrivalStepIndex: number;
}

/**
 * Resolves the complete deterministic encounter plan for one validated mission
 * definition. `seed` is the already-derived mission seed (the Snapshot
 * `combatMissionSeed`); `stepSeconds` is the fixed authoritative Combat step.
 */
export function resolveMissionEncounters(
  mission: MissionDefinition,
  seed: number,
  stepSeconds: number,
): MissionEncounterPlan {
  const stream = createMissionDataStream(seed);
  const encounters: ResolvedEncounter[] = mission.encounters.map(
    (encounter) => {
      const entryRegion =
        encounter.entry.kind === 'seeded'
          ? (encounter.entry.variants[
              stream.nextInt(encounter.entry.variants.length)
            ] ?? 'upper-left')
          : encounter.entry.kind === 'fixed'
            ? encounter.entry.region
            : null;
      return {
        encounterId: encounter.id,
        timeSeconds: encounter.timeSeconds,
        stepIndex: Math.round(encounter.timeSeconds / stepSeconds),
        composition: encounter.composition,
        entryRegion,
        entryVariants:
          encounter.entry.kind === 'seeded' ? encounter.entry.variants : null,
        formation: encounter.formation,
        roleDelays: encounter.roleDelays ?? [],
      };
    },
  );
  const final = encounters[encounters.length - 1];
  if (final === undefined) {
    throw new Error(
      'Encounter resolution failed: the validated mission has no encounters.',
    );
  }
  return {
    missionId: mission.id,
    encounters,
    finalArrivalTimeSeconds: final.timeSeconds,
    finalArrivalStepIndex: final.stepIndex,
  };
}
