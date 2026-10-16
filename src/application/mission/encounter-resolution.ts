import type { EnemyType, MissionId } from '@domain/index';
import { createMissionDataStream } from '@domain/index';
import type {
  ArrivalGroup,
  EncounterCompositionEntry,
  EncounterEntryRegion,
  EncounterFormation,
  MissionDefinition,
  RoleDelay,
} from '../content';

/**
 * Deterministic encounter-data resolution contract (Epic §7.2, §8.1.1,
 * V02-AC-003–004; V02-WI-03 delta). Given the same (mission definition, seed,
 * fixed step), it always resolves the same encounter identities, timestamps,
 * compositions, authored ordering, typed entry/formation/delay data, approved
 * seeded entry regions, and — where the canonical source records exact numeric
 * staging (Mission 01 V02-DEC-021, Mission 02 V02-DEC-026, Mission 03
 * V021-DEC-003) — the ordered Arrival Groups and normalized Spawn Placements.
 * It reads ONLY the authored mission definition and the
 * supplied seed — never the current Hull, loadout, Aircraft position, score, or
 * performance — so spawn data cannot react to the player (no Reactive Spawn
 * Cheating). Combat (V02-WI-04+) consumes this resolved plan as its authored
 * input.
 *
 * The only seeded draws are the approved binary entry-region pair for encounters
 * whose authored entry is `seeded` (exactly `upper-left`, `upper-right`, Epic
 * §8). Draws come from the dedicated `mission-data` stream derived from the
 * already-derived mission seed, in strict authored encounter order. No v0.2.1
 * Interception encounter is seeded: Mission 01 §2.1 and Mission 03 §2.3 are
 * entirely authored, and Mission 02 §2.2 removed its seeded sides, so every
 * authored mission resolves zero draws today. Top Placements and `fixed-side`
 * Placements consume zero draws. Every seeded-side staging member
 * resolves its side from the same encounter-level draw, so consuming this
 * contract never changes the authoritative Combat spawn stream sequence
 * (Technical Foundation §8).
 */

export interface ResolvedArrivalGroupMember {
  readonly type: EnemyType;
  readonly placement: ResolvedSpawnPlacement;
}

export type ResolvedSpawnPlacement =
  | { readonly kind: 'top'; readonly engagementBandFraction: number }
  | {
      readonly kind: 'side';
      readonly side: 'upper-left' | 'upper-right';
      readonly yViewportFraction: number;
    };

export interface ResolvedArrivalGroup {
  /** Absolute Mission Clock time = encounter.timeSeconds + offsetSeconds. */
  readonly timeSeconds: number;
  /** Exact fixed-step spawn index (`round(timeSeconds / stepSeconds)`). */
  readonly stepIndex: number;
  /** Authored offset from the encounter arrival, preserved for evidence. */
  readonly offsetSeconds: number;
  readonly members: readonly ResolvedArrivalGroupMember[];
}

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
  /**
   * Resolved ordered Arrival Groups (Epic §8.1.1), or `null` when the authored
   * mission carries no exact numeric staging. All three authored Interception
   * Missions are fully staged (V02-DEC-021, V02-DEC-026, V021-DEC-003).
   */
  readonly staging: readonly ResolvedArrivalGroup[] | null;
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
        staging: resolveStaging(
          encounter.staging,
          entryRegion,
          encounter.timeSeconds,
          stepSeconds,
        ),
      };
    },
  );
  const final = encounters[encounters.length - 1];
  if (final === undefined) {
    throw new Error(
      'Encounter resolution failed: the validated mission has no encounters.',
    );
  }
  // v0.2.1 patch §2.1 (V021-AC-002): the final scheduled arrival is the LATEST
  // resolved Arrival Group, not the last encounter's own arrival time. Mission
  // 01 e5 starts at 03:08.70 and ends its last row at exactly 03:10, so the
  // Combat Countdown still reaches 00:00 on that final member step.
  const finalArrival = finalArrivalOf(encounters, final);
  return {
    missionId: mission.id,
    encounters,
    finalArrivalTimeSeconds: finalArrival.timeSeconds,
    finalArrivalStepIndex: finalArrival.stepIndex,
  };
}

/** The latest resolved member step across every staged encounter; falls back to
 *  the last encounter arrival when a mission carries no positive offset. */
function finalArrivalOf(
  encounters: readonly ResolvedEncounter[],
  fallback: ResolvedEncounter,
): { readonly timeSeconds: number; readonly stepIndex: number } {
  let latest = {
    timeSeconds: fallback.timeSeconds,
    stepIndex: fallback.stepIndex,
  };
  for (const encounter of encounters) {
    for (const group of encounter.staging ?? []) {
      if (group.stepIndex > latest.stepIndex) {
        latest = {
          timeSeconds: group.timeSeconds,
          stepIndex: group.stepIndex,
        };
      }
    }
  }
  return latest;
}

/**
 * Resolves authored Arrival Groups into absolute-step groups (Epic §8.1.1).
 * The seeded side of every `seeded-side` member comes from the encounter's
 * single resolved entry draw (each Mission 02 seeded encounter carries one
 * binary side draw, and every seeded-side member in that encounter resolves
 * from it), so staging consumes no additional RNG beyond that encounter draw
 * and preserves the exact Mission 02 `e4 → e5 → e6` draw order. Authored
 * `fixed-side` members keep their explicit side and consume no draw at all
 * (v0.2.1 patch §2.1).
 */
function resolveStaging(
  staging: readonly ArrivalGroup[] | undefined,
  entryRegion: EncounterEntryRegion | null,
  encounterTimeSeconds: number,
  stepSeconds: number,
): readonly ResolvedArrivalGroup[] | null {
  if (staging === undefined) {
    return null;
  }
  return staging.map((group) => {
    const members = group.members.map((member) => ({
      type: member.type,
      placement:
        member.placement.kind === 'top'
          ? {
              kind: 'top' as const,
              engagementBandFraction: member.placement.fraction,
            }
          : member.placement.kind === 'fixed-side'
            ? {
                kind: 'side' as const,
                side: member.placement.side,
                yViewportFraction: member.placement.yViewportFraction,
              }
            : resolveSeededSide(
                member.placement.yViewportFraction,
                entryRegion,
              ),
    }));
    const timeSeconds = encounterTimeSeconds + group.offsetSeconds;
    return {
      timeSeconds,
      stepIndex: Math.round(timeSeconds / stepSeconds),
      offsetSeconds: group.offsetSeconds,
      members,
    };
  });
}

function resolveSeededSide(
  yViewportFraction: number,
  entryRegion: EncounterEntryRegion | null,
): ResolvedSpawnPlacement {
  if (entryRegion !== 'upper-left' && entryRegion !== 'upper-right') {
    throw new Error(
      'Encounter resolution failed: a seeded-side member requires a resolved seeded entry region.',
    );
  }
  return {
    kind: 'side',
    side: entryRegion,
    yViewportFraction,
  };
}
