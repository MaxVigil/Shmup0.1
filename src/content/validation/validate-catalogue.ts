import type { ContentCatalogue } from '../catalogue';
import {
  HULL_INTEGRITY_MAX,
  HULL_INTEGRITY_MIN,
  isCredits,
  isDamage,
  isEnemyType,
  isFireRate,
  isHullIntegrity,
  isMissionType,
  isPositiveFinite,
  isSeconds,
  isWeaponType,
} from '@domain/model';

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

function validateMissions(
  value: unknown,
  issues: ContentValidationIssue[],
): void {
  if (!isArray(value)) {
    issues.push({ path: 'missions', message: 'must be an array' });
    return;
  }
  if (value.length === 0) {
    issues.push({
      path: 'missions',
      message: 'must contain at least one mission',
    });
  }
  const types = new Set<string>();
  value.forEach((item, index) => {
    const path = `missions[${index}]`;
    if (!isRecord(item)) {
      issues.push({ path, message: 'must be an object' });
      return;
    }
    if (!isMissionType(item.type)) {
      issues.push({ path: `${path}.type`, message: 'invalid mission type' });
    } else if (types.has(item.type)) {
      issues.push({ path: `${path}.type`, message: 'duplicate mission type' });
    } else {
      types.add(item.type);
    }
    if (!isNonEmptyString(item.displayName)) {
      issues.push({
        path: `${path}.displayName`,
        message: 'must be a non-empty string',
      });
    }
    if (!isCredits(item.reward)) {
      issues.push({
        path: `${path}.reward`,
        message: 'must be a non-negative integer',
      });
    }
    validateSchedule(item.schedule, `${path}.schedule`, issues);
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

function validateSchedule(
  input: unknown,
  path: string,
  issues: ContentValidationIssue[],
): void {
  if (!isRecord(input)) {
    issues.push({ path, message: 'must be an object' });
    return;
  }
  if (!isRecord(input.regular)) {
    issues.push({ path: `${path}.regular`, message: 'must be an object' });
  } else {
    if (!isSeconds(input.regular.startTimeSeconds)) {
      issues.push({
        path: `${path}.regular.startTimeSeconds`,
        message: 'must be a non-negative finite number',
      });
    }
    if (!isPositiveFinite(input.regular.intervalSeconds)) {
      issues.push({
        path: `${path}.regular.intervalSeconds`,
        message: 'must be a positive finite number',
      });
    }
    if (!isPositiveInteger(input.regular.groupCount)) {
      issues.push({
        path: `${path}.regular.groupCount`,
        message: 'must be a positive integer',
      });
    }
    if (!isPositiveInteger(input.regular.dronesPerGroup)) {
      issues.push({
        path: `${path}.regular.dronesPerGroup`,
        message: 'must be a positive integer',
      });
    }
  }
  if (!isRecord(input.final)) {
    issues.push({ path: `${path}.final`, message: 'must be an object' });
  } else {
    if (!isPositiveFinite(input.final.timeSeconds)) {
      issues.push({
        path: `${path}.final.timeSeconds`,
        message: 'must be a positive finite number',
      });
    }
    if (!isPositiveInteger(input.final.dronesPerGroup)) {
      issues.push({
        path: `${path}.final.dronesPerGroup`,
        message: 'must be a positive integer',
      });
    }
  }
  validateFinalAfterRegular(input, path, issues);
}

function validateFinalAfterRegular(
  input: unknown,
  path: string,
  issues: ContentValidationIssue[],
): void {
  if (!isRecord(input) || !isRecord(input.regular) || !isRecord(input.final)) {
    return;
  }
  const { startTimeSeconds, intervalSeconds, groupCount } = input.regular;
  const { timeSeconds } = input.final;
  if (
    typeof startTimeSeconds !== 'number' ||
    typeof intervalSeconds !== 'number' ||
    typeof groupCount !== 'number' ||
    typeof timeSeconds !== 'number'
  ) {
    return;
  }
  const lastRegularTime = startTimeSeconds + intervalSeconds * (groupCount - 1);
  if (timeSeconds <= lastRegularTime) {
    issues.push({
      path: `${path}.final.timeSeconds`,
      message: 'must be a finite number after the last regular group time',
    });
  }
}
