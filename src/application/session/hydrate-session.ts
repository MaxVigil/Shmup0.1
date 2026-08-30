import type { ContentCatalogue } from '../content';
import type { CampaignStateV1, UserSettingsV1 } from '@domain/index';
import { IDLE_COMBAT_LIFECYCLE } from '../combat/lifecycle';
import type { SessionState } from './session-state';

export interface HydrateSessionInput {
  readonly campaign: CampaignStateV1;
  readonly settings: UserSettingsV1;
  /** Fresh per-page-load session RNG seed (Technical Foundation §8). */
  readonly sessionSeed: number;
  readonly content: ContentCatalogue;
}

/**
 * Hydrates exactly one authoritative application session from the persisted
 * campaign plus the separately persisted user Settings (Epic §14.1, WI-02
 * delta). The campaign is the durable run authority; the session mirrors its
 * credits, Hull, weapon, Pilot, mission progression, and run status. `sessionSeed`
 * is per-page-load entropy (never persisted); `missionInstanceCount` restarts
 * at 0 for the fresh session and the persisted `missionInProgress` marker is
 * never restored as an Active Mission (refresh/crash recovery resolves it as
 * Defeat at Boot — V02-AC-018).
 */
export function hydrateSessionFromCampaign(
  input: HydrateSessionInput,
): SessionState {
  const aircraft = input.content.aircraft.find(
    (candidate) => candidate.id === input.campaign.aircraftId,
  );
  const pilot = input.content.pilots.find(
    (candidate) => candidate.id === input.campaign.pilotId,
  );
  if (aircraft === undefined || pilot === undefined) {
    // Cannot happen for a campaign that passed strict validation against the
    // same validated catalogue; defensive so hydration never invents state.
    throw new Error(
      'Session hydration failed: campaign references unknown content',
    );
  }
  return {
    currentScreen: 'operations',
    credits: input.campaign.credits,
    aircraftId: input.campaign.aircraftId,
    hullIntegrity: input.campaign.hullIntegrity,
    equippedWeapon: input.campaign.equippedWeapon,
    mouseMovementEnabled: input.settings.mouseMovementEnabled,
    runStatus: input.campaign.runStatus,
    unlockedMissionIds: [...input.campaign.unlockedMissionIds],
    completedMissionIds: [...input.campaign.completedMissionIds],
    activeMission: 'none',
    sessionSeed: input.sessionSeed,
    missionInstanceCount: 0,
    missionStartFailed: false,
    missionStartFailedMissionId: null,
    missionResult: null,
    combatLifecycle: IDLE_COMBAT_LIFECYCLE,
    pilot,
  };
}
