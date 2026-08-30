import type { CampaignStateV1 } from '@domain/index';

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
 * replace it.
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
