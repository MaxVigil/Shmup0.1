import type { ContentCatalogue } from '../catalogue';
import {
  HULL_INTEGRITY_MAX,
  HULL_INTEGRITY_MIN,
  isCredits,
  isDamage,
  isEnemyType,
  isFireRate,
  isHullIntegrity,
  isMissionId,
  isPositiveFinite,
  isSeconds,
  isWeaponType,
} from '@domain/model';
import type { MissionId } from '@domain/model';
import { isEncounterEntryRegion, isEncounterFormation } from '../missions';
import type { MissionDefinition } from '../missions';
import { INTERCEPTION_01, INTERCEPTION_02, INTERCEPTION_03 } from '../missions';

export interface ContentValidationIssue {
  readonly path: string;
  readonly message: string;
}

/**
 * Validates an arbitrary runtime value as an authored content catalogue.
 *
 * Returns every violation found and never mutates, repairs, clamps, or adds
 * defaults to the input (S01-TC-002). Safe for primitive, null, array and
 * malformed-object inputs: no nested property is read before its structure is
 * verified, so validation does not throw on hostile input.
 */
export function validateCatalogue(
  input: unknown,
): readonly ContentValidationIssue[] {
  const issues: ContentValidationIssue[] = [];
  if (!isRecord(input)) {
    issues.push({ path: 'catalogue', message: 'must be a non-null object' });
    return issues;
  }
  validateAircraft(input.aircraft, issues);
  validateWeapons(input.weapons, issues);
  validateEnemies(input.enemies, issues);
  validateMissions(input.missions, issues);
  validatePilots(input.pilots, issues);
  validateProjectile(input.projectile, issues);
  return issues;
}

/** Type guard for a fully valid catalogue. */
export function isContentCatalogue(input: unknown): input is ContentCatalogue {
  return validateCatalogue(input).length === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isPositiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function validateAircraft(
  value: unknown,
  issues: ContentValidationIssue[],
): void {
  if (!isArray(value)) {
    issues.push({ path: 'aircraft', message: 'must be an array' });
    return;
  }
  if (value.length === 0) {
    issues.push({
      path: 'aircraft',
      message: 'must contain at least one aircraft',
    });
  }
  const ids = new Set<string>();
  value.forEach((item, index) => {
    const path = `aircraft[${index}]`;
    if (!isRecord(item)) {
      issues.push({ path, message: 'must be an object' });
      return;
    }
    validateUniqueId(item.id, `${path}.id`, 'aircraft id', ids, issues);
    if (!isNonEmptyString(item.displayName)) {
      issues.push({
        path: `${path}.displayName`,
        message: 'must be a non-empty string',
      });
    }
    if (!isHullIntegrity(item.maximumHullIntegrity)) {
      issues.push({
        path: `${path}.maximumHullIntegrity`,
        message: `must be an integer in ${HULL_INTEGRITY_MIN}..${HULL_INTEGRITY_MAX}`,
      });
    }
  });
}

function validateWeapons(
  value: unknown,
  issues: ContentValidationIssue[],
): void {
  if (!isArray(value)) {
    issues.push({ path: 'weapons', message: 'must be an array' });
    return;
  }
  if (value.length === 0) {
    issues.push({
      path: 'weapons',
      message: 'must contain at least one weapon',
    });
  }
  const types = new Set<string>();
  value.forEach((item, index) => {
    const path = `weapons[${index}]`;
    if (!isRecord(item)) {
      issues.push({ path, message: 'must be an object' });
      return;
    }
    if (!isWeaponType(item.type)) {
      issues.push({ path: `${path}.type`, message: 'invalid weapon type' });
    } else if (types.has(item.type)) {
      issues.push({ path: `${path}.type`, message: 'duplicate weapon type' });
    } else {
      types.add(item.type);
    }
    if (!isNonEmptyString(item.displayName)) {
      issues.push({
        path: `${path}.displayName`,
        message: 'must be a non-empty string',
      });
    }
    if (!isDamage(item.damage)) {
      issues.push({
        path: `${path}.damage`,
        message: 'must be a positive integer',
      });
    }
    if (!isFireRate(item.fireRate)) {
      issues.push({
        path: `${path}.fireRate`,
        message: 'must be a positive finite number',
      });
    }
    if (!isPositiveFinite(item.projectileSpeedViewportHeightPerSecond)) {
      issues.push({
        path: `${path}.projectileSpeedViewportHeightPerSecond`,
        message: 'must be a positive finite number (v0.2 §10)',
      });
    }
  });
}

function validateEnemies(
  value: unknown,
  issues: ContentValidationIssue[],
): void {
  if (!isArray(value)) {
    issues.push({ path: 'enemies', message: 'must be an array' });
    return;
  }
  if (value.length === 0) {
    issues.push({
      path: 'enemies',
      message: 'must contain at least one enemy',
    });
  }
  const types = new Set<string>();
  value.forEach((item, index) => {
    const path = `enemies[${index}]`;
    if (!isRecord(item)) {
      issues.push({ path, message: 'must be an object' });
      return;
    }
    if (!isEnemyType(item.type)) {
      issues.push({ path: `${path}.type`, message: 'invalid enemy type' });
    } else if (types.has(item.type)) {
      issues.push({ path: `${path}.type`, message: 'duplicate enemy type' });
    } else {
      types.add(item.type);
    }
    if (!isNonEmptyString(item.displayName)) {
      issues.push({
        path: `${path}.displayName`,
        message: 'must be a non-empty string',
      });
    }
    if (!isHullIntegrity(item.maximumHullIntegrity)) {
      issues.push({
        path: `${path}.maximumHullIntegrity`,
        message: `must be an integer in ${HULL_INTEGRITY_MIN}..${HULL_INTEGRITY_MAX}`,
      });
    }
    if (!isPositiveFinite(item.movementSpeedViewportHeightPerSecond)) {
      issues.push({
        path: `${path}.movementSpeedViewportHeightPerSecond`,
        message: 'must be a positive finite number',
      });
    }
    if (!isPositiveFinite(item.committedAttackSpeedViewportHeightPerSecond)) {
      issues.push({
        path: `${path}.committedAttackSpeedViewportHeightPerSecond`,
        message: 'must be a positive finite number',
      });
    }
    if (!isPositiveInteger(item.contactDamage)) {
      issues.push({
        path: `${path}.contactDamage`,
        message: 'must be a positive integer',
      });
    }
    if (!isNonNegativeInteger(item.playerDestructionReward)) {
      issues.push({
        path: `${path}.playerDestructionReward`,
        message: 'must be a non-negative integer',
      });
    }
    if (!isNonNegativeInteger(item.escapePenalty)) {
      issues.push({
        path: `${path}.escapePenalty`,
        message: 'must be a non-negative integer',
      });
    }
    if (!isPositiveFinite(item.visualFootprintAreaRatio)) {
      issues.push({
        path: `${path}.visualFootprintAreaRatio`,
        message: 'must be a positive finite number',
      });
    }
    if (!isPositiveFinite(item.visualAspectRatio)) {
      issues.push({
        path: `${path}.visualAspectRatio`,
        message: 'must be a positive finite number',
      });
    }
  });
}

/** Canonical v0.2 three-mission registry in authored order (Epic §8.1–8.3,
 *  V02-AC-001). The production registry validator rejects any incomplete,
 *  reordered, duplicated, or otherwise non-canonical mission set. */
const CANONICAL_MISSION_IDS: readonly MissionId[] = [
  'interception-01',
  'interception-02',
  'interception-03',
];

/** Authored display names used only in validator messages. */
const CANONICAL_MISSION_NAMES: Readonly<Record<MissionId, string>> = {
  'interception-01': 'Interception 01',
  'interception-02': 'Interception 02',
  'interception-03': 'Interception 03',
};

/** The Product Owner decision that owned each mission's exact runtime staging
 *  (V02-DEC-021 Mission 01, V02-DEC-026 Mission 02, V021-DEC-003 Mission 03 —
 *  which superseded V02-DEC-032's Mission 03 regular schedule while preserving
 *  its Elite-only `05:20` arrival). */
const CANONICAL_STAGING_DECISIONS: Readonly<Record<MissionId, string>> = {
  'interception-01': 'V02-DEC-021',
  'interception-02': 'V02-DEC-026',
  'interception-03': 'V021-DEC-003',
};

function validateMissions(
  value: unknown,
  issues: ContentValidationIssue[],
): void {
  if (!isArray(value)) {
    issues.push({ path: 'missions', message: 'must be an array' });
    return;
  }
  if (value.length !== CANONICAL_MISSION_IDS.length) {
    issues.push({
      path: 'missions',
      message: `must contain exactly the ${CANONICAL_MISSION_IDS.length} authored Interception Missions`,
    });
  }
  const seen = new Set<string>();
  value.forEach((item, index) => {
    const path = `missions[${index}]`;
    if (!isRecord(item)) {
      issues.push({ path, message: 'must be an object' });
      return;
    }
    const expectedId = CANONICAL_MISSION_IDS[index];
    if (!isMissionId(item.id)) {
      issues.push({ path: `${path}.id`, message: 'invalid mission id' });
    } else {
      if (seen.has(item.id)) {
        issues.push({ path: `${path}.id`, message: 'duplicate mission id' });
      } else {
        seen.add(item.id);
      }
      if (expectedId !== undefined && item.id !== expectedId) {
        issues.push({
          path: `${path}.id`,
          message: `must be the canonical mission ${expectedId} at registry position ${index}`,
        });
      }
    }
    if (!isNonEmptyString(item.displayName)) {
      issues.push({
        path: `${path}.displayName`,
        message: 'must be a non-empty string',
      });
    }
    if (!isNonEmptyString(item.description)) {
      issues.push({
        path: `${path}.description`,
        message: 'must be a non-empty string',
      });
    }
    if (!isCredits(item.completionReward)) {
      issues.push({
        path: `${path}.completionReward`,
        message: 'must be a non-negative integer',
      });
    }
    validateUnlockTarget(
      item.unlocksMissionId,
      `${path}.unlocksMissionId`,
      issues,
    );
    validateEncounters(
      item.encounters,
      `${path}.encounters`,
      isMissionId(item.id) ? item.id : undefined,
      issues,
    );
    validateMissionTotals(item, `${path}`, issues);
    validateMissionRewards(item, `${path}`, issues);
  });
  // Cross-reference: every authored unlock target must exist in the same
  // registry and must not unlock itself (Epic §6.2), and the unlock mapping
  // must be the exact canonical ordered mapping (V02-WI-03 correction C02):
  // 01 → 02, 02 → 03, 03 → null. An alternate traversal such as
  // 01 → 03 → 02 → null is rejected even though it visits all three once.
  const missionIds: string[] = [];
  value.forEach((item, index) => {
    if (!isRecord(item)) {
      return;
    }
    const unlock = item.unlocksMissionId;
    if (typeof unlock !== 'string') {
      return;
    }
    const path = `missions[${index}].unlocksMissionId`;
    if (!isMissionId(unlock)) {
      return;
    }
    if (unlock === item.id) {
      issues.push({ path, message: 'a mission cannot unlock itself' });
    } else {
      missionIds.push(item.id as string);
      if (
        !value.some(
          (candidate) => isRecord(candidate) && candidate.id === unlock,
        )
      ) {
        issues.push({
          path,
          message: 'unlock target is not present in the mission registry',
        });
      }
    }
  });
  validateCanonicalUnlockMapping(value, issues);
  validateMissionStagingScope(value, issues);
  // The v0.2.1 §2.1/§2.2/§2.3 authored formation blocks own Mission 01's,
  // Mission 02's and Mission 03's staging; their density invariants are
  // validated on each mission item directly because the canonical content is
  // their own source of truth (V021-AC-001).
  value.forEach((item, index) => {
    if (!isRecord(item)) {
      return;
    }
    if (item.id === 'interception-01') {
      validatePatchMission01Density(item, `missions[${index}]`, issues);
    }
    if (item.id === 'interception-02') {
      validatePatchMission02Density(item, `missions[${index}]`, issues);
    }
    if (item.id === 'interception-03') {
      validatePatchMission03Density(item, `missions[${index}]`, issues);
    }
  });
}

/** The exact canonical ordered unlock mapping (Epic §6.2, V02-AC-002). */
const CANONICAL_UNLOCK_MAPPING: readonly {
  readonly missionId: MissionId;
  readonly unlocksMissionId: MissionId | null;
}[] = [
  { missionId: 'interception-01', unlocksMissionId: 'interception-02' },
  { missionId: 'interception-02', unlocksMissionId: 'interception-03' },
  { missionId: 'interception-03', unlocksMissionId: null },
];

/** Enforces the exact ordered unlock mapping; an alternate traversal (e.g.
 *  01 → 03 → 02 → null) is rejected even when it visits all three missions
 *  once. */
function validateCanonicalUnlockMapping(
  value: unknown[],
  issues: ContentValidationIssue[],
): void {
  value.forEach((item, index) => {
    if (!isRecord(item) || !isMissionId(item.id)) {
      return;
    }
    const expected = CANONICAL_UNLOCK_MAPPING[index];
    if (expected === undefined || expected.missionId !== item.id) {
      return; // registry shape/order issues are reported separately
    }
    if (item.unlocksMissionId !== expected.unlocksMissionId) {
      issues.push({
        path: `missions[${index}].unlocksMissionId`,
        message: `must be exactly ${expected.unlocksMissionId ?? 'null'} (canonical ordered mapping ${CANONICAL_UNLOCK_MAPPING.map(
          (m) => `${m.missionId} → ${m.unlocksMissionId ?? 'null'}`,
        ).join(', ')})`,
      });
    }
  });
}

function validateUnlockTarget(
  value: unknown,
  path: string,
  issues: ContentValidationIssue[],
): void {
  if (value === null) {
    return;
  }
  if (!isMissionId(value)) {
    issues.push({ path, message: 'must be a mission id or null' });
  }
}

function validateEncounters(
  value: unknown,
  path: string,
  missionId: string | undefined,
  issues: ContentValidationIssue[],
): void {
  if (!isArray(value)) {
    issues.push({ path, message: 'must be an array of encounters' });
    return;
  }
  if (value.length === 0) {
    issues.push({ path, message: 'must contain at least one encounter' });
    return;
  }
  const encounterIds = new Set<string>();
  let previousTimeSeconds: number | null = null;
  value.forEach((item, index) => {
    const encounterPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      issues.push({ path: encounterPath, message: 'must be an object' });
      return;
    }
    if (!isNonEmptyString(item.id)) {
      issues.push({
        path: `${encounterPath}.id`,
        message: 'must be a non-empty string',
      });
    } else if (encounterIds.has(item.id)) {
      issues.push({
        path: `${encounterPath}.id`,
        message: 'duplicate encounter id',
      });
    } else {
      encounterIds.add(item.id);
      // Encounter identity must belong to its mission and authored ordinal.
      const expectedId = `${missionId}-e${index + 1}`;
      if (missionId !== undefined && item.id !== expectedId) {
        issues.push({
          path: `${encounterPath}.id`,
          message: `must equal the authored ordinal identity ${expectedId}`,
        });
      }
    }
    if (typeof item.timeSeconds !== 'number' || !isSeconds(item.timeSeconds)) {
      issues.push({
        path: `${encounterPath}.timeSeconds`,
        message: 'must be a non-negative finite number',
      });
    } else if (
      previousTimeSeconds !== null &&
      item.timeSeconds <= previousTimeSeconds
    ) {
      issues.push({
        path: `${encounterPath}.timeSeconds`,
        message: 'encounters must be strictly ordered by Mission Clock time',
      });
    } else {
      previousTimeSeconds = item.timeSeconds;
    }
    validateComposition(
      item.composition,
      `${encounterPath}.composition`,
      issues,
    );
    validateEntry(item.entry, `${encounterPath}.entry`, issues);
    validateFormation(item.formation, `${encounterPath}.formation`, issues);
    validateRoleDelays(
      item.roleDelays,
      item.composition,
      `${encounterPath}.roleDelays`,
      issues,
    );
    validateStaging(
      item.staging,
      item.entry,
      item.composition,
      `${encounterPath}.staging`,
      issues,
    );
    // V02-WI-04 C03 / V02-WI-05 / V021-WI-02: the production validator
    // enforces the EXACT canonical staging projection for every fully staged
    // mission (V02-DEC-021 Mission 01, V02-DEC-026 Mission 02, V021-DEC-003
    // Mission 03) — Arrival Group count/order, offset, member
    // count/order/role, placement kind, Top fraction, and Side Y
    // fraction must match the single canonical content owner. Generic
    // range/totals validation alone is insufficient: any path-qualified drift
    // is rejected even when totals, offsets, and unit intervals stay valid.
    const canonicalMission =
      missionId === 'interception-01'
        ? INTERCEPTION_01
        : missionId === 'interception-02'
          ? INTERCEPTION_02
          : missionId === 'interception-03'
            ? INTERCEPTION_03
            : null;
    if (canonicalMission !== null) {
      validateCanonicalMissionStaging(
        canonicalMission,
        item.staging,
        index,
        `${encounterPath}.staging`,
        issues,
      );
    }
  });
}

/**
 * Validates exact authored runtime staging (Epic §8.1.1–8.3.1,
 * V02-DEC-021/026/032). Staging is present for all three authored missions
 * (enforced by `validateMissionStagingScope`): every Arrival Group carries a
 * non-negative offset and ordered typed members, Top fractions and Side Y
 * fractions stay in `[0, 1]`, `seeded-side` members require a `seeded`
 * encounter entry (the resolved side is the single encounter-level
 * mission-data draw), and the member totals must equal the encounter
 * composition totals so the authored staging never contradicts the authored
 * composition.
 */
function validateStaging(
  value: unknown,
  entry: unknown,
  composition: unknown,
  path: string,
  issues: ContentValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }
  if (!isArray(value)) {
    issues.push({
      path,
      message: 'when present must be an array of Arrival Groups',
    });
    return;
  }
  if (value.length === 0) {
    issues.push({ path, message: 'must contain at least one Arrival Group' });
    return;
  }
  const compositionTotals = totalsFromComposition(composition);
  const stagingTotals = { basic: 0, ranged: 0, hunter: 0, elite: 0 };
  let seededSideMembers = 0;
  value.forEach((group, groupIndex) => {
    const groupPath = `${path}[${groupIndex}]`;
    if (!isRecord(group)) {
      issues.push({ path: groupPath, message: 'must be an object' });
      return;
    }
    if (!isNonNegativeNumber(group.offsetSeconds)) {
      issues.push({
        path: `${groupPath}.offsetSeconds`,
        message: 'must be a non-negative finite number of seconds',
      });
    }
    if (!isArray(group.members)) {
      issues.push({
        path: `${groupPath}.members`,
        message: 'must be an array of ordered members',
      });
      return;
    }
    if (group.members.length === 0) {
      issues.push({
        path: `${groupPath}.members`,
        message: 'must contain at least one ordered member',
      });
    }
    group.members.forEach((member, memberIndex) => {
      const memberPath = `${groupPath}.members[${memberIndex}]`;
      if (!isRecord(member)) {
        issues.push({ path: memberPath, message: 'must be an object' });
        return;
      }
      if (!isEnemyType(member.type)) {
        issues.push({
          path: `${memberPath}.type`,
          message: 'invalid enemy type',
        });
      } else {
        const key = roleKeyForType(member.type);
        if (key !== null) {
          const current = stagingTotals[key];
          if (current !== undefined) {
            stagingTotals[key] = current + 1;
          }
        }
      }
      validateSpawnPlacement(
        member.placement,
        entry,
        `${memberPath}.placement`,
        issues,
      );
      if (
        isRecord(member.placement) &&
        member.placement.kind === 'seeded-side'
      ) {
        seededSideMembers += 1;
      }
    });
  });
  if (isRecord(entry) && entry.kind === 'seeded' && seededSideMembers === 0) {
    // v0.2.1 patch §2.1/§2.2/§2.3 (V021-AC-001): a `seeded` encounter entry
    // resolves exactly one `mission-data` side draw for the encounter's
    // `seeded-side` members. An entry with no such member would resolve a draw
    // nothing consumes, so the phantom draw is rejected rather than silently
    // retained.
    issues.push({
      path,
      message:
        'a seeded encounter entry must own at least one seeded-side member (a phantom mission-data draw is rejected)',
    });
  }
  if (compositionTotals !== null) {
    const matches =
      stagingTotals.basic === compositionTotals.basic &&
      stagingTotals.ranged === compositionTotals.ranged &&
      stagingTotals.hunter === compositionTotals.hunter &&
      stagingTotals.elite === compositionTotals.elite;
    if (!matches) {
      issues.push({
        path,
        message:
          'staging member totals must equal the encounter composition totals',
      });
    }
  }
}

/**
 * V02-WI-04 C03 / V02-WI-05 / V021-WI-02 exact-canonical staging projection
 * (Epic §8.1.1–8.3.1, V02-DEC-021 Mission 01, V02-DEC-026 Mission 02,
 * V021-DEC-003 Mission 03): the input staging is
 * compared path-by-path against the single canonical content owner for the
 * mission (`INTERCEPTION_01` / `INTERCEPTION_02` / `INTERCEPTION_03`). This
 * validator rejects drift in Arrival Group count and order, offsets, member
 * count/order/role, placement kind, Top fractions, and seeded-side Y fractions
 * even when every generic range/totals/unit-interval rule stays satisfied. It
 * is safe for hostile unknown input: no nested value is read before its
 * structure is verified, so validation never throws on malformed staging.
 * Encounter count/order is enforced by the exact-content contract separately;
 * this function only guards the staging fields of the encounters that exist.
 */
function validateCanonicalMissionStaging(
  canonicalMission: MissionDefinition,
  value: unknown,
  encounterIndex: number,
  path: string,
  issues: ContentValidationIssue[],
): void {
  if (value === undefined || !isArray(value)) {
    return; // missing/malformed staging is reported by validateStaging/scope
  }
  const canonicalEncounter = canonicalMission.encounters[encounterIndex];
  if (canonicalEncounter === undefined) {
    return;
  }
  const expected = canonicalEncounter.staging;
  if (expected === undefined) {
    return;
  }
  const canonicalDecision =
    canonicalMission.id === 'interception-02'
      ? 'V02-DEC-026'
      : canonicalMission.id === 'interception-03'
        ? 'V021-DEC-003'
        : 'V02-DEC-021';
  if (value.length !== expected.length) {
    issues.push({
      path,
      message: `must contain exactly ${expected.length} Arrival Groups in canonical order (${canonicalDecision})`,
    });
  }
  const groupCount = Math.min(value.length, expected.length);
  for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
    const groupPath = `${path}[${groupIndex}]`;
    const group = value[groupIndex];
    // Index-bounded by the canonical staging length (groupIndex < groupCount).
    const expectedGroup = expected[groupIndex]!;
    if (!isRecord(group)) {
      continue; // structural issue already reported by validateStaging
    }
    // Group order is enforced positionally: a swapped group fails on its
    // offset/members against the expected group at this index.
    if (group.offsetSeconds !== expectedGroup.offsetSeconds) {
      issues.push({
        path: `${groupPath}.offsetSeconds`,
        message: `must be exactly ${expectedGroup.offsetSeconds} s (canonical ${canonicalMission.id} Arrival Group)`,
      });
    }
    if (!isArray(group.members)) {
      continue; // structural issue already reported by validateStaging
    }
    if (group.members.length !== expectedGroup.members.length) {
      issues.push({
        path: `${groupPath}.members`,
        message: `must contain exactly ${expectedGroup.members.length} ordered members (canonical ${canonicalMission.id} Arrival Group)`,
      });
    }
    const memberCount = Math.min(
      group.members.length,
      expectedGroup.members.length,
    );
    for (let memberIndex = 0; memberIndex < memberCount; memberIndex += 1) {
      const memberPath = `${groupPath}.members[${memberIndex}]`;
      const member = group.members[memberIndex];
      // Index-bounded by the canonical group member length (memberIndex
      // < memberCount <= expectedGroup.members.length).
      const expectedMember = expectedGroup.members[memberIndex]!;
      if (!isRecord(member)) {
        continue;
      }
      // Member order is enforced positionally: a swapped or re-typed member
      // fails on its role at this index.
      if (member.type !== expectedMember.type) {
        issues.push({
          path: `${memberPath}.type`,
          message: `must be exactly ${expectedMember.type} at this canonical member position`,
        });
      }
      const placement = member.placement;
      if (!isRecord(placement)) {
        continue; // structural issue already reported by validateSpawnPlacement
      }
      const expectedPlacement = expectedMember.placement;
      if (placement.kind !== expectedPlacement.kind) {
        issues.push({
          path: `${memberPath}.placement.kind`,
          message: `must be exactly "${expectedPlacement.kind}" (canonical ${canonicalMission.id} placement kind)`,
        });
      } else if (expectedPlacement.kind === 'top') {
        if (placement.fraction !== expectedPlacement.fraction) {
          issues.push({
            path: `${memberPath}.placement.fraction`,
            message: `must be exactly ${expectedPlacement.fraction} (canonical ${canonicalMission.id} Top fraction)`,
          });
        }
      } else if (
        expectedPlacement.kind === 'seeded-side' &&
        placement.yViewportFraction !== expectedPlacement.yViewportFraction
      ) {
        issues.push({
          path: `${memberPath}.placement.yViewportFraction`,
          message: `must be exactly ${expectedPlacement.yViewportFraction} (canonical ${canonicalMission.id} Side Y fraction)`,
        });
      } else if (expectedPlacement.kind === 'fixed-side') {
        // v0.2.1 patch §2.1 (V021-AC-001): the authored side is content, not a
        // stream draw, so a swapped or duplicated Hunter side is rejected.
        if (placement.side !== expectedPlacement.side) {
          issues.push({
            path: `${memberPath}.placement.side`,
            message: `must be exactly "${expectedPlacement.side}" (canonical ${canonicalMission.id} fixed side)`,
          });
        }
        if (
          placement.yViewportFraction !== expectedPlacement.yViewportFraction
        ) {
          issues.push({
            path: `${memberPath}.placement.yViewportFraction`,
            message: `must be exactly ${expectedPlacement.yViewportFraction} (canonical ${canonicalMission.id} Side Y fraction)`,
          });
        }
      }
    }
  }
}

function totalsFromComposition(
  composition: unknown,
): { basic: number; ranged: number; hunter: number; elite: number } | null {
  if (!isArray(composition)) {
    return null;
  }
  const totals = { basic: 0, ranged: 0, hunter: 0, elite: 0 };
  for (const roleEntry of composition) {
    if (
      !isRecord(roleEntry) ||
      !isEnemyType(roleEntry.type) ||
      !isNonNegativeInteger(roleEntry.count)
    ) {
      return null;
    }
    const key = roleKeyForType(roleEntry.type);
    if (key !== null) {
      const current = totals[key];
      if (current !== undefined) {
        totals[key] = current + (roleEntry.count as number);
      }
    }
  }
  return totals;
}

function validateSpawnPlacement(
  value: unknown,
  entry: unknown,
  path: string,
  issues: ContentValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({
      path,
      message: 'must be a top, seeded-side, or fixed-side placement object',
    });
    return;
  }
  if (value.kind === 'top') {
    if (!isUnitInterval(value.fraction)) {
      issues.push({
        path: `${path}.fraction`,
        message: 'must be a normalized fraction in [0, 1]',
      });
    }
    return;
  }
  if (value.kind === 'seeded-side') {
    if (!isUnitInterval(value.yViewportFraction)) {
      issues.push({
        path: `${path}.yViewportFraction`,
        message: 'must be a normalized viewport fraction in [0, 1]',
      });
    }
    if (
      !isRecord(entry) ||
      entry.kind !== 'seeded' ||
      !isArray(entry.variants)
    ) {
      issues.push({
        path,
        message: 'seeded-side placement requires a seeded encounter entry',
      });
    }
    return;
  }
  if (value.kind === 'fixed-side') {
    // v0.2.1 patch §2.1 (V021-AC-001): an authored explicit side that consumes
    // no `mission-data` draw, so it requires no seeded encounter entry.
    if (value.side !== 'upper-left' && value.side !== 'upper-right') {
      issues.push({
        path: `${path}.side`,
        message: 'must be "upper-left" or "upper-right"',
      });
    }
    if (!isUnitInterval(value.yViewportFraction)) {
      issues.push({
        path: `${path}.yViewportFraction`,
        message: 'must be a normalized viewport fraction in [0, 1]',
      });
    }
    return;
  }
  issues.push({
    path: `${path}.kind`,
    message: 'must be "top", "seeded-side", or "fixed-side"',
  });
}

/** Enforces the bounded staging scope (V02-WI-04 / V02-WI-05 /
 *  V021-WI-02): every authored Interception Mission is fully staged, and
 *  every encounter of a mission must carry its exact authored Arrival Groups
 *  from the canonical decision that recorded them (V02-DEC-021 Mission 01,
 *  V02-DEC-026 Mission 02, V021-DEC-003 Mission 03). */
function validateMissionStagingScope(
  value: unknown,
  issues: ContentValidationIssue[],
): void {
  if (!isArray(value)) {
    return;
  }
  value.forEach((item, index) => {
    if (!isRecord(item) || !isMissionId(item.id)) {
      return;
    }
    const expected = CANONICAL_MISSION_IDS[index];
    if (expected === undefined) {
      return;
    }
    // V02-WI-04 C01 / V02-WI-05 / V02-WI-06 E03: EVERY encounter of an authored
    // mission must carry its exact authored Arrival Groups — a missing or empty
    // staging on any one of them is rejected (a check that only required at
    // least one staged encounter would allow an encounter to silently fall
    // back to qualitative data).
    const allStaged =
      isArray(item.encounters) &&
      item.encounters.length > 0 &&
      item.encounters.every(
        (encounter) =>
          isRecord(encounter) &&
          isArray(encounter.staging) &&
          encounter.staging.length > 0,
      );
    const decision = CANONICAL_STAGING_DECISIONS[expected];
    if (decision !== undefined && !allStaged) {
      issues.push({
        path: `missions[${index}].encounters`,
        message: `every ${CANONICAL_MISSION_NAMES[expected]} encounter must carry its exact authored Arrival Groups (${decision})`,
      });
    }
  });
}

/**
 * One Interception mission's exact v0.2.1 combat patch authored-density
 * contract (`SHMUP_V0.2.1_COMBAT_PATCH_SPECIFICATION` §2.1/§2.2, V021-AC-001),
 * expressed in hundredths of a second so no floating-point tolerance is
 * needed. The numeric limits and literal Mission Clock labels are the only
 * mission-specific data; the projection walk, schedule summary, and reward
 * arithmetic below are shared so the two missions cannot silently drift apart.
 * A mission's invariants guard its canonical content owner itself, where an
 * exact-content projection against that same owner cannot fail.
 */
interface PatchMissionDensity {
  readonly section: string;
  readonly missionName: string;
  readonly formationCount: number;
  readonly firstFormationCentiseconds: number;
  readonly lastFormationCentiseconds: number;
  readonly maximumFormationGapCentiseconds: number;
  readonly maximumBlockRows: number;
  readonly minimumRowMembers: number;
  readonly finalMemberCentiseconds: number;
  readonly firstRangedCentiseconds: number;
  readonly firstHunterCentiseconds: number;
  readonly firstFormationLabel: string;
  readonly lastFormationLabel: string;
  readonly finalMemberLabel: string;
  readonly firstRangedLabel: string;
  readonly firstHunterLabel: string;
  readonly totals: Readonly<
    Record<'basic' | 'ranged' | 'hunter' | 'elite', number>
  >;
  readonly maximumCombatReward: number;
  readonly maximumSuccessPayout: number;
  readonly rewardBreakdown: string;
  readonly payoutBreakdown: string;
}

/** §2.1/§2.2/§2.3: consecutive rows inside one block start 39 fixed steps
 *  (0.65 s) after their predecessor. */
const PATCH_DENSITY_ROW_STEP_CENTISECONDS = 65;

/** §2.1 Mission 01: 26 starts (00:04 → 03:08.70, ≤8 s apart, ≤4 rows per
 *  block, ≥4 regulars per creation event), first Ranged 00:56.30, first Hunter
 *  01:40, 286/52/10 totals, 410 combat reward, 418 Success payout, final
 *  member 03:10. */
const PATCH_MISSION01_DENSITY: PatchMissionDensity = {
  section: '§2.1',
  missionName: 'Mission 01',
  formationCount: 26,
  firstFormationCentiseconds: 400,
  lastFormationCentiseconds: 18870,
  maximumFormationGapCentiseconds: 800,
  maximumBlockRows: 4,
  minimumRowMembers: 4,
  finalMemberCentiseconds: 19000,
  firstRangedCentiseconds: 5630,
  firstHunterCentiseconds: 10000,
  firstFormationLabel: '00:04',
  lastFormationLabel: '03:08.70',
  finalMemberLabel: '03:10',
  firstRangedLabel: '00:56.30',
  firstHunterLabel: '01:40',
  totals: { basic: 286, ranged: 52, hunter: 10, elite: 0 },
  maximumCombatReward: 410,
  maximumSuccessPayout: 418,
  rewardBreakdown: '286 Basic + 52 Ranged x 2 + 10 Hunter x 2',
  payoutBreakdown: '410 combat + 8 completion',
};

/** §2.2 Mission 02: 35 starts (00:10 → 04:18.70, ≤8 s apart, ≤4 rows per
 *  block, ≥4 regulars per creation event), first Ranged 00:51.30, first Hunter
 *  02:00, 352/100/28 totals, 608 combat reward, 620 Success payout, final
 *  member 04:20. */
const PATCH_MISSION02_DENSITY: PatchMissionDensity = {
  section: '§2.2',
  missionName: 'Mission 02',
  formationCount: 35,
  firstFormationCentiseconds: 1000,
  lastFormationCentiseconds: 25870,
  maximumFormationGapCentiseconds: 800,
  maximumBlockRows: 4,
  minimumRowMembers: 4,
  finalMemberCentiseconds: 26000,
  firstRangedCentiseconds: 5130,
  firstHunterCentiseconds: 12000,
  firstFormationLabel: '00:10',
  lastFormationLabel: '04:18.70',
  finalMemberLabel: '04:20',
  firstRangedLabel: '00:51.30',
  firstHunterLabel: '02:00',
  totals: { basic: 352, ranged: 100, hunter: 28, elite: 0 },
  maximumCombatReward: 608,
  maximumSuccessPayout: 620,
  rewardBreakdown: '352 Basic + 100 Ranged x 2 + 28 Hunter x 2',
  payoutBreakdown: '608 combat + 12 completion',
};

/** §2.1: both fixed-side Hunters of a `BRH14` block enter at Y = 0.20 VH. */
const PATCH_MISSION01_HUNTER_Y_VIEWPORT_FRACTION = 0.2;

/** §2.2 `H4`: two fixed-side Hunters per side, ordered by ascending Y. */
const PATCH_MISSION02_H4_HUNTER_Y_VIEWPORT_FRACTIONS: readonly number[] = [
  0.15, 0.25,
];

/** §2.2 `H6`: three fixed-side Hunters per side, ordered by ascending Y. */
const PATCH_MISSION02_H6_HUNTER_Y_VIEWPORT_FRACTIONS: readonly number[] = [
  0.1, 0.2, 0.3,
];

/** §2.3 Mission 03: 44 regular starts (00:10 → 05:18, ≤8 s apart, ≤3 rows per
 *  block, ≥4 regulars per creation row), first Ranged 00:11.30, first Hunter
 *  01:35, 376/128/48/1 totals, 736 combat reward (regulars plus the Elite's 8),
 *  752 Success payout, and the final member at 05:20 — the preserved Elite-only
 *  group. */
const PATCH_MISSION03_DENSITY: PatchMissionDensity = {
  section: '§2.3',
  missionName: 'Mission 03',
  formationCount: 44,
  firstFormationCentiseconds: 1000,
  lastFormationCentiseconds: 31800,
  maximumFormationGapCentiseconds: 800,
  maximumBlockRows: 3,
  minimumRowMembers: 4,
  finalMemberCentiseconds: 32000,
  firstRangedCentiseconds: 1130,
  firstHunterCentiseconds: 9500,
  firstFormationLabel: '00:10',
  lastFormationLabel: '05:18',
  finalMemberLabel: '05:20',
  firstRangedLabel: '00:11.30',
  firstHunterLabel: '01:35',
  totals: { basic: 376, ranged: 128, hunter: 48, elite: 1 },
  maximumCombatReward: 736,
  maximumSuccessPayout: 752,
  rewardBreakdown: '376 Basic + 128 Ranged x 2 + 48 Hunter x 2 + 8 Elite',
  payoutBreakdown: '736 combat + 16 completion',
};

/** §2.3 `H4`: two fixed-side Hunters per side, ordered by ascending Y. */
const PATCH_MISSION03_H4_HUNTER_Y_VIEWPORT_FRACTIONS: readonly number[] = [
  0.15, 0.25,
];

/** §2.3 `H6`: three fixed-side Hunters per side, ordered by ascending Y. */
const PATCH_MISSION03_H6_HUNTER_Y_VIEWPORT_FRACTIONS: readonly number[] = [
  0.1, 0.2, 0.3,
];

/** The §2.1/§2.2/§2.3 facts a mission's schedule summary needs once its authored
 *  projection walk has completed. */
interface PatchDensityFacts {
  readonly formationStarts: readonly number[];
  readonly firstRanged: number | null;
  readonly firstHunter: number | null;
  readonly finalMember: number;
}

/** One accepted authoritative issue per mission invariant, so an omitted or
 *  reordered block, a two-member creation event, a wrong side, a changed row
 *  interval, an over-long start gap, a wrong first role time, wrong
 *  totals/rewards, and a wrong final time each fail exactly once. Walks the
 *  fully expanded Arrival Groups, delegates every row to `validateRow`, and
 *  returns the derived schedule facts, or `null` when the authored structure is
 *  too malformed for the summary checks (that structure is reported by
 *  `validateEncounters`/`validateStaging`/`validateMissionStagingScope`). */
function collectPatchDensityFacts(
  encounters: unknown,
  density: PatchMissionDensity,
  path: string,
  validateRow: (
    members: readonly unknown[],
    groupPath: string,
    issues: ContentValidationIssue[],
  ) => void,
  issues: ContentValidationIssue[],
): PatchDensityFacts | null {
  if (!isArray(encounters) || encounters.length === 0) {
    return null; // structure/scope is reported by validateEncounters
  }
  const formationStarts: number[] = [];
  let firstRanged: number | null = null;
  let firstHunter: number | null = null;
  let finalMember = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < encounters.length; index += 1) {
    const encounter = encounters[index];
    const encountersPath = `${path}.encounters`;
    if (!isRecord(encounter)) {
      return null;
    }
    const staging = encounter.staging;
    if (!isArray(staging) || staging.length === 0) {
      return null; // missing staging is reported by validateMissionStagingScope
    }
    const timeSeconds = encounter.timeSeconds;
    if (typeof timeSeconds !== 'number' || !isNonNegativeNumber(timeSeconds)) {
      return null; // reported by validateEncounters
    }
    const encounterCentiseconds = Math.round(timeSeconds * 100);
    let rowIndexInBlock = -1;
    let previousRowCentiseconds = 0;
    for (let groupIndex = 0; groupIndex < staging.length; groupIndex += 1) {
      const group = staging[groupIndex];
      const groupPath = `${encountersPath}[${index}].staging[${groupIndex}]`;
      if (
        !isRecord(group) ||
        typeof group.offsetSeconds !== 'number' ||
        !isNonNegativeNumber(group.offsetSeconds)
      ) {
        return null; // reported by validateStaging
      }
      const members = group.members;
      if (!isArray(members) || members.length === 0) {
        return null; // reported by validateStaging
      }
      const offsetCentiseconds = Math.round(group.offsetSeconds * 100);
      const memberCentiseconds = encounterCentiseconds + offsetCentiseconds;
      if (countRegularMembers(members) === 0) {
        // An authored group with no regular-role member (Mission 03's Elite-only
        // `05:20` group, V02-DEC-032 preserved by V021-DEC-003) is not a §2.x
        // formation start and is not a §2.x creation row, but it still owns the
        // mission's final member time.
        if (memberCentiseconds > finalMember) {
          finalMember = memberCentiseconds;
        }
        continue;
      }
      // Row grouping: a row exactly one authored 0.65 s interval after its
      // predecessor continues that block, anything else starts a new block.
      if (
        rowIndexInBlock >= 0 &&
        offsetCentiseconds ===
          previousRowCentiseconds + PATCH_DENSITY_ROW_STEP_CENTISECONDS
      ) {
        rowIndexInBlock += 1;
        if (rowIndexInBlock >= density.maximumBlockRows) {
          issues.push({
            path: `${groupPath}.offsetSeconds`,
            message: `must stay within ${density.maximumBlockRows} rows of exactly 0.65 s inside one ${density.section} block (V021-AC-001)`,
          });
        }
      } else {
        rowIndexInBlock = 0;
        formationStarts.push(memberCentiseconds);
      }
      previousRowCentiseconds = offsetCentiseconds;
      if (memberCentiseconds > finalMember) {
        finalMember = memberCentiseconds;
      }
      if (firstRanged === null && rowHasRole(members, 'ranged')) {
        firstRanged = memberCentiseconds;
      }
      if (firstHunter === null && rowHasRole(members, 'hunter')) {
        firstHunter = memberCentiseconds;
      }
      validateRow(members, groupPath, issues);
    }
  }
  return { formationStarts, firstRanged, firstHunter, finalMember };
}

/** The shared §2.1/§2.2/§2.3 schedule summary: exactly `formationCount` starts, the
 *  authored first and last start, strictly ordered starts never more than
 *  `maximumFormationGapCentiseconds` apart, the authored first Ranged and first
 *  Hunter times, and the authored final member time. */
function validatePatchDensitySummary(
  facts: PatchDensityFacts,
  density: PatchMissionDensity,
  path: string,
  issues: ContentValidationIssue[],
): void {
  const { formationStarts } = facts;
  if (formationStarts.length !== density.formationCount) {
    issues.push({
      path: `${path}.encounters`,
      message: `must contain exactly ${density.formationCount} ${density.section} formation starts (V021-AC-001)`,
    });
  }
  if (formationStarts[0] !== density.firstFormationCentiseconds) {
    issues.push({
      path: `${path}.encounters`,
      message: `the first ${density.section} formation start must be ${density.firstFormationLabel} (V021-AC-001)`,
    });
  }
  if (
    formationStarts[formationStarts.length - 1] !==
    density.lastFormationCentiseconds
  ) {
    issues.push({
      path: `${path}.encounters`,
      message: `the last ${density.section} formation start must be ${density.lastFormationLabel} (V021-AC-001)`,
    });
  }
  for (let index = 1; index < formationStarts.length; index += 1) {
    const previous = formationStarts[index - 1];
    const current = formationStarts[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    const gap = current - previous;
    if (gap <= 0) {
      issues.push({
        path: `${path}.encounters`,
        message: `${density.section} formation starts must be strictly ordered in Mission Clock time (V021-AC-001)`,
      });
    } else if (gap > density.maximumFormationGapCentiseconds) {
      issues.push({
        path: `${path}.encounters`,
        message: `consecutive ${density.section} formation starts must not be more than ${density.maximumFormationGapCentiseconds / 100} seconds apart (V021-AC-001)`,
      });
    }
  }
  if (facts.finalMember !== density.finalMemberCentiseconds) {
    issues.push({
      path: `${path}.encounters`,
      message: `the final ${density.missionName} member must arrive at exactly ${density.finalMemberLabel} (V021-AC-001)`,
    });
  }
  if (facts.firstRanged !== density.firstRangedCentiseconds) {
    issues.push({
      path: `${path}.encounters`,
      message: `the first ${density.missionName} Ranged member must arrive at exactly ${density.firstRangedLabel} (V021-AC-001)`,
    });
  }
  if (facts.firstHunter !== density.firstHunterCentiseconds) {
    issues.push({
      path: `${path}.encounters`,
      message: `the first ${density.missionName} Hunter must arrive at exactly ${density.firstHunterLabel} (V021-AC-001)`,
    });
  }
}

/** The shared §2.1/§2.2/§2.3 totals and reward arithmetic (V021-AC-001): the
 *  exact authored role totals, `totals.basic` × 1 + `totals.ranged` × 2 +
 *  `totals.hunter` × 2 + 8 per authored Elite, and that reward plus the
 *  mission's fixed completion bonus. */
function validatePatchDensityRewards(
  item: Record<string, unknown>,
  path: string,
  density: PatchMissionDensity,
  issues: ContentValidationIssue[],
): void {
  const totals = item.totals;
  if (isRecord(totals)) {
    for (const role of ['basic', 'ranged', 'hunter', 'elite'] as const) {
      const expected = density.totals[role];
      if (totals[role] !== expected) {
        issues.push({
          path: `${path}.totals.${role}`,
          message: `must be exactly ${expected} for ${density.missionName} (V021-AC-001 ${density.section})`,
        });
      }
    }
  }
  if (item.maximumCombatReward !== density.maximumCombatReward) {
    issues.push({
      path: `${path}.maximumCombatReward`,
      message: `must be exactly ${density.maximumCombatReward} for ${density.missionName} (${density.rewardBreakdown}; V021-AC-001 ${density.section})`,
    });
  }
  if (item.maximumSuccessPayout !== density.maximumSuccessPayout) {
    issues.push({
      path: `${path}.maximumSuccessPayout`,
      message: `must be exactly ${density.maximumSuccessPayout} for ${density.missionName} (${density.payoutBreakdown}; V021-AC-001 ${density.section})`,
    });
  }
}

/** Interception 01 §2.1 authored density (V021-AC-001). */
function validatePatchMission01Density(
  item: Record<string, unknown>,
  path: string,
  issues: ContentValidationIssue[],
): void {
  const facts = collectPatchDensityFacts(
    item.encounters,
    PATCH_MISSION01_DENSITY,
    path,
    validatePatchMission01Row,
    issues,
  );
  if (facts === null) {
    return;
  }
  validatePatchDensitySummary(facts, PATCH_MISSION01_DENSITY, path, issues);
  validatePatchDensityRewards(item, path, PATCH_MISSION01_DENSITY, issues);
}

/** Interception 02 §2.2 authored density (V021-AC-001). */
function validatePatchMission02Density(
  item: Record<string, unknown>,
  path: string,
  issues: ContentValidationIssue[],
): void {
  const facts = collectPatchDensityFacts(
    item.encounters,
    PATCH_MISSION02_DENSITY,
    path,
    validatePatchMission02Row,
    issues,
  );
  if (facts === null) {
    return;
  }
  validatePatchDensitySummary(facts, PATCH_MISSION02_DENSITY, path, issues);
  validatePatchDensityRewards(item, path, PATCH_MISSION02_DENSITY, issues);
}

/** Interception 03 §2.3 authored density (V021-AC-001, V021-DEC-003). */
function validatePatchMission03Density(
  item: Record<string, unknown>,
  path: string,
  issues: ContentValidationIssue[],
): void {
  const facts = collectPatchDensityFacts(
    item.encounters,
    PATCH_MISSION03_DENSITY,
    path,
    validatePatchMission03Row,
    issues,
  );
  if (facts === null) {
    return;
  }
  validatePatchDensitySummary(facts, PATCH_MISSION03_DENSITY, path, issues);
  validatePatchDensityRewards(item, path, PATCH_MISSION03_DENSITY, issues);
}

function isUnitInterval(value: unknown): boolean {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

/** Whether an authored row contains at least one member of a regular role.
 *  Malformed member entries simply do not count. */
function rowHasRole(
  members: readonly unknown[],
  role: 'basic' | 'ranged' | 'hunter',
): boolean {
  return members.some(
    (member) =>
      isRecord(member) &&
      typeof member.type === 'string' &&
      roleKeyForType(member.type) === role,
  );
}

/** How many authored members of one creation row are regular enemies (Basic,
 *  Ranged, or Hunter). Malformed member entries simply do not count. */
function countRegularMembers(members: readonly unknown[]): number {
  let count = 0;
  for (const member of members) {
    if (!isRecord(member) || typeof member.type !== 'string') {
      continue;
    }
    const role = roleKeyForType(member.type);
    if (role === 'basic' || role === 'ranged' || role === 'hunter') {
      count += 1;
    }
  }
  return count;
}

/** Whether one side's authored Hunter Y fractions equal `expected` exactly when
 *  compared in ascending order. */
function matchesAuthoredHunterY(
  yViewportFractions: readonly unknown[],
  expected: readonly number[],
): boolean {
  const numeric = yViewportFractions.filter(
    (value): value is number => typeof value === 'number',
  );
  return (
    numeric.length === expected.length &&
    [...numeric]
      .sort((left, right) => left - right)
      .every((value, index) => value === expected[index])
  );
}

/** One §2.1 creation row (V021-AC-001): at least four regular enemies, and —
 *  wherever the row carries Hunters — exactly one fixed upper-left plus one
 *  fixed upper-right Hunter at Y = 0.20 viewport height. */
function validatePatchMission01Row(
  members: readonly unknown[],
  groupPath: string,
  issues: ContentValidationIssue[],
): void {
  if (
    countRegularMembers(members) < PATCH_MISSION01_DENSITY.minimumRowMembers
  ) {
    issues.push({
      path: `${groupPath}.members`,
      message: `must contain at least ${PATCH_MISSION01_DENSITY.minimumRowMembers} regular enemies (V021-AC-001 §2.1 creation row)`,
    });
  }
  const hunters: Record<string, unknown>[] = [];
  for (const member of members) {
    if (isRecord(member) && member.type === 'hunter-drone') {
      hunters.push(member);
    }
  }
  if (hunters.length === 0) {
    return;
  }
  const sides: unknown[] = [];
  let allFixedSide = true;
  let allAtAuthoredY = true;
  for (const hunter of hunters) {
    const placement = hunter.placement;
    if (!isRecord(placement) || placement.kind !== 'fixed-side') {
      allFixedSide = false;
      continue;
    }
    sides.push(placement.side);
    if (
      placement.yViewportFraction !== PATCH_MISSION01_HUNTER_Y_VIEWPORT_FRACTION
    ) {
      allAtAuthoredY = false;
    }
  }
  const leftCount = sides.filter((side) => side === 'upper-left').length;
  const rightCount = sides.filter((side) => side === 'upper-right').length;
  if (!allFixedSide || leftCount !== 1 || rightCount !== 1) {
    issues.push({
      path: `${groupPath}.members`,
      message:
        'a §2.1 Hunter row must carry exactly one fixed upper-left and one fixed upper-right Hunter (V021-AC-001)',
    });
  }
  if (!allAtAuthoredY) {
    issues.push({
      path: `${groupPath}.members`,
      message: `§2.1 fixed-side Hunters must enter at Y = ${PATCH_MISSION01_HUNTER_Y_VIEWPORT_FRACTION} viewport height (V021-AC-001)`,
    });
  }
}

/** One §2.2 creation row (V021-AC-001): at least four regular enemies, and —
 *  wherever the row carries Hunters — one symmetric fixed-side wave of either
 *  four (`H4`, two per side at Y = 0.15/0.25) or six (`H6`, three per side at
 *  Y = 0.10/0.20/0.30) Hunters. */
function validatePatchMission02Row(
  members: readonly unknown[],
  groupPath: string,
  issues: ContentValidationIssue[],
): void {
  validatePatchHunterRow(
    members,
    groupPath,
    issues,
    PATCH_MISSION02_DENSITY,
    PATCH_MISSION02_H4_HUNTER_Y_VIEWPORT_FRACTIONS,
    PATCH_MISSION02_H6_HUNTER_Y_VIEWPORT_FRACTIONS,
  );
}

/** One §2.3 creation row (V021-AC-001): at least four regular enemies, and —
 *  wherever the row carries Hunters — one symmetric fixed-side wave of either
 *  four (`H4`, two per side at Y = 0.15/0.25) or six (`H6`, three per side at
 *  Y = 0.10/0.20/0.30) Hunters, entering simultaneously and consuming no
 *  `mission-data` draw. */
function validatePatchMission03Row(
  members: readonly unknown[],
  groupPath: string,
  issues: ContentValidationIssue[],
): void {
  validatePatchHunterRow(
    members,
    groupPath,
    issues,
    PATCH_MISSION03_DENSITY,
    PATCH_MISSION03_H4_HUNTER_Y_VIEWPORT_FRACTIONS,
    PATCH_MISSION03_H6_HUNTER_Y_VIEWPORT_FRACTIONS,
  );
}

/** The shared §2.2/§2.3 creation-row rule: at least `minimumRowMembers` regular
 *  enemies, and every Hunter row must be one symmetric fixed-side wave of the
 *  authored `H4` or `H6` viewport heights. */
function validatePatchHunterRow(
  members: readonly unknown[],
  groupPath: string,
  issues: ContentValidationIssue[],
  density: PatchMissionDensity,
  h4Fractions: readonly number[],
  h6Fractions: readonly number[],
): void {
  if (countRegularMembers(members) < density.minimumRowMembers) {
    issues.push({
      path: `${groupPath}.members`,
      message: `must contain at least ${density.minimumRowMembers} regular enemies (V021-AC-001 ${density.section} creation row)`,
    });
  }
  const hunters: Record<string, unknown>[] = [];
  for (const member of members) {
    if (isRecord(member) && member.type === 'hunter-drone') {
      hunters.push(member);
    }
  }
  if (hunters.length === 0) {
    return;
  }
  const leftYs: unknown[] = [];
  const rightYs: unknown[] = [];
  let allFixedSide = true;
  for (const hunter of hunters) {
    const placement = hunter.placement;
    if (!isRecord(placement) || placement.kind !== 'fixed-side') {
      allFixedSide = false;
      continue;
    }
    if (placement.side === 'upper-left') {
      leftYs.push(placement.yViewportFraction);
    } else if (placement.side === 'upper-right') {
      rightYs.push(placement.yViewportFraction);
    } else {
      allFixedSide = false;
    }
  }
  const matchesH4 =
    matchesAuthoredHunterY(leftYs, h4Fractions) &&
    matchesAuthoredHunterY(rightYs, h4Fractions);
  const matchesH6 =
    matchesAuthoredHunterY(leftYs, h6Fractions) &&
    matchesAuthoredHunterY(rightYs, h6Fractions);
  if (!allFixedSide || (!matchesH4 && !matchesH6)) {
    issues.push({
      path: `${groupPath}.members`,
      message: `a ${density.section} Hunter row must carry one symmetric fixed-side wave of four (H4) or six (H6) Hunters at the authored viewport heights (V021-AC-001)`,
    });
  }
}

function isNonNegativeNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Maps an enemy type to its authored per-role totals key (Epic §8 Totals). */
function roleKeyForType(
  type: string,
): 'basic' | 'ranged' | 'hunter' | 'elite' | null {
  if (type === 'basic-drone') {
    return 'basic';
  }
  if (type === 'ranged-drone') {
    return 'ranged';
  }
  if (type === 'hunter-drone') {
    return 'hunter';
  }
  if (type === 'elite-drone') {
    return 'elite';
  }
  return null;
}

/**
 * The ONLY approved seeded entry-region pair, in this exact order (Epic §8
 * `authored upper-left or upper-right`). A reversed, mixed, extended, or
 * duplicated variant set is rejected so the seed-to-side mapping can never
 * drift (V02-WI-03 correction C02).
 */
const APPROVED_SEEDED_VARIANTS: readonly ['upper-left', 'upper-right'] = [
  'upper-left',
  'upper-right',
];

function validateEntry(
  value: unknown,
  path: string,
  issues: ContentValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({
      path,
      message: 'must be a fixed, seeded, or unspecified entry object',
    });
    return;
  }
  if (value.kind === 'fixed') {
    if (!isEncounterEntryRegion(value.region)) {
      issues.push({
        path: `${path}.region`,
        message: 'must be an approved entry region',
      });
    }
    return;
  }
  if (value.kind === 'seeded') {
    if (
      !isArray(value.variants) ||
      value.variants.length !== APPROVED_SEEDED_VARIANTS.length ||
      value.variants[0] !== APPROVED_SEEDED_VARIANTS[0] ||
      value.variants[1] !== APPROVED_SEEDED_VARIANTS[1]
    ) {
      issues.push({
        path: `${path}.variants`,
        message:
          'must be exactly the approved ordered pair upper-left, upper-right',
      });
    }
    return;
  }
  if (value.kind === 'unspecified') {
    // An Epic §8 row that names no entry region: no default region is invented.
    return;
  }
  issues.push({
    path: `${path}.kind`,
    message: 'must be "fixed", "seeded", or "unspecified"',
  });
}

function validateRoleDelays(
  value: unknown,
  composition: unknown,
  path: string,
  issues: ContentValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }
  if (!isArray(value)) {
    issues.push({
      path,
      message: 'when present must be an array of role delays',
    });
    return;
  }
  const compositionRoles = new Set<string>();
  if (isArray(composition)) {
    for (const roleEntry of composition) {
      if (isRecord(roleEntry) && typeof roleEntry.type === 'string') {
        compositionRoles.add(roleEntry.type);
      }
    }
  }
  const seenRoles = new Set<string>();
  value.forEach((item, index) => {
    const delayPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      issues.push({ path: delayPath, message: 'must be an object' });
      return;
    }
    if (!isEnemyType(item.type)) {
      issues.push({ path: `${delayPath}.type`, message: 'invalid enemy type' });
    } else {
      if (seenRoles.has(item.type)) {
        issues.push({
          path: `${delayPath}.type`,
          message: 'duplicate delayed role',
        });
      } else {
        seenRoles.add(item.type);
      }
      if (!compositionRoles.has(item.type)) {
        issues.push({
          path: `${delayPath}.type`,
          message: 'delayed role must be present in the encounter composition',
        });
      }
    }
    if (!isPositiveFinite(item.delaySeconds)) {
      issues.push({
        path: `${delayPath}.delaySeconds`,
        message: 'must be a positive finite number of seconds',
      });
    }
  });
}

function validateFormation(
  value: unknown,
  path: string,
  issues: ContentValidationIssue[],
): void {
  if (value === null) {
    return;
  }
  if (!isEncounterFormation(value)) {
    issues.push({
      path,
      message: 'must be an approved formation identifier or null',
    });
  }
}

function validateComposition(
  value: unknown,
  path: string,
  issues: ContentValidationIssue[],
): void {
  if (!isArray(value)) {
    issues.push({ path, message: 'must be an array of enemy-role counts' });
    return;
  }
  if (value.length === 0) {
    issues.push({ path, message: 'must contain at least one enemy role' });
    return;
  }
  const roleTypes = new Set<string>();
  value.forEach((item, index) => {
    const entryPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      issues.push({ path: entryPath, message: 'must be an object' });
      return;
    }
    if (!isEnemyType(item.type)) {
      issues.push({ path: `${entryPath}.type`, message: 'invalid enemy type' });
    } else if (roleTypes.has(item.type)) {
      issues.push({
        path: `${entryPath}.type`,
        message: 'duplicate enemy role in one composition',
      });
    } else {
      roleTypes.add(item.type);
    }
    if (!isPositiveInteger(item.count)) {
      issues.push({
        path: `${entryPath}.count`,
        message: 'must be a positive integer',
      });
    }
  });
}

function validatePilots(
  value: unknown,
  issues: ContentValidationIssue[],
): void {
  if (!isArray(value)) {
    issues.push({ path: 'pilots', message: 'must be an array' });
    return;
  }
  if (value.length === 0) {
    issues.push({ path: 'pilots', message: 'must contain at least one pilot' });
  }
  const ids = new Set<string>();
  const names = new Set<string>();
  value.forEach((item, index) => {
    const path = `pilots[${index}]`;
    if (!isRecord(item)) {
      issues.push({ path, message: 'must be an object' });
      return;
    }
    validateUniqueId(item.id, `${path}.id`, 'pilot id', ids, issues);
    if (!isNonEmptyString(item.name)) {
      issues.push({
        path: `${path}.name`,
        message: 'must be a non-empty string',
      });
    } else if (names.has(item.name)) {
      issues.push({ path: `${path}.name`, message: 'duplicate pilot name' });
    } else {
      names.add(item.name);
    }
  });
}

function validateProjectile(
  value: unknown,
  issues: ContentValidationIssue[],
): void {
  const path = 'projectile';
  if (!isRecord(value)) {
    issues.push({ path, message: 'must be an object' });
    return;
  }
  if (!isPositiveFinite(value.maximumLifetimeSeconds)) {
    issues.push({
      path: `${path}.maximumLifetimeSeconds`,
      message: 'must be a positive finite number',
    });
  }
  if (
    isRecord(value) &&
    'speedViewportHeightPerSecond' in value &&
    !isPositiveFinite(value.speedViewportHeightPerSecond)
  ) {
    issues.push({
      path: `${path}.speedViewportHeightPerSecond`,
      message:
        'must not exist: projectile speed is per-weapon content (v0.2 §10)',
    });
  }
}

function validateUniqueId(
  value: unknown,
  path: string,
  label: string,
  seen: Set<string>,
  issues: ContentValidationIssue[],
): void {
  if (!isNonEmptyString(value)) {
    issues.push({ path, message: 'must be a non-empty string' });
    return;
  }
  if (seen.has(value)) {
    issues.push({ path, message: `duplicate ${label}` });
    return;
  }
  seen.add(value);
}

function validateMissionTotals(
  item: Record<string, unknown>,
  path: string,
  issues: ContentValidationIssue[],
): void {
  const totals = item.totals;
  if (!isRecord(totals)) {
    issues.push({ path: `${path}.totals`, message: 'must be an object' });
    return;
  }
  for (const role of ['basic', 'ranged', 'hunter', 'elite'] as const) {
    if (!isNonNegativeInteger(totals[role])) {
      issues.push({
        path: `${path}.totals.${role}`,
        message: 'must be a non-negative integer',
      });
    }
  }
  const derived = derivedTotalsFromUnknown(item.encounters);
  if (derived === null) {
    return;
  }
  if (
    totals.basic !== derived.basic ||
    totals.ranged !== derived.ranged ||
    totals.hunter !== derived.hunter ||
    totals.elite !== derived.elite
  ) {
    issues.push({
      path: `${path}.totals`,
      message: 'authored totals must equal the derived composition totals',
    });
  }
}

function validateMissionRewards(
  item: Record<string, unknown>,
  path: string,
  issues: ContentValidationIssue[],
): void {
  if (!isCredits(item.maximumCombatReward)) {
    issues.push({
      path: `${path}.maximumCombatReward`,
      message: 'must be a non-negative integer',
    });
  }
  if (!isCredits(item.maximumSuccessPayout)) {
    issues.push({
      path: `${path}.maximumSuccessPayout`,
      message: 'must be a non-negative integer',
    });
  }
  if (
    isCredits(item.maximumCombatReward) &&
    isCredits(item.completionReward) &&
    isCredits(item.maximumSuccessPayout) &&
    item.maximumSuccessPayout !==
      (item.maximumCombatReward as number) + (item.completionReward as number)
  ) {
    issues.push({
      path: `${path}.maximumSuccessPayout`,
      message: 'must equal maximumCombatReward + completionReward',
    });
  }
}

/** Derives per-role totals from an untrusted encounters value; `null` when the
 *  structure cannot be safely summed (structural errors are reported by
 *  `validateEncounters`). */
function derivedTotalsFromUnknown(
  encounters: unknown,
): { basic: number; ranged: number; hunter: number; elite: number } | null {
  if (!isArray(encounters)) {
    return null;
  }
  const totals = { basic: 0, ranged: 0, hunter: 0, elite: 0 };
  for (const encounter of encounters) {
    if (!isRecord(encounter) || !isArray(encounter.composition)) {
      return null;
    }
    for (const roleEntry of encounter.composition) {
      if (
        !isRecord(roleEntry) ||
        typeof roleEntry.type !== 'string' ||
        typeof roleEntry.count !== 'number'
      ) {
        return null;
      }
      if (roleEntry.type === 'basic-drone') {
        totals.basic += roleEntry.count;
      } else if (roleEntry.type === 'ranged-drone') {
        totals.ranged += roleEntry.count;
      } else if (roleEntry.type === 'hunter-drone') {
        totals.hunter += roleEntry.count;
      } else if (roleEntry.type === 'elite-drone') {
        totals.elite += roleEntry.count;
      }
    }
  }
  return totals;
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
