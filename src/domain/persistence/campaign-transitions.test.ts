import { describe, expect, it } from 'vitest';
import { aircraftId, pilotId } from '@domain/index';
import type { CampaignStateV1 } from './campaign-state';
import { createNewGameCampaign } from './campaign-state';
import { applyMissionSuccess, beginMission } from './campaign-transitions';

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

describe('applyMissionSuccess (Epic §6.2, §12.2; V02-AC-002, V02-AC-020)', () => {
  it('completes the mission and unlocks exactly the defined next mission once', () => {
    const started = beginMission(newGame(), 'interception-01', 0);
    expect(started.kind).toBe('applied');
    if (started.kind !== 'applied') {
      throw new Error('Expected the mission to start.');
    }
    const result = applyMissionSuccess(
      started.campaign,
      0,
      'interception-01',
      80,
      0,
      0,
      8,
      'interception-02',
    );
    expect(result).toEqual({
      kind: 'applied',
      campaign: expect.objectContaining({
        credits: 20,
        hullIntegrity: 80,
        completedMissionIds: ['interception-01'],
        unlockedMissionIds: ['interception-01', 'interception-02'],
        missionInProgress: null,
      }),
    });
  });

  it('marks Interception 03 completed and unlocks nothing (Epic §6.2)', () => {
    const campaign = {
      ...newGame(),
      unlockedMissionIds: [
        'interception-01',
        'interception-02',
        'interception-03',
      ] as const,
      completedMissionIds: ['interception-01', 'interception-02'] as const,
    };
    const started = beginMission(campaign, 'interception-03', 5);
    expect(started.kind).toBe('applied');
    if (started.kind !== 'applied') {
      throw new Error('Expected the mission to start.');
    }
    const result = applyMissionSuccess(
      started.campaign,
      5,
      'interception-03',
      60,
      0,
      0,
      16,
      null,
    );
    expect(result.kind).toBe('applied');
    if (result.kind !== 'applied') {
      throw new Error('Expected the mission to complete.');
    }
    expect(result.campaign.completedMissionIds).toEqual([
      'interception-01',
      'interception-02',
      'interception-03',
    ]);
    expect(result.campaign.unlockedMissionIds).toEqual([
      'interception-01',
      'interception-02',
      'interception-03',
    ]);
  });

  it('a repeated Success on a replay does not duplicate completion or unlock', () => {
    const campaign = {
      ...newGame(),
      credits: 20,
      completedMissionIds: ['interception-01'] as const,
      unlockedMissionIds: ['interception-01', 'interception-02'] as const,
    };
    const started = beginMission(campaign, 'interception-01', 3);
    expect(started.kind).toBe('applied');
    if (started.kind !== 'applied') {
      throw new Error('Expected the replay to start.');
    }
    const result = applyMissionSuccess(
      started.campaign,
      3,
      'interception-01',
      90,
      0,
      0,
      8,
      'interception-02',
    );
    expect(result.kind).toBe('applied');
    if (result.kind !== 'applied') {
      throw new Error('Expected the replay Success to apply.');
    }
    // No duplicate completion, no duplicate unlock; reward still applies once.
    expect(result.campaign.completedMissionIds).toEqual(['interception-01']);
    expect(result.campaign.unlockedMissionIds).toEqual([
      'interception-01',
      'interception-02',
    ]);
    expect(result.campaign.credits).toBe(28);
  });

  it('rejects a Success for the wrong attempt (stale/racing callback) before any change', () => {
    const started = beginMission(newGame(), 'interception-01', 0);
    expect(started.kind).toBe('applied');
    if (started.kind !== 'applied') {
      throw new Error('Expected the mission to start.');
    }
    const result = applyMissionSuccess(
      started.campaign,
      7, // non-matching attempt id
      'interception-01',
      80,
      0,
      0,
      8,
      'interception-02',
    );
    expect(result).toEqual({
      kind: 'rejected',
      reason: 'attempt-does-not-match',
    });
  });

  it('rejects a Success for a different mission id than the marker', () => {
    const started = beginMission(newGame(), 'interception-01', 0);
    expect(started.kind).toBe('applied');
    if (started.kind !== 'applied') {
      throw new Error('Expected the mission to start.');
    }
    const result = applyMissionSuccess(
      started.campaign,
      0,
      'interception-02',
      80,
      0,
      0,
      8,
      'interception-02',
    );
    expect(result).toEqual({
      kind: 'rejected',
      reason: 'marker-mission-mismatch',
    });
  });

  it('rejects when no mission is in progress', () => {
    expect(
      applyMissionSuccess(
        newGame(),
        0,
        'interception-01',
        80,
        0,
        0,
        8,
        'interception-02',
      ),
    ).toEqual({ kind: 'rejected', reason: 'no-mission-in-progress' });
  });

  it('rejects invalid result values and unlock targets', () => {
    const started = beginMission(newGame(), 'interception-01', 0);
    expect(started.kind).toBe('applied');
    if (started.kind !== 'applied') {
      throw new Error('Expected the mission to start.');
    }
    expect(
      applyMissionSuccess(
        started.campaign,
        0,
        'interception-01',
        101,
        0,
        0,
        8,
        'interception-02',
      ),
    ).toEqual({ kind: 'rejected', reason: 'invalid-success-result-values' });
    expect(
      applyMissionSuccess(
        started.campaign,
        0,
        'interception-01',
        80,
        0,
        0,
        8,
        'not-a-mission' as never,
      ),
    ).toEqual({ kind: 'rejected', reason: 'invalid-unlock-target' });
  });
});
