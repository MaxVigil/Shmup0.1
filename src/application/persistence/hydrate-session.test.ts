import { describe, expect, it } from 'vitest';
import { CONTENT_CATALOGUE } from '@content/index';
import { aircraftId, pilotId } from '@domain/index';
import { hydrateSessionFromCampaign } from '../session/hydrate-session';
import type { CampaignStateV1 } from '@domain/index';

function campaign(overrides: Partial<CampaignStateV1> = {}): CampaignStateV1 {
  return {
    schemaVersion: 1,
    runStatus: 'active',
    credits: 12,
    aircraftId: aircraftId('german-fighter'),
    hullIntegrity: 80,
    equippedWeapon: 'cannon',
    unlockedMissionIds: ['interception-01'],
    completedMissionIds: [],
    missionInProgress: null,
    pilotId: pilotId('pilot-shevchenko'),
    ...overrides,
  };
}

describe('hydrateSessionFromCampaign (Epic §14.1, WI-02 delta)', () => {
  it('mirrors the persisted campaign and separately persisted Settings into one authoritative session', () => {
    const session = hydrateSessionFromCampaign({
      campaign: campaign(),
      settings: { mouseMovementEnabled: false },
      sessionSeed: 12345,
      content: CONTENT_CATALOGUE,
    });
    expect(session.credits).toBe(12);
    expect(session.hullIntegrity).toBe(80);
    expect(session.equippedWeapon).toBe('cannon');
    expect(session.mouseMovementEnabled).toBe(false);
    expect(session.runStatus).toBe('active');
    expect(session.missionAvailable).toBe(true);
    expect(session.activeMission).toBe('none');
    expect(session.missionInstanceCount).toBe(0);
    expect(session.missionResult).toBeNull();
    expect(session.sessionSeed).toBe(12345);
    expect(session.pilot.name).toBe('Андрій Шевченко');
  });

  it('never restores the persisted missionInProgress marker as an Active Mission', () => {
    const session = hydrateSessionFromCampaign({
      campaign: campaign({
        missionInProgress: { missionId: 'interception-01', attemptId: 0 },
      }),
      settings: { mouseMovementEnabled: true },
      sessionSeed: 1,
      content: CONTENT_CATALOGUE,
    });
    expect(session.activeMission).toBe('none');
    // The marker is resolved as Defeat at Boot (V02-AC-018); the fresh session
    // cannot enter Combat from the marker alone.
    expect(session.combatLifecycle.running).toBe(false);
  });

  it('marks the run as game-over from the persisted runStatus', () => {
    const session = hydrateSessionFromCampaign({
      campaign: campaign({ runStatus: 'game-over', missionInProgress: null }),
      settings: { mouseMovementEnabled: true },
      sessionSeed: 1,
      content: CONTENT_CATALOGUE,
    });
    expect(session.runStatus).toBe('game-over');
    expect(session.missionAvailable).toBe(false);
  });

  it('throws when the campaign references unknown content (defensive)', () => {
    expect(() =>
      hydrateSessionFromCampaign({
        campaign: campaign({ aircraftId: aircraftId('not-an-aircraft') }),
        settings: { mouseMovementEnabled: true },
        sessionSeed: 1,
        content: CONTENT_CATALOGUE,
      }),
    ).toThrow('campaign references unknown content');
  });
});
