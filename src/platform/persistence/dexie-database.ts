import Dexie from 'dexie';
import type { Table } from 'dexie';
import {
  migrateLegacyC03Campaign,
  type CampaignSchemaContext,
  type CampaignStateV1,
  type MissionId,
  type UserSettingsV1,
} from '@domain/index';
import { CURRENT_ROW_FORMAT_VERSION } from './campaign-row-format';

/**
 * Versioned local persistence database (Epic §14.1, V02-DEC-004): Dexie as the
 * IndexedDB adapter, confined entirely to `src/platform/persistence/`. Domain,
 * UI, and Phaser never import Dexie or mutate stored records directly.
 *
 * Each campaign/settings store holds exactly one `id: 'current'` record so
 * every mutation is one atomic before/after state. Schema version 1 is the
 * first real persisted schema. Version 2 adds the append-only
 * `missionAttempts` allocator store (V02-WI-02 correction C04): its IndexedDB
 * autoincrement primary key is the globally unique, never-reissued mission
 * attempt id. The version-2 upgrade preserves every existing `campaign` and
 * `userSettings` row (the new store is added without touching them), and
 * confirmed New Game / Save Data Error replacement never deletes the
 * allocator.
 */
export const PERSISTENCE_DATABASE_NAME = 'shmup-v0.2';

/** Stored campaign row envelope (V02-WI-02 C07): the `rowFormatVersion`
 *  current-format provenance marker is platform persistence infrastructure
 *  OUTSIDE `CampaignStateV1` — only the validated version-1 → version-2
 *  upgrade and current campaign writes produce it, and reads reject rows
 *  without it as a non-overwriting Save Data Error. It never leaks through
 *  application ports, Domain, UI, or Phaser. */
export interface CampaignRow {
  readonly id: 'current';
  readonly rowFormatVersion: number;
  readonly value: CampaignStateV1;
}

export interface UserSettingsRow {
  readonly id: 'current';
  readonly value: UserSettingsV1;
}

/** Append-only mission-attempt allocator row (V02-WI-02 C04): one minimal row
 *  per accepted mission start; the autoincrement `id` is the attempt id and is
 *  never reused by the IndexedDB key generator. Infrastructure metadata, not
 *  campaign progress. */
export interface MissionAttemptRow {
  readonly missionId: MissionId;
}

/** Composition-root options for the persistence database (V02-WI-02 C06):
 *  the already validated content identity sets the version-1 → version-2
 *  upgrade needs to run the complete legacy C03 campaign validation. They are
 *  produced once at the composition root from the approved content catalogue
 *  and are never imported into Domain or duplicated in platform code. */
export interface PersistenceDatabaseOptions {
  readonly legacyCampaignSchemaContext: CampaignSchemaContext;
}

export class ShmupPersistenceDatabase extends Dexie {
  readonly campaign!: Table<CampaignRow, string>;
  readonly userSettings!: Table<UserSettingsRow, string>;
  readonly missionAttempts!: Table<MissionAttemptRow, number>;

  constructor(options: PersistenceDatabaseOptions) {
    super(PERSISTENCE_DATABASE_NAME);
    this.version(1).stores({
      campaign: 'id',
      userSettings: 'id',
    });
    // V02-WI-02 C05/C06/C07: the version-1 → version-2 upgrade adds the
    // non-resetting attempt allocator store, then runs the complete legacy C03
    // campaign validation at the Domain persistence owner BEFORE any campaign
    // rewrite or allocator seed. A fully valid C03 record is transformed
    // (obsolete `nextMissionAttemptId` removed, every other field preserved),
    // receives the exact current-format row-envelope marker, and the allocator
    // key generator is seeded strictly above every attempt id the legacy
    // record already issued, so the first version-2 mission can never reuse a
    // legacy identity. An invalid C03 record is left byte-for-structure
    // untouched with the allocator unseeded and NO current-format marker: the
    // existing non-overwriting Save Data Error path remains authoritative for
    // every invalid legacy row, including one that is missing its obsolete
    // counter (provenance is enforced at the row envelope, not only by the
    // current campaign validator).
    this.version(2)
      .stores({
        campaign: 'id',
        userSettings: 'id',
        missionAttempts: '++id',
      })
      .upgrade(async (transaction) => {
        const campaignTable = transaction.table<CampaignRow, string>(
          'campaign',
        );
        const row = await campaignTable.get('current');
        if (row === undefined) {
          // No legacy campaign: nothing to migrate (Settings may already exist).
          return;
        }
        const migration = migrateLegacyC03Campaign(
          row.value,
          options.legacyCampaignSchemaContext,
        );
        if (migration.kind === 'invalid') {
          // The legacy campaign fails a C03 field or cross-field invariant
          // (including the marker/counter ordering): no rewrite, no seed. The
          // raw record still carries `nextMissionAttemptId`, so the current
          // validator rejects it and it stays a Save Data Error.
          return;
        }
        // Remove the obsolete counter from the stored campaign; every other
        // valid field is preserved, and the row envelope receives the exact
        // current-format provenance marker (V02-WI-02 C07).
        await campaignTable.put({
          id: 'current',
          rowFormatVersion: CURRENT_ROW_FORMAT_VERSION,
          value: migration.campaign,
        });
        // Advance the IndexedDB key generator so the first allocator-issued
        // version-2 id is strictly greater than every legacy issued id. The
        // seed row is infrastructure metadata (never read as mission progress).
        if (migration.highWaterMark >= 1) {
          await transaction
            .table<MissionAttemptRow, number>('missionAttempts')
            .put({
              missionId: 'interception-01',
              id: migration.highWaterMark,
            } as MissionAttemptRow & {
              id: number;
            });
        }
      });
  }
}

/** Composition-root factory for the single persistence database instance. */
export function createPersistenceDatabase(
  options: PersistenceDatabaseOptions,
): ShmupPersistenceDatabase {
  return new ShmupPersistenceDatabase(options);
}
