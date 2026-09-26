import {
  isLegacyC03CampaignShape,
  migrateLegacyC03Campaign,
} from '@domain/index';
import type {
  CampaignSchemaContext,
  CampaignStateV1,
  PersistenceDiagnostic,
} from '@domain/index';

/**
 * Platform-only current row-format provenance (V02-WI-02 correction C07).
 *
 * `CampaignStateV1` alone cannot distinguish an untouched invalid legacy row
 * (for example a version-1 row that is MISSING the obsolete C03 counter) from
 * valid current progress: both are `schemaVersion: 1` campaign values without
 * the counter, so current Domain validation would accept the invalid legacy
 * row as playable progress. The IndexedDB `CampaignRow` ENVELOPE therefore
 * carries an exact current-format marker OUTSIDE `CampaignStateV1` that only
 * the validated version-1 → version-2 upgrade and current campaign writes
 * produce. A row is eligible for current campaign validation only when this
 * marker is present and exact; any other row is a non-overwriting Save Data
 * Error before Domain validation runs, and only confirmed replacement may
 * replace it. `unreadableRowDiagnostics` owns the path-qualified cause of that
 * rejection (V02-WI-07 D02-B).
 *
 * The marker is platform persistence infrastructure and never leaks through
 * application ports, Domain, UI, or Phaser. No metadata store is added and no
 * campaign product schema version or database version changes.
 */
export const CURRENT_ROW_FORMAT_VERSION = 2;

/** A stored campaign row in the exact current row format. */
export interface CurrentCampaignRow {
  readonly id: 'current';
  readonly rowFormatVersion: typeof CURRENT_ROW_FORMAT_VERSION;
  readonly value: CampaignStateV1;
}

/** True only when the stored row carries the exact current-format marker. */
export function isCurrentFormatRow(row: unknown): row is CurrentCampaignRow {
  return (
    typeof row === 'object' &&
    row !== null &&
    (row as { readonly rowFormatVersion?: unknown }).rowFormatVersion ===
      CURRENT_ROW_FORMAT_VERSION
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * True only when the stored row carrier owns a `rowFormatVersion` property at
 * all — including an explicit `undefined`, `null`, or an unknown number
 * (V02-WI-07 D02-B-C01 F1; V02-DEC-035).
 *
 * This is the single absence-of-marker provenance rule shared by BOTH platform
 * boundaries:
 *
 * - the version-1 → version-2 upgrade may promote a row only when this returns
 *   `false`, so an envelope that conflicts with genuine version-1 provenance can
 *   never be rewritten into playable progress or seed the allocator
 *   (V02-DEC-035);
 * - the unreadable-row diagnostic cites the original legacy migration cause only
 *   when this returns `false` (D02-B/C01).
 *
 * ANY present property is an explicit row-format claim by the stored envelope.
 * When that claim is not the exact current value the row cannot be attributed
 * to an untouched pre-migration record, because untrusted value data inside it
 * conflicts with its own envelope. Only the complete ABSENCE of the property
 * can carry the pre-migration provenance (the version-1 schema wrote none).
 */
export function hasRowFormatProperty(row: unknown): boolean {
  return (
    isRecord(row) &&
    Object.prototype.hasOwnProperty.call(row, 'rowFormatVersion')
  );
}

/** The truthful row-envelope rejection: the stored row is not current-format
 *  progress. Kept byte-identical so every existing Save Data Error cause stays
 *  stable. */
const ROW_FORMAT_REJECTION_DIAGNOSTICS: readonly PersistenceDiagnostic[] = [
  {
    path: 'rowFormatVersion',
    message: 'stored campaign row is not in the current format',
  },
];

/**
 * Path-qualified diagnostics for a stored row that cannot be read as current
 * campaign data (V02-WI-07 D02-B and correction C01; Epic §14.2, V02-DEC-034,
 * V02-AC-021).
 *
 * A row without the exact current-format marker is normally a Save Data Error
 * about the row envelope itself. The version-1 → version-2 upgrade however
 * leaves a REJECTED legacy C03 record untouched, so such a row still carries
 * its obsolete `nextMissionAttemptId` counter. When the envelope carries NO
 * `rowFormatVersion` property at all, that persisted shape establishes legacy
 * provenance, and the diagnostic reports the ORIGINAL field-specific migration
 * cause (for example `credits`, or the marker/counter ordering at
 * `missionInProgress`) instead of replacing it with the envelope path.
 *
 * Any EXPLICIT non-current marker — `1`, `3`, `null`, or a present `undefined`
 * — is an ambiguous row-format claim: the envelope itself states a format that
 * is not the current one, so a counter inside the untrusted value cannot
 * establish legacy provenance, and the truthful current-row rejection is
 * reported without inventing a migration cause. The same applies to an unmarked
 * row whose value misses the obsolete counter or is not the C03 shape, and to a
 * recognizable C03 value that would still migrate (there is no rejected
 * migration to cite).
 *
 * The caller passes the row it has ALREADY read inside its transaction, so this
 * never performs a second persistence read. Diagnostics are path/message pairs
 * only: the stored record and its values are never included.
 */
export function unreadableRowDiagnostics(
  row: unknown,
  ctx: CampaignSchemaContext,
): readonly PersistenceDiagnostic[] {
  const value = isRecord(row) ? row.value : undefined;
  if (!hasRowFormatProperty(row) && isLegacyC03CampaignShape(value)) {
    const migration = migrateLegacyC03Campaign(value, ctx);
    if (migration.kind === 'invalid') {
      return migration.diagnostics;
    }
  }
  return ROW_FORMAT_REJECTION_DIAGNOSTICS;
}
