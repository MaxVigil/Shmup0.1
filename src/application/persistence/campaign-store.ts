import type {
  CampaignStateV1,
  CampaignTransitionResult,
  MissionId,
  PersistenceDiagnostic,
} from '@domain/index';

/**
 * Application-owned campaign persistence boundary (Epic §13.2, §14.2,
 * V02-AC-020). The port exposes the canonical transactions the application
 * commands use; concrete IndexedDB/Dexie adapters implement it and stay
 * confined to `src/platform/persistence/`. Domain, UI, and Phaser never
 * import Dexie or mutate stored records directly.
 *
 * `update` is the atomic read-modify-write transaction: the pure transform
 * runs inside the adapter's storage transaction so one logical command
 * produces one durable before/after state. Stored input is always validated
 * by the adapter before the transform runs; a corrupted record is reported
 * and never overwritten by an update.
 */
export type CampaignReadResult =
  | { readonly kind: 'none' }
  | { readonly kind: 'loaded'; readonly campaign: CampaignStateV1 }
  | {
      readonly kind: 'invalid';
      readonly diagnostics: readonly PersistenceDiagnostic[];
    };

export type CampaignUpdateOutcome =
  | { readonly kind: 'applied'; readonly next: CampaignStateV1 }
  | { readonly kind: 'no-change'; readonly reason: string }
  | { readonly kind: 'missing' }
  | {
      readonly kind: 'invalid';
      readonly diagnostics: readonly PersistenceDiagnostic[];
    };

/** Outcome of the atomic mission-start operation (Epic §13.2, V02-AC-020;
 *  V02-WI-02 correction C04). `applied` carries the next campaign state AND
 *  the globally unique monotonic `attemptId` issued by the platform-owned
 *  non-resetting allocator store in the same transaction. */
export type CampaignStartOutcome =
  | {
      readonly kind: 'applied';
      readonly next: CampaignStateV1;
      readonly attemptId: number;
    }
  | { readonly kind: 'no-change'; readonly reason: string }
  | { readonly kind: 'missing' }
  | {
      readonly kind: 'invalid';
      readonly diagnostics: readonly PersistenceDiagnostic[];
    };

export interface CampaignStorePort {
  /** Reads and validates the single persisted campaign record. */
  read(): Promise<CampaignReadResult>;
  /**
   * Atomically transforms the persisted campaign record through one pure
   * transition. `apply: false` from the transform leaves the record untouched
   * (idempotent stale/duplicate callbacks). `missing`/`invalid` report a
   * record that cannot be transformed and never write.
   */
  update(
    transform: (current: CampaignStateV1) => CampaignTransitionResult,
  ): Promise<CampaignUpdateOutcome>;
  /**
   * Atomic mission start (Epic §13.2, V02-AC-020; V02-WI-02 correction C04):
   * validates the current campaign, allocates the next globally unique
   * monotonic attempt id from the dedicated non-resetting allocator store,
   * persists the exact `missionInProgress` marker, and returns the applied
   * campaign plus the allocated id — all in one IndexedDB transaction. A
   * rejected, missing, or invalid start leaves the campaign untouched (no
   * partially applied transition); an unused allocated id may be consumed by
   * the allocator, but an id is never reissued. The allocator is never reset
   * by confirmed New Game, Save Data Error replacement, or any campaign
   * replacement.
   */
  startMission(missionId: MissionId): Promise<CampaignStartOutcome>;
  /** Atomically replaces the whole campaign record (confirmed New Game). */
  replace(next: CampaignStateV1): Promise<void>;
}
