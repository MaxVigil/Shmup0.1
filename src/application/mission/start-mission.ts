import { COMBAT_MISSION_STREAM, deriveStreamSeed } from '@domain/index';
import type { SessionStore } from '../session';
import type { MissionSnapshot } from './snapshot';

export type MissionStartResult =
  | { readonly kind: 'accepted'; readonly snapshot: MissionSnapshot }
  | {
      readonly kind: 'rejected';
      readonly reason:
        | 'no-session'
        | 'mission-not-available'
        | 'active-mission-exists'
        | 'mission-result-pending';
    };

/**
 * One accepted Start Mission command (Base §5.5, §9.4; S07).
 *
 * Validates the current Shared Session State and, when accepted, builds the
 * immutable Mission Snapshot that Combat receives: current aircraft, Hull
 * Integrity, equipped Primary Weapon, Pilot, and Mouse Movement setting, plus
 * the Mission Instance ordinal and the deterministic combat-mission stream
 * seed derived from the session seed (Technical Foundation §8). The snapshot
 * is recorded by the store exactly once; a second command while a mission is
 * active is rejected (Base AC-035). No Credits are spent and no reward is
 * applied here.
 */
export function startMission(store: SessionStore): MissionStartResult {
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
  // S12-WI01: while a committed Mission Result is pending (the Result Overlay
  // is the only continuation point), a new Start Mission command is rejected at
  // the application boundary as well as through the blocking UI.
  if (session.missionResult !== null) {
    return { kind: 'rejected', reason: 'mission-result-pending' };
  }
  const missionInstanceOrdinal = session.missionInstanceCount;
  const snapshot: MissionSnapshot = {
    missionInstanceOrdinal,
    combatMissionSeed: deriveStreamSeed(
      session.sessionSeed,
      COMBAT_MISSION_STREAM,
      missionInstanceOrdinal,
    ),
    aircraftId: session.aircraftId,
    hullIntegrity: session.hullIntegrity,
    equippedWeapon: session.equippedWeapon,
    pilot: session.pilot,
    mouseMovementEnabled: session.mouseMovementEnabled,
  };
  store.dispatch({ type: 'mission/start', snapshot });
  return { kind: 'accepted', snapshot };
}
