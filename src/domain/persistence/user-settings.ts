import type { PersistenceDiagnostic } from './diagnostics';

/**
 * Separately persisted user Settings contract (Epic §14.1, V02-AC-017): a
 * distinct record from campaign state so a confirmed New Game / campaign
 * replacement never resets `Mouse Movement Enabled`. The v0.2 user Settings
 * surface contains only this one value; Base §3.6 / Master §7.6 apply.
 */
export interface UserSettingsV1 {
  readonly mouseMovementEnabled: boolean;
}

/** Approved default when no persisted Settings record exists (Base §3.6). */
export const DEFAULT_USER_SETTINGS: UserSettingsV1 = Object.freeze({
  mouseMovementEnabled: true,
});

export type UserSettingsParseResult =
  | { readonly kind: 'loaded'; readonly settings: UserSettingsV1 }
  | {
      readonly kind: 'invalid';
      readonly diagnostics: readonly PersistenceDiagnostic[];
    };

/**
 * Strict untrusted-input validation for the persisted user Settings record.
 * Invalid Settings are a local, non-campaign defect: the safe fallback is the
 * approved default (mirroring the historical refresh-to-true behaviour) and
 * the record is re-persisted, never treated as a Save Data Error (which is
 * reserved for the campaign record).
 */
export function parseUserSettingsRecord(
  record: unknown,
): UserSettingsParseResult {
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    return {
      kind: 'invalid',
      diagnostics: [{ path: '', message: 'settings record is not an object' }],
    };
  }
  const value = record as Record<string, unknown>;
  if (typeof value.mouseMovementEnabled !== 'boolean') {
    return {
      kind: 'invalid',
      diagnostics: [
        {
          path: 'mouseMovementEnabled',
          message: 'mouseMovementEnabled must be a boolean',
        },
      ],
    };
  }
  return {
    kind: 'loaded',
    settings: { mouseMovementEnabled: value.mouseMovementEnabled },
  };
}
