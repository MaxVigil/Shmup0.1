import { describe, expect, it } from 'vitest';
import {
  HULL_INTEGRITY_MAX,
  LEGACY_DEFEAT_RECOVERY_HULL,
  V02_DEFEAT_REPAIR_COST_CREDITS,
  V02_STARTING_CREDITS,
} from '@domain/index';
import { aircraftId, pilotId } from '@domain/index';
import type { MissionId } from '@domain/index';
import {
  applyDefeatRecoveryOrGameOver,
  applySeamAbort,
  applySeamDefeat,
  applySeamSuccess,
  beginMission,
  clearMissionInProgress,
} from './campaign-transitions';
import { createNewGameCampaign } from './campaign-state';
import type { CampaignStateV1 } from './campaign-state';
import { CAMPAIGN_SCHEMA_VERSION } from './campaign-state';

const PILOT_IDS = [
  pilotId('pilot-kovalenko'),
  pilotId('pilot-petrenko'),
  pilotId('pilot-bondar'),
  pilotId('pilot-shevchenko'),
  pilotId('pilot-melnyk'),
  pilotId('pilot-tkachenko'),
] as const;

function newGame(sessionSeed = 3735928559): CampaignStateV1 {
  return createNewGameCampaign({
    aircraftId: aircraftId('german-fighter'),
    maximumHullIntegrity: 100,
    pilotIds: PILOT_IDS,
    sessionSeed,
  });
}

function withCredits(
  campaign: CampaignStateV1,
  credits: number,
): CampaignStateV1 {
  return { ...campaign, credits };
}

function withMarker(
  campaign: CampaignStateV1,
  mission: MissionId,
  attemptId = 0,
): CampaignStateV1 {
  return {
    ...campaign,
    missionInProgress: { missionId: mission, attemptId },
  };
}

describe('createNewGameCampaign (Epic §13.6, §14.1; V02-AC-001)', () => {
  it('creates the canonical v0.2 New Game state with 12 Starting Credits', () => {
    const campaign = newGame();
    expect(campaign.schemaVersion).toBe(CAMPAIGN_SCHEMA_VERSION);
    expect(campaign.runStatus).toBe('active');
    expect(campaign.credits).toBe(V02_STARTING_CREDITS);
    expect(campaign.hullIntegrity).toBe(HULL_INTEGRITY_MAX);
    expect(campaign.equippedWeapon).toBe('machine-gun');
    expect(campaign.unlockedMissionIds).toEqual(['interception-01']);
    expect(campaign.completedMissionIds).toEqual([]);
    expect(campaign.missionInProgress).toBeNull();
  });

  it('selects a Pilot deterministically from the approved list', () => {
    expect(newGame(3735928559).pilotId).toBe(pilotId('pilot-shevchenko'));
    expect(newGame(3735928559).pilotId).toBe(newGame(3735928559).pilotId);
    expect(newGame(123456789).pilotId).not.toBe(newGame(3735928559).pilotId);
  });
});

describe('beginMission (Epic §13.2, V02-AC-020; V02-WI-02 C04)', () => {
  it('stores the allocator-issued attempt id in the persisted missionInProgress marker before Combat entry', () => {
    const result = beginMission(newGame(), 'interception-01', 7);
    expect(result).toEqual({
      kind: 'applied',
      campaign: expect.objectContaining({
        missionInProgress: { missionId: 'interception-01', attemptId: 7 },
      }),
    });
    if (result.kind === 'applied') {
      expect(result.campaign.credits).toBe(V02_STARTING_CREDITS);
      expect(result.campaign.runStatus).toBe('active');
    }
  });

  it('preserves the allocator-issued attempt id exactly (never re-derives it from the campaign)', () => {
    const first = beginMission(newGame(), 'interception-01', 7);
    if (first.kind === 'rejected') {
      throw new Error('Expected the marker to be set.');
    }
    expect(first.campaign.missionInProgress).toEqual({
      missionId: 'interception-01',
      attemptId: 7,
    });
    const second = beginMission(
      { ...first.campaign, missionInProgress: null },
      'interception-01',
      8,
    );
    expect(second).toEqual({
      kind: 'applied',
      campaign: expect.objectContaining({
        missionInProgress: { missionId: 'interception-01', attemptId: 8 },
      }),
    });
  });

  it('rejects an attempt id that is not a safe non-negative integer', () => {
    for (const attemptId of [-1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(beginMission(newGame(), 'interception-01', attemptId)).toEqual({
        kind: 'rejected',
        reason: 'invalid-attempt-identity',
      });
    }
  });

  it('rejects a repeated start while a mission is already in progress', () => {
    const inProgress = withMarker(newGame(), 'interception-01');
    expect(beginMission(inProgress, 'interception-01', 0)).toEqual({
      kind: 'rejected',
      reason: 'a-mission-is-already-in-progress',
    });
  });

  it('rejects a start for a locked mission', () => {
    expect(beginMission(newGame(), 'interception-02', 0)).toEqual({
      kind: 'rejected',
      reason: 'mission-is-not-unlocked',
    });
  });

  it('rejects a start when the run is game over', () => {
    const gameOver = { ...newGame(), runStatus: 'game-over' as const };
    expect(beginMission(gameOver, 'interception-01', 0)).toEqual({
      kind: 'rejected',
      reason: 'run-is-game-over',
    });
  });
});

describe('clearMissionInProgress (Base AC-014 correction, V02-WI-02 C02)', () => {
  it('clears the marker only for the exact originating attempt', () => {
    const marker = withMarker(newGame(), 'interception-01', 2);
    const result = clearMissionInProgress(marker, 2);
    expect(result).toEqual({
      kind: 'applied',
      campaign: expect.objectContaining({ missionInProgress: null }),
    });
  });

  it('rejects as attempt-does-not-match when a newer attempt owns the marker', () => {
    const newerMarker = withMarker(newGame(), 'interception-01', 3);
    expect(clearMissionInProgress(newerMarker, 2)).toEqual({
      kind: 'rejected',
      reason: 'attempt-does-not-match',
    });
  });

  it('rejects as no-mission-in-progress when no marker exists', () => {
    expect(clearMissionInProgress(newGame(), 0)).toEqual({
      kind: 'rejected',
      reason: 'no-mission-in-progress',
    });
  });
});

describe('seam terminal transitions (temporary v0.1 single-mission flow)', () => {
  const inProgress = () => withMarker(newGame(), 'interception-01');

  it('Success grants the completion reward, retains Combat Hull, and clears the marker for the exact attempt', () => {
    const result = applySeamSuccess(inProgress(), 0, 80, 1);
    expect(result.kind).toBe('applied');
    if (result.kind === 'applied') {
      expect(result.campaign.credits).toBe(V02_STARTING_CREDITS + 1);
      expect(result.campaign.hullIntegrity).toBe(80);
      expect(result.campaign.missionInProgress).toBeNull();
    }
  });

  it('Defeat grants zero reward and the legacy 25-Hull emergency recovery for the exact attempt', () => {
    const result = applySeamDefeat(inProgress(), 0);
    expect(result.kind).toBe('applied');
    if (result.kind === 'applied') {
      expect(result.campaign.credits).toBe(V02_STARTING_CREDITS);
      expect(result.campaign.hullIntegrity).toBe(LEGACY_DEFEAT_RECOVERY_HULL);
      expect(result.campaign.missionInProgress).toBeNull();
    }
  });

  it('Aborted retains Combat Hull with no reward or recovery for the exact attempt', () => {
    const result = applySeamAbort(inProgress(), 0, 55);
    expect(result.kind).toBe('applied');
    if (result.kind === 'applied') {
      expect(result.campaign.credits).toBe(V02_STARTING_CREDITS);
      expect(result.campaign.hullIntegrity).toBe(55);
      expect(result.campaign.missionInProgress).toBeNull();
    }
  });

  it('a stale terminal for a different campaign attempt is a strict attempt-does-not-match rejection before any reward or Hull change', () => {
    const newerMarker = withMarker(newGame(), 'interception-01', 1);
    expect(applySeamSuccess(newerMarker, 0, 80, 1)).toEqual({
      kind: 'rejected',
      reason: 'attempt-does-not-match',
    });
    expect(applySeamDefeat(newerMarker, 0)).toEqual({
      kind: 'rejected',
      reason: 'attempt-does-not-match',
    });
    expect(applySeamAbort(newerMarker, 0, 55)).toEqual({
      kind: 'rejected',
      reason: 'attempt-does-not-match',
    });
  });

  it('a stale terminal transition after the marker cleared is a strict rejection', () => {
    const cleared = { ...inProgress(), missionInProgress: null };
    expect(applySeamSuccess(cleared, 0, 80, 1)).toEqual({
      kind: 'rejected',
      reason: 'no-mission-in-progress',
    });
    expect(applySeamDefeat(cleared, 0)).toEqual({
      kind: 'rejected',
      reason: 'no-mission-in-progress',
    });
    expect(applySeamAbort(cleared, 0, 55)).toEqual({
      kind: 'rejected',
      reason: 'no-mission-in-progress',
    });
  });
});

describe('applyDefeatRecoveryOrGameOver (Epic §14.3, V02-AC-018)', () => {
  it('repairs at exactly the full Repair cost and clears the marker once', () => {
    const atCost = withMarker(withCredits(newGame(), 8), 'interception-01');
    const result = applyDefeatRecoveryOrGameOver(atCost);
    if (result.kind === 'rejected') {
      throw new Error('Expected a recovery result.');
    }
    expect(result.outcome).toBe('repaired');
    expect(result.campaign.credits).toBe(0);
    expect(result.campaign.hullIntegrity).toBe(HULL_INTEGRITY_MAX);
    expect(result.campaign.missionInProgress).toBeNull();
    expect(result.campaign.runStatus).toBe('active');
  });

  it('deducts exactly 8 Credits above the cost', () => {
    const result = applyDefeatRecoveryOrGameOver(
      withMarker(withCredits(newGame(), 12), 'interception-01'),
    );
    if (result.kind === 'rejected') {
      throw new Error('Expected a recovery result.');
    }
    expect(result.outcome).toBe('repaired');
    expect(result.campaign.credits).toBe(12 - V02_DEFEAT_REPAIR_COST_CREDITS);
  });

  it('enters Game Over with zero reward and no partial deduction below the cost', () => {
    const result = applyDefeatRecoveryOrGameOver(
      withMarker(withCredits(newGame(), 7), 'interception-01'),
    );
    if (result.kind === 'rejected') {
      throw new Error('Expected a recovery result.');
    }
    expect(result.outcome).toBe('game-over');
    expect(result.campaign.credits).toBe(7);
    expect(result.campaign.runStatus).toBe('game-over');
    expect(result.campaign.missionInProgress).toBeNull();
  });

  it('never re-resolves after the marker is already cleared (exactly once)', () => {
    const recovered = withMarker(withCredits(newGame(), 8), 'interception-01');
    const first = applyDefeatRecoveryOrGameOver(recovered);
    if (first.kind === 'rejected') {
      throw new Error('Expected a recovery result.');
    }
    // The second startup sees the cleared marker: strict rejection, no deduction.
    expect(applyDefeatRecoveryOrGameOver(first.campaign)).toEqual({
      kind: 'rejected',
      reason: 'no-mission-in-progress',
    });
    expect(first.campaign.credits).toBe(0);
  });
});
