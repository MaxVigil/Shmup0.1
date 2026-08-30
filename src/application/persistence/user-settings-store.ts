import type { PersistenceDiagnostic, UserSettingsV1 } from '@domain/index';

/**
 * Separately persisted user Settings boundary (Epic §14.1, V02-AC-017). The
 * record is independent from the campaign record so a confirmed New Game
 * replacement never resets `Mouse Movement Enabled`. UI never writes the
 * store directly; it dispatches the application command that persists through
 * this port.
 */
export type UserSettingsReadResult =
  | { readonly kind: 'none' }
  | { readonly kind: 'loaded'; readonly settings: UserSettingsV1 }
  | {
      readonly kind: 'invalid';
      readonly diagnostics: readonly PersistenceDiagnostic[];
    };

export interface UserSettingsStorePort {
  read(): Promise<UserSettingsReadResult>;
  write(settings: UserSettingsV1): Promise<void>;
}
