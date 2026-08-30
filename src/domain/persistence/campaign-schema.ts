import { aircraftId, pilotId } from '../identifiers';
import {
  isCredits,
  isHullIntegrity,
  isMissionId,
  isWeaponType,
} from '../model';
import type { MissionId, WeaponType } from '../model';
import type { PersistenceDiagnostic } from './diagnostics';
import { CAMPAIGN_SCHEMA_VERSION } from './campaign-state';
import type {
  CampaignRunStatus,
  CampaignStateV1,
  MissionInProgressMarker,
} from './campaign-state';

/**
 * Strict untrusted-input validation for the persisted campaign record
 * (Epic §14.2, V02-AC-021). Stored data is never trusted: every field is
 * narrowed and validated, invariants are enforced, and every failure records a
 * path-qualified diagnostic. A validation or migration failure is a
 * non-overwriting Save Data Error — Boot must never silently create a New
 * Game or overwrite the unreadable record.
 */
export interface CampaignSchemaContext {
  readonly validAircraftIds: ReadonlySet<string>;
  readonly validPilotIds: ReadonlySet<string>;
}

export type CampaignParseResult =
  | { readonly kind: 'loaded'; readonly campaign: CampaignStateV1 }
  | {
      readonly kind: 'invalid';
      readonly diagnostics: readonly PersistenceDiagnostic[];
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(diagnostics: readonly PersistenceDiagnostic[]): {
  readonly kind: 'invalid';
  readonly diagnostics: readonly PersistenceDiagnostic[];
} {
  return { kind: 'invalid', diagnostics };
}

/**
 * Version dispatch / migration boundary. There is no legacy schema, so
 * version 1 validates in place and every unknown or unsupported version is an
 * unsupported-schema Save Data Error that preserves the stored data.
 */
export function migrateCampaignRecord(
  record: unknown,
  ctx: CampaignSchemaContext,
): CampaignParseResult {
  if (!isRecord(record)) {
    return invalid([{ path: '', message: 'campaign record is not an object' }]);
  }
  if (record.schemaVersion !== CAMPAIGN_SCHEMA_VERSION) {
    const version =
      typeof record.schemaVersion === 'number'
        ? String(record.schemaVersion)
        : 'unknown';
    return invalid([
      {
        path: 'schemaVersion',
        message: `unsupported campaign schema version ${version}; no migration is defined`,
      },
    ]);
  }
  return parseCampaignV1(record, ctx);
}

function parseCampaignV1(
  record: Record<string, unknown>,
  ctx: CampaignSchemaContext,
): CampaignParseResult {
  const diagnostics: PersistenceDiagnostic[] = [];

  if (record.nextMissionAttemptId !== undefined) {
    // The obsolete C03 counter must be removed by the version-1 → version-2
    // migration. A record that still carries it was not a valid, migratable
    // legacy campaign (the migration leaves invalid C03 records untouched), so
    // it remains a non-overwriting Save Data Error (V02-WI-02 C06).
    diagnostics.push({
      path: 'nextMissionAttemptId',
      message:
        'obsolete legacy counter must be removed by the campaign migration',
    });
  }

  if (record.runStatus !== 'active' && record.runStatus !== 'game-over') {
    diagnostics.push({
      path: 'runStatus',
      message: 'runStatus must be "active" or "game-over"',
    });
  }
  const runStatus = record.runStatus as CampaignRunStatus;

  if (!isCredits(record.credits)) {
    diagnostics.push({
      path: 'credits',
      message: 'credits must be a non-negative integer',
    });
  }
  const credits = record.credits as number;

  if (typeof record.aircraftId !== 'string') {
    diagnostics.push({
      path: 'aircraftId',
      message: 'aircraftId must be a string',
    });
  } else if (!ctx.validAircraftIds.has(record.aircraftId)) {
    diagnostics.push({
      path: 'aircraftId',
      message: 'aircraftId is not an approved aircraft',
    });
  }
  const aircraftIdValue = record.aircraftId as string;

  if (!isHullIntegrity(record.hullIntegrity)) {
    diagnostics.push({
      path: 'hullIntegrity',
      message: 'hullIntegrity must be an integer in 0..100',
    });
  }
  const hullIntegrity = record.hullIntegrity as number;

  if (!isWeaponType(record.equippedWeapon)) {
    diagnostics.push({
      path: 'equippedWeapon',
      message: 'equippedWeapon is not an approved weapon type',
    });
  }
  const equippedWeapon = record.equippedWeapon as WeaponType;

  const unlockedMissionIds = parseMissionIdArray(
    record.unlockedMissionIds,
    'unlockedMissionIds',
    diagnostics,
  );
  const completedMissionIds = parseMissionIdArray(
    record.completedMissionIds,
    'completedMissionIds',
    diagnostics,
  );

  const missionInProgress = parseOptionalMissionMarker(
    record.missionInProgress,
    'missionInProgress',
    diagnostics,
  );

  if (
    typeof record.pilotId !== 'string' ||
    !ctx.validPilotIds.has(record.pilotId)
  ) {
    diagnostics.push({
      path: 'pilotId',
      message: 'pilotId is not an approved Pilot',
    });
  }
  const pilotIdValue = record.pilotId as string;

  // Cross-field invariants.
  if (diagnostics.length === 0) {
    for (const completed of completedMissionIds) {
      if (!unlockedMissionIds.includes(completed)) {
        diagnostics.push({
          path: 'completedMissionIds',
          message: 'a completed mission is not present in unlockedMissionIds',
        });
        break;
      }
    }
    if (
      missionInProgress !== null &&
      !unlockedMissionIds.includes(missionInProgress.missionId)
    ) {
      diagnostics.push({
        path: 'missionInProgress',
        message: 'a mission in progress is not present in unlockedMissionIds',
      });
    }
    if (runStatus === 'game-over' && missionInProgress !== null) {
      diagnostics.push({
        path: 'missionInProgress',
        message: 'runStatus "game-over" cannot contain a mission in progress',
      });
    }
  }

  if (diagnostics.length > 0) {
    return invalid(diagnostics);
  }

  const campaign: CampaignStateV1 = {
    schemaVersion: CAMPAIGN_SCHEMA_VERSION,
    runStatus,
    credits,
    aircraftId: aircraftId(aircraftIdValue),
    hullIntegrity,
    equippedWeapon,
    unlockedMissionIds,
    completedMissionIds,
    missionInProgress,
    pilotId: pilotId(pilotIdValue),
  };
  return { kind: 'loaded', campaign };
}

/**
 * Complete validation of the immediate pre-C04/C03 persisted campaign contract
 * (V02-WI-02 correction C06). Runs BEFORE any version-1 → version-2 campaign
 * rewrite or allocator seed: every C03 field and cross-field invariant is
 * validated with the same approved aircraft/Pilot identity context as normal
 * persisted-campaign validation, including the C03-forbidden equality
 * `missionInProgress.attemptId >= nextMissionAttemptId` (a marker id is always
 * strictly below the next allocated counter value).
 *
 * A fully valid C03 record yields the counter-free C04 campaign plus the
 * legacy issued high-water mark (`max(nextMissionAttemptId − 1,
 * missionInProgress.attemptId)`) so the adapter can seed the allocator
 * strictly above every identity the record already issued. Any invalid C03
 * record yields path-qualified diagnostics and MUST cause no campaign rewrite
 * and no allocator seed; the raw record (still carrying the obsolete counter)
 * then fails the current validator and stays a non-overwriting Save Data
 * Error, preserving the invalid-save contract.
 */
export type LegacyC03MigrationResult =
  | {
      readonly kind: 'valid';
      readonly campaign: CampaignStateV1;
      readonly highWaterMark: number;
    }
  | {
      readonly kind: 'invalid';
      readonly diagnostics: readonly PersistenceDiagnostic[];
    };

export function migrateLegacyC03Campaign(
  record: unknown,
  ctx: CampaignSchemaContext,
): LegacyC03MigrationResult {
  if (!isRecord(record)) {
    return invalid([{ path: '', message: 'campaign record is not an object' }]);
  }
  if (record.schemaVersion !== CAMPAIGN_SCHEMA_VERSION) {
    const version =
      typeof record.schemaVersion === 'number'
        ? String(record.schemaVersion)
        : 'unknown';
    return invalid([
      {
        path: 'schemaVersion',
        message: `legacy C03 migration requires schema version ${CAMPAIGN_SCHEMA_VERSION}, got ${version}`,
      },
    ]);
  }
  const diagnostics: PersistenceDiagnostic[] = [];

  if (record.runStatus !== 'active' && record.runStatus !== 'game-over') {
    diagnostics.push({
      path: 'runStatus',
      message: 'runStatus must be "active" or "game-over"',
    });
  }
  const runStatus = record.runStatus as CampaignRunStatus;

  if (!isCredits(record.credits)) {
    diagnostics.push({
      path: 'credits',
      message: 'credits must be a non-negative integer',
    });
  }
  const credits = record.credits as number;

  if (typeof record.aircraftId !== 'string') {
    diagnostics.push({
      path: 'aircraftId',
      message: 'aircraftId must be a string',
    });
  } else if (!ctx.validAircraftIds.has(record.aircraftId)) {
    diagnostics.push({
      path: 'aircraftId',
      message: 'aircraftId is not an approved aircraft',
    });
  }
  const aircraftIdValue = record.aircraftId as string;

  if (!isHullIntegrity(record.hullIntegrity)) {
    diagnostics.push({
      path: 'hullIntegrity',
      message: 'hullIntegrity must be an integer in 0..100',
    });
  }
  const hullIntegrity = record.hullIntegrity as number;

  if (!isWeaponType(record.equippedWeapon)) {
    diagnostics.push({
      path: 'equippedWeapon',
      message: 'equippedWeapon is not an approved weapon type',
    });
  }
  const equippedWeapon = record.equippedWeapon as WeaponType;

  const unlockedMissionIds = parseMissionIdArray(
    record.unlockedMissionIds,
    'unlockedMissionIds',
    diagnostics,
  );
  const completedMissionIds = parseMissionIdArray(
    record.completedMissionIds,
    'completedMissionIds',
    diagnostics,
  );

  const missionInProgress = parseOptionalMissionMarker(
    record.missionInProgress,
    'missionInProgress',
    diagnostics,
  );

  const nextMissionAttemptId = parseLegacyNextAttemptId(
    record.nextMissionAttemptId,
    'nextMissionAttemptId',
    diagnostics,
  );

  if (
    typeof record.pilotId !== 'string' ||
    !ctx.validPilotIds.has(record.pilotId)
  ) {
    diagnostics.push({
      path: 'pilotId',
      message: 'pilotId is not an approved Pilot',
    });
  }
  const pilotIdValue = record.pilotId as string;
  // Cross-field invariants (identical to normal persisted-campaign rules plus
  // the C03 marker-counter ordering).
  if (diagnostics.length === 0) {
    for (const completed of completedMissionIds) {
      if (!unlockedMissionIds.includes(completed)) {
        diagnostics.push({
          path: 'completedMissionIds',
          message: 'a completed mission is not present in unlockedMissionIds',
        });
        break;
      }
    }
    if (
      missionInProgress !== null &&
      !unlockedMissionIds.includes(missionInProgress.missionId)
    ) {
      diagnostics.push({
        path: 'missionInProgress',
        message: 'a mission in progress is not present in unlockedMissionIds',
      });
    }
    if (runStatus === 'game-over' && missionInProgress !== null) {
      diagnostics.push({
        path: 'missionInProgress',
        message: 'runStatus "game-over" cannot contain a mission in progress',
      });
    }
    if (
      missionInProgress !== null &&
      missionInProgress.attemptId >= nextMissionAttemptId
    ) {
      // C03 invariant: a marker's attempt id is always strictly below the
      // next allocated counter value. The equality (or greater) relation is a
      // corrupted record and must remain invalid.
      diagnostics.push({
        path: 'missionInProgress',
        message:
          'the mission attempt id is not strictly below the next mission attempt id',
      });
    }
  }

  if (diagnostics.length > 0) {
    return { kind: 'invalid', diagnostics };
  }

  const campaign: CampaignStateV1 = {
    schemaVersion: CAMPAIGN_SCHEMA_VERSION,
    runStatus,
    credits,
    aircraftId: aircraftId(aircraftIdValue),
    hullIntegrity,
    equippedWeapon,
    unlockedMissionIds,
    completedMissionIds,
    missionInProgress,
    pilotId: pilotId(pilotIdValue),
  };
  const highWaterMark = Math.max(
    nextMissionAttemptId - 1,
    missionInProgress !== null ? missionInProgress.attemptId : -1,
  );
  return { kind: 'valid', campaign, highWaterMark };
}

/** The C03 counter is a safe non-negative integer (V02-WI-02 C06). */
function parseLegacyNextAttemptId(
  value: unknown,
  path: string,
  diagnostics: PersistenceDiagnostic[],
): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    diagnostics.push({
      path,
      message: 'must be a safe non-negative integer',
    });
    return 0;
  }
  return value;
}

function parseMissionIdArray(
  value: unknown,
  path: string,
  diagnostics: PersistenceDiagnostic[],
): MissionId[] {
  if (!Array.isArray(value)) {
    diagnostics.push({ path, message: 'must be an array of mission ids' });
    return [];
  }
  const ids: MissionId[] = [];
  value.forEach((entry, index) => {
    if (!isMissionId(entry)) {
      diagnostics.push({
        path: `${path}.${index}`,
        message: 'entry is not an approved mission id',
      });
    } else if (!ids.includes(entry)) {
      ids.push(entry);
    } else {
      diagnostics.push({
        path: `${path}.${index}`,
        message: 'duplicate mission id',
      });
    }
  });
  return ids;
}

/**
 * Parses the optional persisted `missionInProgress` marker (V02-WI-02
 * correction C04): `null` or an object `{ missionId, attemptId }` where
 * `missionId` is an approved mission id and `attemptId` is a safe
 * non-negative integer issued by the platform-owned non-resetting allocator
 * (never a session ordinal or a replaceable campaign counter). The per-attempt
 * identity is required so a stale failure, Success, Defeat, or Aborted
 * callback from an older application instance, attempt, or replaced run can
 * never affect a newer attempt of the same mission.
 */
function parseOptionalMissionMarker(
  value: unknown,
  path: string,
  diagnostics: PersistenceDiagnostic[],
): MissionInProgressMarker | null {
  if (value === null) {
    return null;
  }
  if (!isRecord(value)) {
    diagnostics.push({
      path,
      message: 'must be null or a mission-in-progress marker object',
    });
    return null;
  }
  if (!isMissionId(value.missionId)) {
    diagnostics.push({
      path: `${path}.missionId`,
      message: 'missionId must be an approved mission id',
    });
    return null;
  }
  if (
    typeof value.attemptId !== 'number' ||
    !Number.isSafeInteger(value.attemptId) ||
    value.attemptId < 0
  ) {
    diagnostics.push({
      path: `${path}.attemptId`,
      message: 'attemptId must be a safe non-negative integer',
    });
    return null;
  }
  return { missionId: value.missionId, attemptId: value.attemptId };
}
