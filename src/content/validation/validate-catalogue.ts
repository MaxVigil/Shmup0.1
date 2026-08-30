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
  });
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
  if (!isPositiveFinite(value.speedViewportHeightPerSecond)) {
    issues.push({
      path: `${path}.speedViewportHeightPerSecond`,
      message: 'must be a positive finite number',
    });
  }
  if (!isPositiveFinite(value.maximumLifetimeSeconds)) {
    issues.push({
      path: `${path}.maximumLifetimeSeconds`,
      message: 'must be a positive finite number',
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
