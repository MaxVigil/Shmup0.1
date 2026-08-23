import type { ContentCatalogue } from '@content/index';
import { createPilotSelectionStream } from '@domain/index';
import { IDLE_COMBAT_LIFECYCLE } from '../combat/lifecycle';
import type { SessionState } from './session-state';

/**
 * Creates the approved initial session for one page load (Base §9.1–9.2).
 *
 * The session seed is serialized and hashed by the approved pilot-selection
 * stream (Technical Foundation §8); the selected Pilot is drawn with equal
 * probability from the approved list. Values come from the canonical content
 * catalogue so no balance value is duplicated here.
 */
export function initializeSession(
  sessionSeed: number,
  content: ContentCatalogue,
): SessionState {
  const aircraft = content.aircraft[0];
  const defaultWeapon = content.weapons.find(
    (weapon) => weapon.type === 'machine-gun',
  );
  if (aircraft === undefined || defaultWeapon === undefined) {
    throw new Error(
      'Session initialization failed: canonical content is incomplete',
    );
  }
  const pilotStream = createPilotSelectionStream(sessionSeed);
  const pilotIndex = pilotStream.nextInt(content.pilots.length);
  const pilot = content.pilots[pilotIndex];
  if (pilot === undefined) {
    throw new Error(
      'Session initialization failed: no Pilot selected from the approved list',
    );
  }
  return {
    currentScreen: 'operations',
    credits: 1,
    aircraftId: aircraft.id,
    hullIntegrity: aircraft.maximumHullIntegrity,
    equippedWeapon: defaultWeapon.type,
    mouseMovementEnabled: true,
    missionAvailable: true,
    activeMission: 'none',
    // The session seed is retained so later Combat mission streams can be
    // derived deterministically (Technical Foundation §8).
    sessionSeed,
    missionInstanceCount: 0,
    missionStartFailed: false,
    missionResult: null,
    combatLifecycle: IDLE_COMBAT_LIFECYCLE,
    pilot,
  };
}
