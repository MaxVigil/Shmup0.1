import type { EnemyType, MissionId } from '@domain/model';

/**
 * v0.2 authored mission registry (Epic §§6–8, V02-AC-001–004). The three
 * Interception Missions are the single authoritative content owner for typed
 * mission identity, authored encounter timelines, compositions, entry/timing
 * rules, rewards, totals, and progression cross-references. Combat consumes
 * this data only as read-only content inputs; no schedule authority is
 * duplicated in Domain, application, React, or Phaser.
 *
 * The legacy `EnemyGroupSchedule` + `MVP_ENEMY_GROUP_SCHEDULE` below are the
 * temporary v0.1 combat group schedule consumed ONLY by the Combat
 * compatibility seam until V02-WI-04 replaces it with this registry. It is not
 * part of the v0.2 mission registry and never becomes a second authority.
 */

/** Canonical Interception mission description shown by Mission Details (Base
 *  §5.2, DS §8.17); the single authored text for every Interception mission. */
export const INTERCEPTION_MISSION_DESCRIPTION =
  'Resolve the incoming enemy wave.';

/** One typed authored enemy-role count inside an encounter composition. */
export interface EncounterCompositionEntry {
  readonly type: EnemyType;
  readonly count: number;
}

/**
 * Bounded semantic authored entry-region identifiers (Epic §8 "Entry and
 * timing"). These are the finite approved region values, not prose or
 * coordinates; no region geometry is invented here.
 */
export const ENCOUNTER_ENTRY_REGIONS = [
  'top',
  'upper-left',
  'upper-right',
] as const;
export type EncounterEntryRegion = (typeof ENCOUNTER_ENTRY_REGIONS)[number];

export function isEncounterEntryRegion(
  value: unknown,
): value is EncounterEntryRegion {
  return ENCOUNTER_ENTRY_REGIONS.some((region) => region === value);
}

/**
 * Bounded semantic authored formation identifiers for the named patterns in
 * Epic §8 "Entry and timing". Each identifier preserves the canonical named
 * fact exactly and is subject-specific where the source names a subject
 * (e.g. `hunter-delayed`, `front-group-plus-delayed-flank`); where the source
 * names no formation the encounter carries `null`. No numeric staging,
 * formation coordinates, or delay value is invented for a gap — those gaps are
 * reported for Product Owner resolution before V02-WI-04 consumes this data at
 * runtime.
 */
export const ENCOUNTER_FORMATIONS = [
  'wide-top',
  'centred-behind-basics',
  'authored-stagger',
  'offset-top',
  'screened',
  'separated-firing-lanes',
  'front-group-plus-delayed-flank',
  'asymmetric',
  'flank-oriented',
  'hunter-delayed',
  'split-firing-lanes',
  'aggressive-interruption',
  'simple',
  'upper-combat-zone',
] as const;
export type EncounterFormation = (typeof ENCOUNTER_FORMATIONS)[number];

export function isEncounterFormation(
  value: unknown,
): value is EncounterFormation {
  return ENCOUNTER_FORMATIONS.some((formation) => formation === value);
}

/**
 * The ONLY approved seeded entry-region pair (Epic §8 `authored upper-left or
 * upper-right`), in this exact order. The deterministic encounter-data contract
 * resolves one of these two values per identical (mission, seed) input; the
 * validation boundary rejects any reversed, mixed, extended, or duplicated
 * variant set so the seed-to-side mapping can never drift.
 */
export type SeededEntryVariants = readonly ['upper-left', 'upper-right'];

/**
 * Authored entry-region contract (Epic §8 "Entry and timing"). `fixed` names
 * the single authored region; `seeded` declares the exact approved ordered
 * variant pair, from which the deterministic contract resolves exactly one
 * value per identical input; `unspecified` represents an Epic §8 row that names
 * no entry region (no default `top` or other region is invented).
 */
export type EncounterEntry =
  | { readonly kind: 'fixed'; readonly region: EncounterEntryRegion }
  | { readonly kind: 'seeded'; readonly variants: SeededEntryVariants }
  | { readonly kind: 'unspecified' };

/**
 * One explicit authored role-level arrival offset (Epic §8 `+N s`): the
 * `type` is the delayed role/group and `delaySeconds` is its offset relative to
 * the encounter arrival. The offset belongs to the delayed role, never to the
 * encounter as a whole.
 */
export interface RoleDelay {
  readonly type: EnemyType;
  readonly delaySeconds: number;
}

/**
 * Authored Spawn Placement for one Arrival Group member (Epic §8.1.1,
 * V02-DEC-018/021). `top` is a normalized fraction measured inside the current
 * Aircraft horizontal engagement band; `seeded-side` is the approved Hunter
 * horizontal entry at a viewport-`Y` fraction, whose side the deterministic
 * `mission-data` stream resolves in encounter order. Top Placements consume
 * zero RNG draws (V02-AC-003).
 */
export type SpawnPlacement =
  | { readonly kind: 'top'; readonly fraction: number }
  | { readonly kind: 'seeded-side'; readonly yViewportFraction: number };

/** One ordered member of an authored Arrival Group (Epic §8.1.1). */
export interface ArrivalGroupMember {
  readonly type: EnemyType;
  readonly placement: SpawnPlacement;
}

/**
 * One authored Arrival Group (Epic §8.1.1): a set of members created at the
 * same mission-clock instant `encounter.timeSeconds + offsetSeconds`. The
 * members are the exact authored order (stable member order, V02-AC-003).
 */
export interface ArrivalGroup {
  /** Offset from the encounter arrival (`+N s`); `0` for the primary group. */
  readonly offsetSeconds: number;
  readonly members: readonly ArrivalGroupMember[];
}

/** One authored encounter on a mission timeline (Epic §8). */
export interface EncounterDefinition {
  /**
   * Stable authored encounter identity in the format `<missionId>-e<n>` (n is
   * the one-based encounter position in the authored timeline). Identities are
   * content and never derived from runtime state; validation enforces that the
   * id belongs to its mission and authored ordinal.
   */
  readonly id: string;
  /** Authored Mission Clock arrival time in seconds (Epic §8). */
  readonly timeSeconds: number;
  /** Authored composition; each role appears at most once in authored order. */
  readonly composition: readonly EncounterCompositionEntry[];
  /** Authored entry-region contract (Epic §8 "Entry and timing"). */
  readonly entry: EncounterEntry;
  /** Bounded semantic authored formation identifier, or `null` when the
   *  canonical source names no formation for this encounter. */
  readonly formation: EncounterFormation | null;
  /**
   * Explicit authored role-level arrival offsets (Epic §8 `+N s` only:
   * M01 e2 Ranged `+2 s`, M01 e4 Hunter `+3 s`). Absent when the canonical
   * table gives no explicit offset. Qualitative delays (`Hunter delayed`,
   * `delayed authored flank`) carry no invented number and are represented by
   * their subject-specific bounded formation id.
   */
  readonly roleDelays?: readonly RoleDelay[];
  /**
   * Exact authored runtime staging (Epic §8.1.1, V02-DEC-021): the ordered
   * Arrival Groups and normalized Spawn Placements this encounter consumes at
   * runtime. Present only where the canonical source records exact numeric
   * staging (Mission 01 for V02-WI-04); Missions 02/03 remain qualitative and
   * carry no staging until their Product Owner staging decisions are recorded.
   */
  readonly staging?: readonly ArrivalGroup[];
}

/** Authored per-role enemy totals for one mission (Epic §8 `Totals:`). */
export interface MissionTotals {
  readonly basic: number;
  readonly ranged: number;
  readonly hunter: number;
  readonly elite: number;
}

export interface MissionDefinition {
  readonly id: MissionId;
  readonly displayName: string;
  readonly description: string;
  /** Completion reward in Credits granted on every Success (Epic §12). */
  readonly completionReward: number;
  /**
   * Mission unlocked by this mission's first Success (Epic §6.2). `null` for
   * Interception 03 — Success marks it completed and unlocks nothing.
   */
  readonly unlocksMissionId: MissionId | null;
  /** Authored encounter timeline in Mission Clock order (Epic §8). */
  readonly encounters: readonly EncounterDefinition[];
  /** Authored per-role totals; validated against the composition sums. */
  readonly totals: MissionTotals;
  /** Authored maximum combat reward in Credits (Epic §8). */
  readonly maximumCombatReward: number;
  /**
   * Authored maximum Success payout in Credits (Epic §8); validated to equal
   * `maximumCombatReward + completionReward`.
   */
  readonly maximumSuccessPayout: number;
}

/** One `EnemyType` role in the authored composition order (Basic, Ranged,
 *  Hunter, Elite — Epic §9 table order). */
function entry(type: EnemyType, count: number): EncounterCompositionEntry {
  return { type, count };
}

/** Derives the authored per-role totals from a mission's encounter timeline. */
export function derivedTotals(
  mission: Pick<MissionDefinition, 'encounters'>,
): MissionTotals {
  const totals: {
    basic: number;
    ranged: number;
    hunter: number;
    elite: number;
  } = { basic: 0, ranged: 0, hunter: 0, elite: 0 };
  for (const encounter of mission.encounters) {
    for (const role of encounter.composition) {
      if (role.type === 'basic-drone') {
        totals.basic += role.count;
      } else if (role.type === 'ranged-drone') {
        totals.ranged += role.count;
      } else if (role.type === 'hunter-drone') {
        totals.hunter += role.count;
      } else {
        totals.elite += role.count;
      }
    }
  }
  return totals;
}

export const INTERCEPTION_01: MissionDefinition = {
  id: 'interception-01',
  displayName: 'Interception 01',
  description: INTERCEPTION_MISSION_DESCRIPTION,
  completionReward: 8,
  unlocksMissionId: 'interception-02',
  encounters: [
    {
      id: 'interception-01-e1',
      timeSeconds: 10,
      composition: [entry('basic-drone', 4)],
      entry: { kind: 'fixed', region: 'top' },
      formation: 'wide-top',
      staging: [
        {
          offsetSeconds: 0,
          members: [
            { type: 'basic-drone', placement: { kind: 'top', fraction: 0.2 } },
            { type: 'basic-drone', placement: { kind: 'top', fraction: 0.4 } },
            { type: 'basic-drone', placement: { kind: 'top', fraction: 0.6 } },
            { type: 'basic-drone', placement: { kind: 'top', fraction: 0.8 } },
          ],
        },
      ],
    },
    {
      id: 'interception-01-e2',
      timeSeconds: 55,
      composition: [entry('basic-drone', 2), entry('ranged-drone', 1)],
      entry: { kind: 'unspecified' },
      formation: 'centred-behind-basics',
      roleDelays: [{ type: 'ranged-drone', delaySeconds: 2 }],
      staging: [
        {
          offsetSeconds: 0,
          members: [
            { type: 'basic-drone', placement: { kind: 'top', fraction: 0.4 } },
            { type: 'basic-drone', placement: { kind: 'top', fraction: 0.6 } },
          ],
        },
        {
          offsetSeconds: 2,
          members: [
            { type: 'ranged-drone', placement: { kind: 'top', fraction: 0.5 } },
          ],
        },
      ],
    },
    {
      id: 'interception-01-e3',
      timeSeconds: 100,
      composition: [entry('hunter-drone', 1)],
      entry: { kind: 'seeded', variants: ['upper-left', 'upper-right'] },
      formation: null,
      staging: [
        {
          offsetSeconds: 0,
          members: [
            {
              type: 'hunter-drone',
              placement: { kind: 'seeded-side', yViewportFraction: 0.2 },
            },
          ],
        },
      ],
    },
    {
      id: 'interception-01-e4',
      timeSeconds: 140,
      composition: [entry('basic-drone', 3), entry('hunter-drone', 1)],
      entry: { kind: 'seeded', variants: ['upper-left', 'upper-right'] },
      formation: null,
      roleDelays: [{ type: 'hunter-drone', delaySeconds: 3 }],
      staging: [
        {
          offsetSeconds: 0,
          members: [
            {
              type: 'basic-drone',
              placement: { kind: 'top', fraction: 0.25 },
            },
            {
              type: 'basic-drone',
              placement: { kind: 'top', fraction: 0.5 },
            },
            {
              type: 'basic-drone',
              placement: { kind: 'top', fraction: 0.75 },
            },
          ],
        },
        {
          offsetSeconds: 3,
          members: [
            {
              type: 'hunter-drone',
              placement: { kind: 'seeded-side', yViewportFraction: 0.2 },
            },
          ],
        },
      ],
    },
    {
      id: 'interception-01-e5',
      timeSeconds: 190,
      composition: [
        entry('basic-drone', 3),
        entry('ranged-drone', 1),
        entry('hunter-drone', 1),
      ],
      entry: { kind: 'seeded', variants: ['upper-left', 'upper-right'] },
      formation: 'authored-stagger',
      staging: [
        {
          offsetSeconds: 0,
          members: [
            {
              type: 'basic-drone',
              placement: { kind: 'top', fraction: 0.2 },
            },
            {
              type: 'ranged-drone',
              placement: { kind: 'top', fraction: 0.4 },
            },
            {
              type: 'basic-drone',
              placement: { kind: 'top', fraction: 0.6 },
            },
            {
              type: 'basic-drone',
              placement: { kind: 'top', fraction: 0.8 },
            },
            {
              type: 'hunter-drone',
              placement: { kind: 'seeded-side', yViewportFraction: 0.2 },
            },
          ],
        },
      ],
    },
  ],
  totals: { basic: 12, ranged: 2, hunter: 3, elite: 0 },
  maximumCombatReward: 22,
  maximumSuccessPayout: 30,
};

export const INTERCEPTION_02: MissionDefinition = {
  id: 'interception-02',
  displayName: 'Interception 02',
  description: INTERCEPTION_MISSION_DESCRIPTION,
  completionReward: 12,
  unlocksMissionId: 'interception-03',
  encounters: [
    {
      id: 'interception-02-e1',
      timeSeconds: 10,
      composition: [entry('basic-drone', 3)],
      entry: { kind: 'fixed', region: 'top' },
      formation: 'offset-top',
    },
    {
      id: 'interception-02-e2',
      timeSeconds: 50,
      composition: [entry('basic-drone', 3), entry('ranged-drone', 1)],
      entry: { kind: 'unspecified' },
      formation: 'screened',
    },
    {
      id: 'interception-02-e3',
      timeSeconds: 100,
      composition: [entry('basic-drone', 2), entry('ranged-drone', 2)],
      entry: { kind: 'unspecified' },
      formation: 'separated-firing-lanes',
    },
    {
      id: 'interception-02-e4',
      timeSeconds: 150,
      composition: [entry('basic-drone', 4)],
      entry: { kind: 'unspecified' },
      formation: 'front-group-plus-delayed-flank',
    },
    {
      id: 'interception-02-e5',
      timeSeconds: 200,
      composition: [
        entry('basic-drone', 1),
        entry('ranged-drone', 1),
        entry('hunter-drone', 1),
      ],
      entry: { kind: 'unspecified' },
      formation: 'authored-stagger',
    },
    {
      id: 'interception-02-e6',
      timeSeconds: 260,
      composition: [entry('basic-drone', 2), entry('hunter-drone', 1)],
      entry: { kind: 'unspecified' },
      formation: 'asymmetric',
    },
  ],
  totals: { basic: 15, ranged: 4, hunter: 2, elite: 0 },
  maximumCombatReward: 27,
  maximumSuccessPayout: 39,
};

export const INTERCEPTION_03: MissionDefinition = {
  id: 'interception-03',
  displayName: 'Interception 03',
  description: INTERCEPTION_MISSION_DESCRIPTION,
  completionReward: 16,
  unlocksMissionId: null,
  encounters: [
    {
      id: 'interception-03-e1',
      timeSeconds: 10,
      composition: [entry('basic-drone', 3), entry('ranged-drone', 1)],
      entry: { kind: 'unspecified' },
      formation: 'screened',
    },
    {
      id: 'interception-03-e2',
      timeSeconds: 55,
      composition: [entry('basic-drone', 3)],
      entry: { kind: 'unspecified' },
      formation: 'flank-oriented',
    },
    {
      id: 'interception-03-e3',
      timeSeconds: 95,
      composition: [
        entry('basic-drone', 2),
        entry('ranged-drone', 1),
        entry('hunter-drone', 1),
      ],
      entry: { kind: 'unspecified' },
      formation: 'hunter-delayed',
    },
    {
      id: 'interception-03-e4',
      timeSeconds: 140,
      composition: [entry('basic-drone', 2), entry('ranged-drone', 2)],
      entry: { kind: 'unspecified' },
      formation: 'split-firing-lanes',
    },
    {
      id: 'interception-03-e5',
      timeSeconds: 190,
      composition: [entry('basic-drone', 1), entry('hunter-drone', 1)],
      entry: { kind: 'unspecified' },
      formation: 'aggressive-interruption',
    },
    {
      id: 'interception-03-e6',
      timeSeconds: 235,
      composition: [entry('basic-drone', 2)],
      entry: { kind: 'unspecified' },
      formation: 'simple',
    },
    {
      id: 'interception-03-e7',
      timeSeconds: 275,
      composition: [entry('hunter-drone', 1)],
      entry: { kind: 'seeded', variants: ['upper-left', 'upper-right'] },
      formation: null,
    },
    {
      id: 'interception-03-e8',
      timeSeconds: 320,
      composition: [entry('elite-drone', 1)],
      entry: { kind: 'unspecified' },
      formation: 'upper-combat-zone',
    },
  ],
  totals: { basic: 13, ranged: 4, hunter: 3, elite: 1 },
  maximumCombatReward: 35,
  maximumSuccessPayout: 51,
};

/** The complete v0.2 mission registry in authored order (Epic §8.1–8.3). */
export const MISSIONS: readonly MissionDefinition[] = [
  INTERCEPTION_01,
  INTERCEPTION_02,
  INTERCEPTION_03,
];

// ---------------------------------------------------------------------------
// Temporary v0.1 Combat compatibility schedule (seam only)
// ---------------------------------------------------------------------------

/**
 * Fixed enemy-group schedule for a mission (Combat §7.3): regular groups every
 * `intervalSeconds` starting at `startTimeSeconds` for `groupCount` groups of
 * `dronesPerGroup`, then one final group at `timeSeconds`.
 */
export interface EnemyGroupSchedule {
  readonly regular: {
    readonly startTimeSeconds: number;
    readonly intervalSeconds: number;
    readonly groupCount: number;
    readonly dronesPerGroup: number;
  };
  readonly final: {
    readonly timeSeconds: number;
    readonly dronesPerGroup: number;
  };
}

/** Total scheduled Basic Drones for a legacy schedule (regular + final). */
export function totalDrones(schedule: EnemyGroupSchedule): number {
  return (
    schedule.regular.groupCount * schedule.regular.dronesPerGroup +
    schedule.final.dronesPerGroup
  );
}

/**
 * The accepted v0.1 single-Interception enemy-group schedule retained ONLY for
 * the temporary Combat compatibility seam until V02-WI-04 routes Combat onto
 * the v0.2 mission registry. It is not part of the v0.2 `MISSIONS` registry.
 */
export const MVP_ENEMY_GROUP_SCHEDULE: EnemyGroupSchedule = {
  regular: {
    startTimeSeconds: 0,
    intervalSeconds: 10,
    groupCount: 11,
    dronesPerGroup: 3,
  },
  final: {
    timeSeconds: 110,
    dronesPerGroup: 5,
  },
};
