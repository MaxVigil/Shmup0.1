import { describe, expect, it } from 'vitest';
import {
  HULL_INTEGRITY_MAX,
  V02_DEFEAT_REPAIR_COST_CREDITS,
  V02_STARTING_CREDITS,
} from '@domain/index';
import { aircraftId, pilotId } from '@domain/index';
import type { MissionId } from '@domain/index';
import {
  applyDefeatRecoveryOrGameOver,
  applyMissionDefeat,
  applyMissionEvacuation,
  applySeamAbort,
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

describe('clearMissionInProgress (Base AC-014 correction, V02-WI-02 C02, V02-DEC-031)', () => {
  it('clears the marker only for the exact originating mission id AND attempt id', () => {
    const marker = withMarker(newGame(), 'interception-01', 2);
    const result = clearMissionInProgress(marker, 'interception-01', 2);
    expect(result).toEqual({
      kind: 'applied',
      campaign: expect.objectContaining({ missionInProgress: null }),
    });
  });

  it('rejects as attempt-does-not-match when a newer attempt owns the marker', () => {
    const newerMarker = withMarker(newGame(), 'interception-01', 3);
    expect(clearMissionInProgress(newerMarker, 'interception-01', 2)).toEqual({
      kind: 'rejected',
      reason: 'attempt-does-not-match',
    });
  });

  it('rejects as mission-does-not-match when a schema-valid marker belongs to another mission', () => {
    const crossMission = withMarker(newGame(), 'interception-02', 2);
    expect(clearMissionInProgress(crossMission, 'interception-01', 2)).toEqual({
      kind: 'rejected',
      reason: 'mission-does-not-match',
    });
  });

  it('rejects as no-mission-in-progress when no marker exists', () => {
    expect(clearMissionInProgress(newGame(), 'interception-01', 0)).toEqual({
      kind: 'rejected',
      reason: 'no-mission-in-progress',
    });
  });
});

describe('canonical terminal transitions (v0.2)', () => {
  const inProgress = () => withMarker(newGame(), 'interception-01');

  it('Defeat commits zero reward and the paid full Repair for the exact attempt (V02-AC-016)', () => {
    const result = applyMissionDefeat(inProgress(), 0, 'interception-01');
    expect(result.kind).toBe('applied');
    if (result.kind === 'applied') {
      expect(result.campaign.credits).toBe(
        V02_STARTING_CREDITS - V02_DEFEAT_REPAIR_COST_CREDITS,
      );
      expect(result.campaign.hullIntegrity).toBe(HULL_INTEGRITY_MAX);
      expect(result.campaign.runStatus).toBe('active');
      expect(result.campaign.missionInProgress).toBeNull();
    }
  });

  it('Defeat deducts exactly 8 Credits when only the Repair cost is affordable', () => {
    const result = applyMissionDefeat(
      withMarker(withCredits(newGame(), 8), 'interception-01'),
      0,
      'interception-01',
    );
    expect(result.kind).toBe('applied');
    if (result.kind === 'applied') {
      expect(result.campaign.credits).toBe(0);
      expect(result.campaign.hullIntegrity).toBe(HULL_INTEGRITY_MAX);
      expect(result.campaign.runStatus).toBe('active');
    }
  });

  it('Defeat enters Game Over without any partial deduction below the Repair cost (V02-AC-016)', () => {
    const result = applyMissionDefeat(
      withMarker(withCredits(newGame(), 7), 'interception-01'),
      0,
      'interception-01',
    );
    expect(result.kind).toBe('applied');
    if (result.kind === 'applied') {
      expect(result.campaign.credits).toBe(7);
      expect(result.campaign.runStatus).toBe('game-over');
      expect(result.campaign.missionInProgress).toBeNull();
    }
  });

  it('Defeat rejects a marker of another mission even when the attempt id matches (V02-WI-05 C04)', () => {
    // The reviewer counterexample: active Mission 01 session, persisted
    // Mission 02 marker carrying the SAME attempt id. The live Defeat must be
    // rejected before any Credits, Hull, or marker change.
    const campaign = withMarker(
      {
        ...withCredits(newGame(), 12),
        unlockedMissionIds: ['interception-01', 'interception-02'],
      },
      'interception-02',
      0,
    );
    expect(applyMissionDefeat(campaign, 0, 'interception-01')).toEqual({
      kind: 'rejected',
      reason: 'marker-mission-mismatch',
    });
    expect(campaign.credits).toBe(12);
    expect(campaign.hullIntegrity).toBe(HULL_INTEGRITY_MAX);
    expect(campaign.missionInProgress).toEqual({
      missionId: 'interception-02',
      attemptId: 0,
    });
    // The matching originating identity still commits (V02-AC-016).
    expect(applyMissionDefeat(campaign, 0, 'interception-02').kind).toBe(
      'applied',
    );
  });

  it('Evacuation commits the floored 50% payout and retains the current Combat Hull for the exact attempt (V02-AC-015)', () => {
    const result = applyMissionEvacuation(
      inProgress(),
      0,
      'interception-01',
      70,
      5,
      1,
    );
    expect(result.kind).toBe('applied');
    if (result.kind === 'applied') {
      // net = max(0, 5 − 1) = 4 → payout = floor(4 × 0.5) = 2.
      expect(result.campaign.credits).toBe(V02_STARTING_CREDITS + 2);
      expect(result.campaign.hullIntegrity).toBe(70);
      expect(result.campaign.missionInProgress).toBeNull();
      // No completion/unlock change.
      expect(result.campaign.completedMissionIds).toEqual([]);
      expect(result.campaign.unlockedMissionIds).toEqual(['interception-01']);
    }
  });

  it('Evacuation floors the net to zero and changes no economy below the penalty line', () => {
    const result = applyMissionEvacuation(
      inProgress(),
      0,
      'interception-01',
      66,
      3,
      10,
    );
    expect(result.kind).toBe('applied');
    if (result.kind === 'applied') {
      expect(result.campaign.credits).toBe(V02_STARTING_CREDITS);
      expect(result.campaign.hullIntegrity).toBe(66);
      expect(result.campaign.missionInProgress).toBeNull();
    }
  });

  it('Evacuation rejects stale attempts, marker-mission mismatches, and invalid values before any change', () => {
    const newerMarker = withMarker(newGame(), 'interception-01', 1);
    expect(
      applyMissionEvacuation(newerMarker, 0, 'interception-01', 70, 5, 1),
    ).toEqual({ kind: 'rejected', reason: 'attempt-does-not-match' });
    const otherMission = withMarker(newGame(), 'interception-02');
    expect(
      applyMissionEvacuation(otherMission, 0, 'interception-01', 70, 5, 1),
    ).toEqual({ kind: 'rejected', reason: 'marker-mission-mismatch' });
    expect(
      applyMissionEvacuation(inProgress(), 0, 'interception-01', 101, 5, 1),
    ).toEqual({ kind: 'rejected', reason: 'invalid-evacuation-result-values' });
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
    expect(applyMissionDefeat(newerMarker, 0, 'interception-01')).toEqual({
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
    expect(applyMissionDefeat(cleared, 0, 'interception-01')).toEqual({
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
