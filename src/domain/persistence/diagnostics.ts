/**
 * Path-qualified persistence diagnostics (Epic §14.2, §17; V02-AC-021). A
 * diagnostic identifies the exact untrusted-input path (`credits`,
 * `unlockedMissionIds.2`, `missionInProgress`) that failed validation or
 * migration so the cause is auditable without exposing secrets. Diagnostics
 * are development/debug data; the player-facing Save Data Error Screen never
 * renders the raw technical details.
 */
export interface PersistenceDiagnostic {
  readonly path: string;
  readonly message: string;
}
