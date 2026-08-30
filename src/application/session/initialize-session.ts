import type { ContentCatalogue } from '@content/index';
import { DEFAULT_USER_SETTINGS, createNewGameCampaign } from '@domain/index';
import type { UserSettingsV1 } from '@domain/index';
import { hydrateSessionFromCampaign } from './hydrate-session';
import type { SessionState } from './session-state';

/**
 * Creates the approved v0.2 initial session for a fresh page load that has no
 * persisted campaign (Epic §14.1, Base §9.1–9.2): the canonical New Game
 * campaign (12 Starting Credits, full Hull, default Machine Gun, Interception
 * 01 unlocked, one Pilot drawn with equal probability) is hydrated into the
 * single authoritative session. Values come from the canonical content
 * catalogue so no balance value is duplicated here.
 */
export function initializeSession(
  sessionSeed: number,
  content: ContentCatalogue,
  settings: UserSettingsV1 = DEFAULT_USER_SETTINGS,
): SessionState {
  const aircraft = content.aircraft[0];
  if (aircraft === undefined) {
    throw new Error(
      'Session initialization failed: canonical content is incomplete',
    );
  }
  const campaign = createNewGameCampaign({
    aircraftId: aircraft.id,
    maximumHullIntegrity: aircraft.maximumHullIntegrity,
    pilotIds: content.pilots.map((pilot) => pilot.id),
    sessionSeed,
  });
  return hydrateSessionFromCampaign({
    campaign,
    settings,
    sessionSeed,
    content,
  });
}
