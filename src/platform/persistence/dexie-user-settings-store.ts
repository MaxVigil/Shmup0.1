import { parseUserSettingsRecord } from '@domain/index';
import type { UserSettingsV1 } from '@domain/index';
import type {
  UserSettingsReadResult,
  UserSettingsStorePort,
} from '@application/persistence';
import type { ShmupPersistenceDatabase } from './dexie-database';

/**
 * Dexie/IndexedDB implementation of the separately persisted user Settings
 * boundary (Epic §14.1, V02-AC-017). The record is independent from the
 * campaign record, so a confirmed New Game replacement never resets
 * `Mouse Movement Enabled`.
 */
export function createDexieUserSettingsStore(
  db: ShmupPersistenceDatabase,
): UserSettingsStorePort {
  return {
    async read(): Promise<UserSettingsReadResult> {
      const row = await db.transaction('r', db.userSettings, () =>
        db.userSettings.get('current'),
      );
      if (row === undefined) {
        return { kind: 'none' };
      }
      return parseUserSettingsRecord(row.value);
    },

    async write(settings: UserSettingsV1): Promise<void> {
      await db.transaction('rw', db.userSettings, async () => {
        await db.userSettings.put({ id: 'current', value: settings });
      });
    },
  };
}
