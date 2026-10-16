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
 *
 * The v0.2.1 combat patch candidate
 * (`SHMUP_V0.2.1_COMBAT_PATCH_SPECIFICATION` §§2.1–2.2) replaces the Mission 01
 * and Mission 02 encounter schedules with the exact authored formations in
 * this intermediate state; those formations are authored data in this
 * registry, not a runtime interval generator.
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
 * V02-DEC-018/021/026). `top` is a normalized fraction measured inside the
 * current Aircraft horizontal engagement band; `seeded-side` is an approved
 * horizontal entry at a viewport-`Y` fraction (the Mission 02 delayed Basic
 * flank and Hunters), whose side the deterministic `mission-data` stream
 * resolves in encounter order; `fixed-side` is an authored, non-seeded
 * horizontal entry at an explicit side (the two opposite-side Hunters of every
 * v0.2.1 patch §2.1 `RBH14` block), which consumes no `mission-data` draw. Top
 * Placements consume zero RNG draws as well (V02-AC-003).
 */
export type SpawnPlacement =
  | { readonly kind: 'top'; readonly fraction: number }
  | { readonly kind: 'seeded-side'; readonly yViewportFraction: number }
  | {
      readonly kind: 'fixed-side';
      readonly side: 'upper-left' | 'upper-right';
      readonly yViewportFraction: number;
    };

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
   * M01 e2 Ranged `+2 s`, M01 e4 Hunter `+3 s`, M03 e1 Ranged `+2 s`,
   * M03 e3 Hunter `+2 s`). Absent when the canonical table gives no explicit
   * offset. Qualitative delays carry no invented number and are represented by
   * their subject-specific bounded formation id.
   */
  readonly roleDelays?: readonly RoleDelay[];
  /**
   * Exact authored runtime staging (Epic §8.1.1–8.3.1, V02-DEC-021/026/032 as
   * superseded by V021-DEC-003 for Mission 03): the ordered Arrival Groups and
   * normalized Spawn Placements this encounter consumes at runtime. Every
   * encounter of every authored Interception Mission carries its exact numeric
   * staging (Mission 01 `V02-DEC-021`, Mission 02 `V02-DEC-026`, Mission 03
   * `V021-DEC-003` for e1–e7 with the `V02-DEC-032` Elite-only e8 arrival
   * preserved).
   *
   * v0.2.1 patch §§2.1–2.3 (`SHMUP_V0.2.1_COMBAT_PATCH_SPECIFICATION`) replaces
   * the Mission 01, Mission 02 and Mission 03 staging with the exact authored
   * formations below; the v0.2 groups they supersede are not retained, and
   * Mission 03's superseded small-group projection — including its three seeded
   * Hunter side draws — is gone.
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

/**
 * v0.2.1 combat patch §§2.1–2.3
 * (`SHMUP_V0.2.1_COMBAT_PATCH_SPECIFICATION`, V021-AC-001) Mission 01/02/03
 * formation templates. Each template is its ordered rows; every row lists its
 * members left to right and carries the exact §2.1/§2.2/§2.3 fractions. In §2.1
 * `BR12`/`BR18` keep a Basic member at both flanks of the rear mixed row so
 * Basic visibly leads Ranged, while the §2.3 `BR12` is `4B / 4B / 4R` and
 * `BRH14`/`H4-12`/`RH6-16` add one symmetric fixed-side Hunter wave to their
 * first Top row. These are authored data, never a runtime interval generator.
 */
type PatchMission01BlockTemplate = 'B16' | 'B12' | 'BR12' | 'BR18' | 'BRH14';
type PatchMission02BlockTemplate =
  'B16' | 'R4-12' | 'R4-16' | 'H4-12' | 'RH6-16';
type PatchMission03BlockTemplate = 'B12' | 'BR12' | 'H4-12' | 'RH6-16';

/** The four-column Top fractions shared by every four-member §2.1/§2.2 row. */
const PATCH_FOUR_COLUMN_FRACTIONS: readonly number[] = [0.32, 0.44, 0.56, 0.68];

/** The six-column Top fractions shared by every six-member §2.1/§2.2 row. */
const PATCH_SIX_COLUMN_FRACTIONS: readonly number[] = [
  0.25, 0.35, 0.45, 0.55, 0.65, 0.75,
];

/** §2.1/§2.2: consecutive rows inside one block start 39 fixed steps (0.65 s)
 *  after their predecessor. */
const PATCH_ROW_STEP_CENTISECONDS = 65;

/** §2.1: both fixed-side Hunters of a `BRH14` block enter at Y = 0.20 VH. */
const PATCH_MISSION01_HUNTER_Y_VIEWPORT_FRACTION = 0.2;

/** §2.2 `H4`: two fixed-side Hunters per side at Y = 0.15, 0.25 VH. */
const PATCH_MISSION02_H4_HUNTER_Y_VIEWPORT_FRACTIONS: readonly number[] = [
  0.15, 0.25,
];

/** §2.2 `H6`: three fixed-side Hunters per side at Y = 0.10, 0.20, 0.30 VH. */
const PATCH_MISSION02_H6_HUNTER_Y_VIEWPORT_FRACTIONS: readonly number[] = [
  0.1, 0.2, 0.3,
];

/** One §2.1/§2.2 row of `count` equal Top members at the four- or six-column
 *  fractions, ordered left to right. */
function patchTopRow(
  type: EnemyType,
  count: 4 | 6,
): readonly ArrivalGroupMember[] {
  const fractions =
    count === 6 ? PATCH_SIX_COLUMN_FRACTIONS : PATCH_FOUR_COLUMN_FRACTIONS;
  return fractions.map((fraction) => ({
    type,
    placement: { kind: 'top', fraction },
  }));
}

/** One fixed-side Hunter at an authored side and Y (no `mission-data` draw). */
function patchFixedSideHunter(
  side: 'upper-left' | 'upper-right',
  yViewportFraction: number,
): ArrivalGroupMember {
  return {
    type: 'hunter-drone',
    placement: { kind: 'fixed-side', side, yViewportFraction },
  };
}

/** A symmetric fixed-side Hunter wave: one Hunter per side at each authored Y,
 *  ordered left Hunters by ascending Y then right Hunters by ascending Y
 *  (§2.1/§2.2), consuming no `mission-data` draw. */
function patchFixedSideHunterWave(
  yViewportFractions: readonly number[],
): readonly ArrivalGroupMember[] {
  return [
    ...yViewportFractions.map((y) => patchFixedSideHunter('upper-left', y)),
    ...yViewportFractions.map((y) => patchFixedSideHunter('upper-right', y)),
  ];
}

/** The mixed `BR12`/`BR18` rear row (`(B, R, … R, B)`): a Basic flank at both
 *  ends so Basic visibly leads Ranged (§2.1). */
function patchMission01ScreenedRow(
  count: 4 | 6,
): readonly ArrivalGroupMember[] {
  const fractions =
    count === 6 ? PATCH_SIX_COLUMN_FRACTIONS : PATCH_FOUR_COLUMN_FRACTIONS;
  return fractions.map((fraction, index) => ({
    type:
      index === 0 || index === fractions.length - 1
        ? 'basic-drone'
        : 'ranged-drone',
    placement: { kind: 'top', fraction },
  }));
}

/** The five §2.1 Mission 01 block templates (rows top to bottom). */
const PATCH_MISSION01_BLOCK_TEMPLATES: Readonly<
  Record<
    PatchMission01BlockTemplate,
    readonly (readonly ArrivalGroupMember[])[]
  >
> = {
  B16: [
    patchTopRow('basic-drone', 4),
    patchTopRow('basic-drone', 4),
    patchTopRow('basic-drone', 4),
    patchTopRow('basic-drone', 4),
  ],
  B12: [
    patchTopRow('basic-drone', 4),
    patchTopRow('basic-drone', 4),
    patchTopRow('basic-drone', 4),
  ],
  BR12: [
    patchTopRow('basic-drone', 4),
    patchTopRow('basic-drone', 4),
    patchMission01ScreenedRow(4),
  ],
  BR18: [
    patchTopRow('basic-drone', 6),
    patchTopRow('basic-drone', 6),
    patchMission01ScreenedRow(6),
  ],
  BRH14: [
    [
      ...patchTopRow('basic-drone', 4),
      ...patchFixedSideHunterWave([PATCH_MISSION01_HUNTER_Y_VIEWPORT_FRACTION]),
    ],
    patchTopRow('basic-drone', 4),
    patchTopRow('ranged-drone', 4),
  ],
};

/** The five §2.2 Mission 02 block templates (rows top to bottom). */
const PATCH_MISSION02_BLOCK_TEMPLATES: Readonly<
  Record<
    PatchMission02BlockTemplate,
    readonly (readonly ArrivalGroupMember[])[]
  >
> = {
  B16: [
    patchTopRow('basic-drone', 4),
    patchTopRow('basic-drone', 4),
    patchTopRow('basic-drone', 4),
    patchTopRow('basic-drone', 4),
  ],
  'R4-12': [
    patchTopRow('basic-drone', 4),
    patchTopRow('basic-drone', 4),
    patchTopRow('ranged-drone', 4),
  ],
  'R4-16': [
    patchTopRow('basic-drone', 4),
    patchTopRow('basic-drone', 4),
    patchTopRow('basic-drone', 4),
    patchTopRow('ranged-drone', 4),
  ],
  'H4-12': [
    [
      ...patchTopRow('basic-drone', 4),
      ...patchFixedSideHunterWave(
        PATCH_MISSION02_H4_HUNTER_Y_VIEWPORT_FRACTIONS,
      ),
    ],
    patchTopRow('basic-drone', 4),
  ],
  'RH6-16': [
    [
      ...patchTopRow('basic-drone', 6),
      ...patchFixedSideHunterWave(
        PATCH_MISSION02_H6_HUNTER_Y_VIEWPORT_FRACTIONS,
      ),
    ],
    patchTopRow('ranged-drone', 4),
  ],
};

/** §2.3 `H4`: two fixed-side Hunters per side at Y = 0.15, 0.25 VH. */
const PATCH_MISSION03_H4_HUNTER_Y_VIEWPORT_FRACTIONS: readonly number[] = [
  0.15, 0.25,
];

/** §2.3 `H6`: three fixed-side Hunters per side at Y = 0.10, 0.20, 0.30 VH. */
const PATCH_MISSION03_H6_HUNTER_Y_VIEWPORT_FRACTIONS: readonly number[] = [
  0.1, 0.2, 0.3,
];

/** The four §2.3 Mission 03 block templates (rows top to bottom): `B12` is
 *  three four-member Basic Top rows, `BR12` keeps its Ranged row after two
 *  Basic rows, and `H4-12`/`RH6-16` carry their fixed-side Hunter wave in the
 *  first Top row. */
const PATCH_MISSION03_BLOCK_TEMPLATES: Readonly<
  Record<
    PatchMission03BlockTemplate,
    readonly (readonly ArrivalGroupMember[])[]
  >
> = {
  B12: [
    patchTopRow('basic-drone', 4),
    patchTopRow('basic-drone', 4),
    patchTopRow('basic-drone', 4),
  ],
  BR12: [
    patchTopRow('basic-drone', 4),
    patchTopRow('basic-drone', 4),
    patchTopRow('ranged-drone', 4),
  ],
  'H4-12': [
    [
      ...patchTopRow('basic-drone', 4),
      ...patchFixedSideHunterWave(
        PATCH_MISSION03_H4_HUNTER_Y_VIEWPORT_FRACTIONS,
      ),
    ],
    patchTopRow('basic-drone', 4),
  ],
  'RH6-16': [
    [
      ...patchTopRow('basic-drone', 6),
      ...patchFixedSideHunterWave(
        PATCH_MISSION03_H6_HUNTER_Y_VIEWPORT_FRACTIONS,
      ),
    ],
    patchTopRow('ranged-drone', 4),
  ],
};

/** One authored v0.2.1 formation start: its parent encounter, Mission Clock
 *  start, and block template. */
interface PatchFormation<T extends string> {
  readonly encounterId: string;
  readonly startSeconds: number;
  readonly template: T;
}

/**
 * The 26 explicit §2.1 Mission 01 formation starts, in Mission Clock order.
 * This table plus the five templates above is the authored Mission 01 content;
 * the projection below only places each start's rows on the encounter's
 * fixed-step offsets. There is no runtime interval generator: removing,
 * duplicating, or reordering a line here changes the authored rows directly.
 */
const PATCH_MISSION01_FORMATIONS: readonly PatchFormation<PatchMission01BlockTemplate>[] =
  [
    { encounterId: 'interception-01-e1', startSeconds: 4, template: 'B16' },
    { encounterId: 'interception-01-e1', startSeconds: 10, template: 'B12' },
    { encounterId: 'interception-01-e1', startSeconds: 18, template: 'B12' },
    { encounterId: 'interception-01-e1', startSeconds: 26, template: 'B12' },
    { encounterId: 'interception-01-e1', startSeconds: 34, template: 'B12' },
    { encounterId: 'interception-01-e1', startSeconds: 42, template: 'B16' },
    { encounterId: 'interception-01-e1', startSeconds: 50, template: 'B12' },
    { encounterId: 'interception-01-e2', startSeconds: 55, template: 'BR12' },
    { encounterId: 'interception-01-e2', startSeconds: 63, template: 'BR12' },
    { encounterId: 'interception-01-e2', startSeconds: 71, template: 'BR12' },
    { encounterId: 'interception-01-e2', startSeconds: 79, template: 'BR12' },
    { encounterId: 'interception-01-e2', startSeconds: 87, template: 'B12' },
    { encounterId: 'interception-01-e2', startSeconds: 95, template: 'BR12' },
    { encounterId: 'interception-01-e3', startSeconds: 100, template: 'BRH14' },
    { encounterId: 'interception-01-e3', startSeconds: 108, template: 'BR18' },
    { encounterId: 'interception-01-e3', startSeconds: 116, template: 'BR12' },
    { encounterId: 'interception-01-e3', startSeconds: 124, template: 'BRH14' },
    { encounterId: 'interception-01-e3', startSeconds: 132, template: 'BR12' },
    { encounterId: 'interception-01-e4', startSeconds: 140, template: 'BR12' },
    { encounterId: 'interception-01-e4', startSeconds: 147, template: 'BRH14' },
    { encounterId: 'interception-01-e4', startSeconds: 154, template: 'BR18' },
    { encounterId: 'interception-01-e4', startSeconds: 161, template: 'BR12' },
    { encounterId: 'interception-01-e4', startSeconds: 168, template: 'BRH14' },
    { encounterId: 'interception-01-e4', startSeconds: 175, template: 'BR18' },
    { encounterId: 'interception-01-e4', startSeconds: 182, template: 'BR12' },
    {
      encounterId: 'interception-01-e5',
      startSeconds: 188.7,
      template: 'BRH14',
    },
  ];

/**
 * The 35 explicit §2.2 Mission 02 formation starts, in Mission Clock order.
 * Same authored-table contract as Mission 01: this table plus the five Mission
 * 02 templates above is the authored content, and no runtime interval
 * generator expands it further.
 */
const PATCH_MISSION02_FORMATIONS: readonly PatchFormation<PatchMission02BlockTemplate>[] =
  [
    { encounterId: 'interception-02-e1', startSeconds: 10, template: 'B16' },
    { encounterId: 'interception-02-e1', startSeconds: 18, template: 'B16' },
    { encounterId: 'interception-02-e1', startSeconds: 26, template: 'B16' },
    { encounterId: 'interception-02-e1', startSeconds: 34, template: 'B16' },
    { encounterId: 'interception-02-e1', startSeconds: 42, template: 'B16' },
    { encounterId: 'interception-02-e2', startSeconds: 50, template: 'R4-12' },
    { encounterId: 'interception-02-e2', startSeconds: 57, template: 'R4-16' },
    { encounterId: 'interception-02-e2', startSeconds: 64, template: 'R4-12' },
    { encounterId: 'interception-02-e2', startSeconds: 71, template: 'R4-16' },
    { encounterId: 'interception-02-e2', startSeconds: 78, template: 'R4-12' },
    { encounterId: 'interception-02-e2', startSeconds: 85, template: 'R4-16' },
    { encounterId: 'interception-02-e2', startSeconds: 92, template: 'R4-12' },
    {
      encounterId: 'interception-02-e3',
      startSeconds: 100,
      template: 'R4-16',
    },
    {
      encounterId: 'interception-02-e3',
      startSeconds: 107,
      template: 'R4-12',
    },
    {
      encounterId: 'interception-02-e3',
      startSeconds: 114,
      template: 'R4-16',
    },
    {
      encounterId: 'interception-02-e3',
      startSeconds: 120,
      template: 'H4-12',
    },
    {
      encounterId: 'interception-02-e3',
      startSeconds: 128,
      template: 'R4-12',
    },
    {
      encounterId: 'interception-02-e3',
      startSeconds: 135,
      template: 'R4-16',
    },
    {
      encounterId: 'interception-02-e3',
      startSeconds: 142,
      template: 'R4-12',
    },
    {
      encounterId: 'interception-02-e4',
      startSeconds: 150,
      template: 'H4-12',
    },
    {
      encounterId: 'interception-02-e4',
      startSeconds: 157,
      template: 'R4-12',
    },
    {
      encounterId: 'interception-02-e4',
      startSeconds: 164,
      template: 'RH6-16',
    },
    {
      encounterId: 'interception-02-e4',
      startSeconds: 171,
      template: 'R4-12',
    },
    {
      encounterId: 'interception-02-e4',
      startSeconds: 178,
      template: 'R4-16',
    },
    {
      encounterId: 'interception-02-e4',
      startSeconds: 185,
      template: 'H4-12',
    },
    {
      encounterId: 'interception-02-e4',
      startSeconds: 192,
      template: 'R4-12',
    },
    {
      encounterId: 'interception-02-e5',
      startSeconds: 200,
      template: 'R4-12',
    },
    {
      encounterId: 'interception-02-e5',
      startSeconds: 207,
      template: 'R4-12',
    },
    {
      encounterId: 'interception-02-e5',
      startSeconds: 214,
      template: 'R4-12',
    },
    {
      encounterId: 'interception-02-e5',
      startSeconds: 222,
      template: 'H4-12',
    },
    {
      encounterId: 'interception-02-e5',
      startSeconds: 229,
      template: 'R4-12',
    },
    { encounterId: 'interception-02-e5', startSeconds: 236, template: 'B16' },
    {
      encounterId: 'interception-02-e6',
      startSeconds: 244,
      template: 'RH6-16',
    },
    {
      encounterId: 'interception-02-e6',
      startSeconds: 251,
      template: 'R4-12',
    },
    {
      encounterId: 'interception-02-e6',
      startSeconds: 258.7,
      template: 'R4-12',
    },
  ];

/**
 * The 44 explicit §2.3 Mission 03 formation starts, in Mission Clock order
 * (V021-DEC-003 expansion of the approved authored candidate table). Same
 * authored-table contract as Mission 01 and Mission 02: this table plus the
 * four Mission 03 templates above is the authored Mission 03 content, and no
 * runtime interval or reactive generator expands it further. The three seeded
 * Hunter side draws of the superseded v0.2 schedule are gone; every `H4-12` and
 * `RH6-16` wave is a fixed simultaneous side wave consuming no draw.
 */
const PATCH_MISSION03_FORMATIONS: readonly PatchFormation<PatchMission03BlockTemplate>[] =
  [
    { encounterId: 'interception-03-e1', startSeconds: 10, template: 'BR12' },
    { encounterId: 'interception-03-e1', startSeconds: 18, template: 'B12' },
    { encounterId: 'interception-03-e1', startSeconds: 26, template: 'BR12' },
    { encounterId: 'interception-03-e1', startSeconds: 34, template: 'B12' },
    { encounterId: 'interception-03-e1', startSeconds: 42, template: 'BR12' },
    { encounterId: 'interception-03-e1', startSeconds: 50, template: 'B12' },
    { encounterId: 'interception-03-e2', startSeconds: 55, template: 'BR12' },
    { encounterId: 'interception-03-e2', startSeconds: 62, template: 'BR12' },
    { encounterId: 'interception-03-e2', startSeconds: 69, template: 'BR12' },
    { encounterId: 'interception-03-e2', startSeconds: 76, template: 'BR12' },
    { encounterId: 'interception-03-e2', startSeconds: 83, template: 'BR12' },
    { encounterId: 'interception-03-e2', startSeconds: 90, template: 'B12' },
    { encounterId: 'interception-03-e3', startSeconds: 95, template: 'RH6-16' },
    { encounterId: 'interception-03-e3', startSeconds: 103, template: 'BR12' },
    { encounterId: 'interception-03-e3', startSeconds: 111, template: 'BR12' },
    { encounterId: 'interception-03-e3', startSeconds: 119, template: 'BR12' },
    { encounterId: 'interception-03-e3', startSeconds: 127, template: 'H4-12' },
    { encounterId: 'interception-03-e3', startSeconds: 135, template: 'B12' },
    { encounterId: 'interception-03-e4', startSeconds: 140, template: 'BR12' },
    { encounterId: 'interception-03-e4', startSeconds: 147, template: 'BR12' },
    { encounterId: 'interception-03-e4', startSeconds: 154, template: 'B12' },
    { encounterId: 'interception-03-e4', startSeconds: 161, template: 'H4-12' },
    { encounterId: 'interception-03-e4', startSeconds: 168, template: 'BR12' },
    { encounterId: 'interception-03-e4', startSeconds: 175, template: 'BR12' },
    {
      encounterId: 'interception-03-e4',
      startSeconds: 182,
      template: 'RH6-16',
    },
    { encounterId: 'interception-03-e5', startSeconds: 190, template: 'BR12' },
    { encounterId: 'interception-03-e5', startSeconds: 198, template: 'B12' },
    {
      encounterId: 'interception-03-e5',
      startSeconds: 206,
      template: 'RH6-16',
    },
    { encounterId: 'interception-03-e5', startSeconds: 214, template: 'BR12' },
    { encounterId: 'interception-03-e5', startSeconds: 222, template: 'BR12' },
    {
      encounterId: 'interception-03-e5',
      startSeconds: 230,
      template: 'RH6-16',
    },
    { encounterId: 'interception-03-e6', startSeconds: 235, template: 'BR12' },
    { encounterId: 'interception-03-e6', startSeconds: 242, template: 'B12' },
    { encounterId: 'interception-03-e6', startSeconds: 249, template: 'H4-12' },
    { encounterId: 'interception-03-e6', startSeconds: 256, template: 'BR12' },
    { encounterId: 'interception-03-e6', startSeconds: 263, template: 'BR12' },
    {
      encounterId: 'interception-03-e6',
      startSeconds: 270,
      template: 'RH6-16',
    },
    { encounterId: 'interception-03-e7', startSeconds: 275, template: 'BR12' },
    { encounterId: 'interception-03-e7', startSeconds: 282, template: 'B12' },
    { encounterId: 'interception-03-e7', startSeconds: 289, template: 'BR12' },
    { encounterId: 'interception-03-e7', startSeconds: 296, template: 'BR12' },
    { encounterId: 'interception-03-e7', startSeconds: 303, template: 'BR12' },
    {
      encounterId: 'interception-03-e7',
      startSeconds: 310,
      template: 'RH6-16',
    },
    { encounterId: 'interception-03-e7', startSeconds: 318, template: 'BR12' },
  ];

/** Projects one authored formation into its ordered Arrival Groups at the exact
 *  0.65 s (39 fixed-step) row interval. Hundredth-of-a-second arithmetic keeps
 *  every projected offset identical to its authored decimal. */
function patchFormationRows<T extends string>(
  templates: Readonly<Record<T, readonly (readonly ArrivalGroupMember[])[]>>,
  formation: PatchFormation<T>,
  encounterStartSeconds: number,
): readonly ArrivalGroup[] {
  const startCentiseconds = Math.round(formation.startSeconds * 100);
  const encounterCentiseconds = Math.round(encounterStartSeconds * 100);
  return templates[formation.template].map((members, rowIndex) => ({
    offsetSeconds:
      (startCentiseconds -
        encounterCentiseconds +
        rowIndex * PATCH_ROW_STEP_CENTISECONDS) /
      100,
    members,
  }));
}

/** Projects the authored formations of one encounter into ordered Arrival
 *  Groups, preserving authored formation and member order. */
function patchStaging<T extends string>(
  templates: Readonly<Record<T, readonly (readonly ArrivalGroupMember[])[]>>,
  formations: readonly PatchFormation<T>[],
  encounterId: string,
  encounterStartSeconds: number,
): readonly ArrivalGroup[] {
  return formations
    .filter((formation) => formation.encounterId === encounterId)
    .flatMap((formation) =>
      patchFormationRows(templates, formation, encounterStartSeconds),
    );
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
      timeSeconds: 4,
      composition: [entry('basic-drone', 92)],
      entry: { kind: 'fixed', region: 'top' },
      formation: 'authored-stagger',
      staging: patchStaging(
        PATCH_MISSION01_BLOCK_TEMPLATES,
        PATCH_MISSION01_FORMATIONS,
        'interception-01-e1',
        4,
      ),
    },
    {
      id: 'interception-01-e2',
      timeSeconds: 55,
      composition: [entry('basic-drone', 62), entry('ranged-drone', 10)],
      entry: { kind: 'fixed', region: 'top' },
      formation: 'authored-stagger',
      staging: patchStaging(
        PATCH_MISSION01_BLOCK_TEMPLATES,
        PATCH_MISSION01_FORMATIONS,
        'interception-01-e2',
        55,
      ),
    },
    {
      id: 'interception-01-e3',
      timeSeconds: 100,
      composition: [
        entry('basic-drone', 50),
        entry('ranged-drone', 16),
        entry('hunter-drone', 4),
      ],
      entry: { kind: 'unspecified' },
      formation: 'authored-stagger',
      staging: patchStaging(
        PATCH_MISSION01_BLOCK_TEMPLATES,
        PATCH_MISSION01_FORMATIONS,
        'interception-01-e3',
        100,
      ),
    },
    {
      id: 'interception-01-e4',
      timeSeconds: 140,
      composition: [
        entry('basic-drone', 74),
        entry('ranged-drone', 22),
        entry('hunter-drone', 4),
      ],
      entry: { kind: 'unspecified' },
      formation: 'authored-stagger',
      staging: patchStaging(
        PATCH_MISSION01_BLOCK_TEMPLATES,
        PATCH_MISSION01_FORMATIONS,
        'interception-01-e4',
        140,
      ),
    },
    {
      id: 'interception-01-e5',
      timeSeconds: 188.7,
      composition: [
        entry('basic-drone', 8),
        entry('ranged-drone', 4),
        entry('hunter-drone', 2),
      ],
      entry: { kind: 'unspecified' },
      formation: 'authored-stagger',
      staging: patchStaging(
        PATCH_MISSION01_BLOCK_TEMPLATES,
        PATCH_MISSION01_FORMATIONS,
        'interception-01-e5',
        188.7,
      ),
    },
  ],
  // v0.2.1 patch §2.1: 286 Basic × 1 + 52 Ranged × 2 + 10 Hunter × 2 = 410
  // maximum combat reward, plus the 8-Credit completion reward = 418.
  totals: { basic: 286, ranged: 52, hunter: 10, elite: 0 },
  maximumCombatReward: 410,
  maximumSuccessPayout: 418,
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
      composition: [entry('basic-drone', 80)],
      entry: { kind: 'fixed', region: 'top' },
      formation: 'authored-stagger',
      staging: patchStaging(
        PATCH_MISSION02_BLOCK_TEMPLATES,
        PATCH_MISSION02_FORMATIONS,
        'interception-02-e1',
        10,
      ),
    },
    {
      id: 'interception-02-e2',
      timeSeconds: 50,
      composition: [entry('basic-drone', 68), entry('ranged-drone', 28)],
      entry: { kind: 'fixed', region: 'top' },
      formation: 'authored-stagger',
      staging: patchStaging(
        PATCH_MISSION02_BLOCK_TEMPLATES,
        PATCH_MISSION02_FORMATIONS,
        'interception-02-e2',
        50,
      ),
    },
    {
      id: 'interception-02-e3',
      timeSeconds: 100,
      composition: [
        entry('basic-drone', 68),
        entry('ranged-drone', 24),
        entry('hunter-drone', 4),
      ],
      entry: { kind: 'unspecified' },
      formation: 'authored-stagger',
      staging: patchStaging(
        PATCH_MISSION02_BLOCK_TEMPLATES,
        PATCH_MISSION02_FORMATIONS,
        'interception-02-e3',
        100,
      ),
    },
    {
      id: 'interception-02-e4',
      timeSeconds: 150,
      composition: [
        entry('basic-drone', 58),
        entry('ranged-drone', 20),
        entry('hunter-drone', 14),
      ],
      entry: { kind: 'unspecified' },
      formation: 'authored-stagger',
      staging: patchStaging(
        PATCH_MISSION02_BLOCK_TEMPLATES,
        PATCH_MISSION02_FORMATIONS,
        'interception-02-e4',
        150,
      ),
    },
    {
      id: 'interception-02-e5',
      timeSeconds: 200,
      composition: [
        entry('basic-drone', 56),
        entry('ranged-drone', 16),
        entry('hunter-drone', 4),
      ],
      entry: { kind: 'unspecified' },
      formation: 'authored-stagger',
      staging: patchStaging(
        PATCH_MISSION02_BLOCK_TEMPLATES,
        PATCH_MISSION02_FORMATIONS,
        'interception-02-e5',
        200,
      ),
    },
    {
      id: 'interception-02-e6',
      timeSeconds: 244,
      composition: [
        entry('basic-drone', 22),
        entry('ranged-drone', 12),
        entry('hunter-drone', 6),
      ],
      entry: { kind: 'unspecified' },
      formation: 'authored-stagger',
      staging: patchStaging(
        PATCH_MISSION02_BLOCK_TEMPLATES,
        PATCH_MISSION02_FORMATIONS,
        'interception-02-e6',
        244,
      ),
    },
  ],
  // v0.2.1 patch §2.2: 352 Basic × 1 + 100 Ranged × 2 + 28 Hunter × 2 = 608
  // maximum combat reward, plus the 12-Credit completion reward = 620.
  totals: { basic: 352, ranged: 100, hunter: 28, elite: 0 },
  maximumCombatReward: 608,
  maximumSuccessPayout: 620,
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
      // §2.3 e1: 3×BR12 + 3×B12 = 60 Basic + 12 Ranged. Rows 00:10, 00:18,
      // 00:26, 00:34, 00:42 and 00:50; the first Ranged row reaches 00:11.30.
      composition: [entry('basic-drone', 60), entry('ranged-drone', 12)],
      entry: { kind: 'unspecified' },
      formation: 'authored-stagger',
      staging: patchStaging(
        PATCH_MISSION03_BLOCK_TEMPLATES,
        PATCH_MISSION03_FORMATIONS,
        'interception-03-e1',
        10,
      ),
    },
    {
      id: 'interception-03-e2',
      timeSeconds: 55,
      // §2.3 e2: 5×BR12 + 1×B12 = 52 Basic + 20 Ranged; rows 00:55 → 01:31.30.
      composition: [entry('basic-drone', 52), entry('ranged-drone', 20)],
      entry: { kind: 'unspecified' },
      formation: 'authored-stagger',
      staging: patchStaging(
        PATCH_MISSION03_BLOCK_TEMPLATES,
        PATCH_MISSION03_FORMATIONS,
        'interception-03-e2',
        55,
      ),
    },
    {
      id: 'interception-03-e3',
      timeSeconds: 95,
      // §2.3 e3: 1×RH6-16 + 3×BR12 + 1×H4-12 + 1×B12 = 50 Basic + 16 Ranged +
      // 10 Hunter. The first Hunters arrive with the 01:35 RH6-16 Top row; the
      // fixed sides consume no mission-data draw.
      composition: [
        entry('basic-drone', 50),
        entry('ranged-drone', 16),
        entry('hunter-drone', 10),
      ],
      entry: { kind: 'unspecified' },
      formation: 'authored-stagger',
      staging: patchStaging(
        PATCH_MISSION03_BLOCK_TEMPLATES,
        PATCH_MISSION03_FORMATIONS,
        'interception-03-e3',
        95,
      ),
    },
    {
      id: 'interception-03-e4',
      timeSeconds: 140,
      // §2.3 e4: 4×BR12 + 1×B12 + 1×H4-12 + 1×RH6-16 = 58 Basic + 20 Ranged +
      // 10 Hunter; rows 02:20 → 03:03.30.
      composition: [
        entry('basic-drone', 58),
        entry('ranged-drone', 20),
        entry('hunter-drone', 10),
      ],
      entry: { kind: 'unspecified' },
      formation: 'authored-stagger',
      staging: patchStaging(
        PATCH_MISSION03_BLOCK_TEMPLATES,
        PATCH_MISSION03_FORMATIONS,
        'interception-03-e4',
        140,
      ),
    },
    {
      id: 'interception-03-e5',
      timeSeconds: 190,
      // §2.3 e5: 3×BR12 + 1×B12 + 2×RH6-16 = 48 Basic + 20 Ranged + 12 Hunter;
      // rows 03:10 → 03:51.30.
      composition: [
        entry('basic-drone', 48),
        entry('ranged-drone', 20),
        entry('hunter-drone', 12),
      ],
      entry: { kind: 'unspecified' },
      formation: 'authored-stagger',
      staging: patchStaging(
        PATCH_MISSION03_BLOCK_TEMPLATES,
        PATCH_MISSION03_FORMATIONS,
        'interception-03-e5',
        190,
      ),
    },
    {
      id: 'interception-03-e6',
      timeSeconds: 235,
      // §2.3 e6: 3×BR12 + 1×B12 + 1×H4-12 + 1×RH6-16 = 50 Basic + 16 Ranged +
      // 10 Hunter; rows 03:55 → 04:31.30.
      composition: [
        entry('basic-drone', 50),
        entry('ranged-drone', 16),
        entry('hunter-drone', 10),
      ],
      entry: { kind: 'unspecified' },
      formation: 'authored-stagger',
      staging: patchStaging(
        PATCH_MISSION03_BLOCK_TEMPLATES,
        PATCH_MISSION03_FORMATIONS,
        'interception-03-e6',
        235,
      ),
    },
    {
      id: 'interception-03-e7',
      timeSeconds: 275,
      // §2.3 e7: 5×BR12 + 1×B12 + 1×RH6-16 = 58 Basic + 24 Ranged + 6 Hunter.
      // Rows start 04:35 → 05:18; the last regular Ranged row reaches 05:19.30,
      // 0.70 s before the separate 05:20 Elite, and no regular is cleaned up.
      composition: [
        entry('basic-drone', 58),
        entry('ranged-drone', 24),
        entry('hunter-drone', 6),
      ],
      entry: { kind: 'unspecified' },
      formation: 'authored-stagger',
      staging: patchStaging(
        PATCH_MISSION03_BLOCK_TEMPLATES,
        PATCH_MISSION03_FORMATIONS,
        'interception-03-e7',
        275,
      ),
    },
    {
      id: 'interception-03-e8',
      timeSeconds: 320,
      // V02-DEC-032 (preserved by V021-DEC-003): the single final `05:20` group
      // is the Elite-only group; its Top Placement consumes no `mission-data`
      // draw and it stays the last authored arrival.
      composition: [entry('elite-drone', 1)],
      entry: { kind: 'unspecified' },
      formation: 'upper-combat-zone',
      staging: [
        {
          offsetSeconds: 0,
          members: [
            { type: 'elite-drone', placement: { kind: 'top', fraction: 0.5 } },
          ],
        },
      ],
    },
  ],
  // v0.2.1 patch §5: 376 Basic × 1 + 128 Ranged × 2 + 48 Hunter × 2 + 8 for the
  // single Elite = 736 maximum combat reward, plus the unchanged 16-Credit
  // completion reward = the 752-Credit theoretical maximum.
  totals: { basic: 376, ranged: 128, hunter: 48, elite: 1 },
  maximumCombatReward: 736,
  maximumSuccessPayout: 752,
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
