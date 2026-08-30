import { parseUserSettingsRecord } from '@domain/index';
import type { UserSettingsV1 } from '@domain/index';
import type {
  UserSettingsReadResult,
  UserSettingsStorePort,
} from '@application/persistence';

/**
 * In-memory `UserSettingsStorePort` fake for deterministic application/UI
 * tests. Mirrors the real Dexie adapter contract: stored input is validated,
 * missing records read as `none`, and invalid records are reported.
 */
export class InMemoryUserSettingsStore implements UserSettingsStorePort {
  private record: UserSettingsV1 | null = null;

  seed(settings: UserSettingsV1): void {
    this.record = settings;
  }

  get current(): UserSettingsV1 | null {
    return this.record;
  }

  async read(): Promise<UserSettingsReadResult> {
    if (this.record === null) {
      return { kind: 'none' };
    }
    return parseUserSettingsRecord(this.record as unknown);
  }

  async write(settings: UserSettingsV1): Promise<void> {
    this.record = settings;
  }
}
