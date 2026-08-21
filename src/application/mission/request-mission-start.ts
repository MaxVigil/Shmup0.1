import type { SessionStore } from '../session';

export type MissionStartRequestResult =
  | { readonly kind: 'accepted' }
  | {
      readonly kind: 'rejected';
      readonly reason:
        'no-session' | 'mission-not-available' | 'active-mission-exists';
    };

/**
 * S05 application boundary for a Start Mission request (Base §5.5, §9.4).
 *
 * This function validates the current Shared Session State and returns whether
 * the start request is accepted. It is the seam the S07 slice consumes to
 * construct the Mission Snapshot and open Combat; it never mutates mission
 * state and never applies rewards. Duplicate emission at selection is
 * prevented by the UI's immediate disable (Base §5.5); single-active-mission
 * enforcement against a constructed mission is S07 (Base AC-035), while the
 * `active-mission-exists` guard here already implements the command-level
 * rejection for the future widened state.
 */
export function requestMissionStart(
  store: SessionStore,
): MissionStartRequestResult {
  const session = store.getState();
  if (session === null) {
    return { kind: 'rejected', reason: 'no-session' };
  }
  if (!session.missionAvailable) {
    return { kind: 'rejected', reason: 'mission-not-available' };
  }
  if (session.activeMission !== 'none') {
    return { kind: 'rejected', reason: 'active-mission-exists' };
  }
  return { kind: 'accepted' };
}
