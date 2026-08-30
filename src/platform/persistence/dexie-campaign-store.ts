import { beginMission, migrateCampaignRecord } from '@domain/index';
import type { CampaignSchemaContext, CampaignStateV1 } from '@domain/index';
import type {
  CampaignReadResult,
  CampaignStartOutcome,
  CampaignStorePort,
  CampaignUpdateOutcome,
} from '@application/persistence';
import type { CampaignTransitionResult, MissionId } from '@domain/index';
import type { ShmupPersistenceDatabase } from './dexie-database';
import {
  CURRENT_ROW_FORMAT_VERSION,
  isCurrentFormatRow,
} from './campaign-row-format';

export interface DexieCampaignStoreOptions {
  readonly validAircraftIds: ReadonlySet<string>;
  readonly validPilotIds: ReadonlySet<string>;
}

/** Row-envelope provenance failure (V02-WI-02 C07): the stored row does not
 *  carry the exact current-format marker, so it is not current progress and
 *  must never reach Domain validation or an allocator allocation. */
function rowFormatDiagnostics() {
  return [
    {
      path: 'rowFormatVersion',
      message: 'stored campaign row is not in the current format',
    },
  ];
}

/** Signals a rejected mission start so the allocator row is rolled back. */
class RejectedStartError extends Error {
  constructor(readonly reason: string) {
    super(`Mission start rejected: ${reason}`);
    this.name = 'RejectedStartError';
  }
}

/**
 * Dexie/IndexedDB implementation of the application-owned campaign transaction
 * boundary (Epic §13.2, §14.2, V02-AC-020). Every `update` runs the pure
 * domain transform inside one IndexedDB read-write transaction, so one logical
 * command produces one durable before/after state. Stored input is validated
 * before the transform runs; a corrupted record is reported and never
 * overwritten by an update.
 */
export function createDexieCampaignStore(
  db: ShmupPersistenceDatabase,
  options: DexieCampaignStoreOptions,
): CampaignStorePort {
  const schemaContext: CampaignSchemaContext = {
    validAircraftIds: options.validAircraftIds,
    validPilotIds: options.validPilotIds,
  };
  return {
    async read(): Promise<CampaignReadResult> {
      const row = await db.transaction('r', db.campaign, () =>
        db.campaign.get('current'),
      );
      if (row === undefined) {
        return { kind: 'none' };
      }
      if (!isCurrentFormatRow(row)) {
        return { kind: 'invalid', diagnostics: rowFormatDiagnostics() };
      }
      return migrateCampaignRecord(row.value, schemaContext);
    },

    async update(
      transform: (current: CampaignStateV1) => CampaignTransitionResult,
    ): Promise<CampaignUpdateOutcome> {
      return db.transaction('rw', db.campaign, async () => {
        const row = await db.campaign.get('current');
        if (row === undefined) {
          return { kind: 'missing' };
        }
        if (!isCurrentFormatRow(row)) {
          return { kind: 'invalid', diagnostics: rowFormatDiagnostics() };
        }
        const parsed = migrateCampaignRecord(row.value, schemaContext);
        if (parsed.kind === 'invalid') {
          return { kind: 'invalid', diagnostics: parsed.diagnostics };
        }
        const decision = transform(parsed.campaign);
        if (decision.kind === 'rejected') {
          return { kind: 'no-change', reason: decision.reason };
        }
        await db.campaign.put({
          id: 'current',
          rowFormatVersion: CURRENT_ROW_FORMAT_VERSION,
          value: decision.campaign,
        });
        return { kind: 'applied', next: decision.campaign };
      });
    },

    async startMission(missionId: MissionId): Promise<CampaignStartOutcome> {
      try {
        return await db.transaction(
          'rw',
          [db.campaign, db.missionAttempts],
          async () => {
            const row = await db.campaign.get('current');
            if (row === undefined) {
              return { kind: 'missing' };
            }
            if (!isCurrentFormatRow(row)) {
              // Reject BEFORE Domain validation and BEFORE any allocator
              // allocation: an unmarked row is not current progress and no
              // attempt identity may be consumed for it.
              return { kind: 'invalid', diagnostics: rowFormatDiagnostics() };
            }
            const parsed = migrateCampaignRecord(row.value, schemaContext);
            if (parsed.kind === 'invalid') {
              return { kind: 'invalid', diagnostics: parsed.diagnostics };
            }
            // Allocate the globally unique monotonic attempt id from the
            // append-only allocator store (the IndexedDB autoincrement key
            // generator never reuses a key). Allocation and the marker write
            // share this one transaction.
            const attemptId = await db.missionAttempts.add({ missionId });
            if (!Number.isSafeInteger(attemptId) || attemptId < 0) {
              // Fail safely before numeric overflow can reuse or corrupt an
              // identity: abort the transaction (the allocator row rolls back;
              // the key generator never goes backwards).
              throw new Error(
                'mission attempt id allocation exceeded the safe integer range',
              );
            }
            const decision = beginMission(
              parsed.campaign,
              missionId,
              attemptId,
            );
            if (decision.kind === 'rejected') {
              if (decision.reason === 'invalid-attempt-identity') {
                throw new Error(
                  'mission attempt id allocation exceeded the safe integer range',
                );
              }
              // Roll the allocator row back so a rejected start leaves no
              // row; the key generator may still advance (an unused id may be
              // consumed but is never reissued).
              throw new RejectedStartError(decision.reason);
            }
            await db.campaign.put({
              id: 'current',
              rowFormatVersion: CURRENT_ROW_FORMAT_VERSION,
              value: decision.campaign,
            });
            return {
              kind: 'applied',
              next: decision.campaign,
              attemptId,
            };
          },
        );
      } catch (error) {
        if (error instanceof RejectedStartError) {
          return { kind: 'no-change', reason: error.reason };
        }
        throw error;
      }
    },

    async replace(next: CampaignStateV1): Promise<void> {
      await db.transaction('rw', db.campaign, async () => {
        await db.campaign.put({
          id: 'current',
          rowFormatVersion: CURRENT_ROW_FORMAT_VERSION,
          value: next,
        });
      });
    },
  };
}
