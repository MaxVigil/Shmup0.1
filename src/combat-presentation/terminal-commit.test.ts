import { describe, expect, it } from 'vitest';
import type {
  CommitMissionResultResult,
  MissionResult,
  SuccessEconomyRelay,
} from '@application/mission';
import type { TerminalCommitOutcome } from '@application/combat';
import {
  createFrozenTerminalPayload,
  createTerminalRetryController,
  mapCommitMissionOutcome,
  terminalCommitDisposition,
} from './terminal-commit';

const successResult: MissionResult = {
  kind: 'success',
  missionInstanceOrdinal: 1,
  creditsAfter: 140,
  hullIntegrityAfter: 60,
  creditsEarned: 40,
  combatRewards: 30,
  escapePenalties: 0,
  netCombatReward: 30,
  completionReward: 10,
  newlyUnlockedMissionId: null,
  destroyedCounts: {
    'basic-drone': 1,
    'ranged-drone': 0,
    'hunter-drone': 1,
    'elite-drone': 0,
  },
  escapedCounts: {
    'basic-drone': 0,
    'ranged-drone': 0,
    'hunter-drone': 0,
    'elite-drone': 0,
  },
  unlockedMissionIdsAfter: ['interception-02'],
  completedMissionIdsAfter: ['interception-01'],
};

const defeatResult: MissionResult = {
  kind: 'defeat',
  missionInstanceOrdinal: 1,
  creditsAfter: 100,
  hullIntegrityAfter: 60,
};

describe('terminalCommitDisposition (V02-WI-04 C02)', () => {
  it('maps a committed Success to authorize-success carrying the result', () => {
    const outcome: TerminalCommitOutcome = {
      status: 'committed',
      result: successResult,
    };
    expect(terminalCommitDisposition(outcome)).toEqual({
      kind: 'authorize-success',
      result: successResult,
    });
  });

  it('maps a committed Defeat to recover without any result', () => {
    const outcome: TerminalCommitOutcome = {
      status: 'committed',
      result: defeatResult,
    };
    expect(terminalCommitDisposition(outcome)).toEqual({ kind: 'recover' });
  });

  it('maps an inert outcome to save-conflict', () => {
    expect(terminalCommitDisposition({ status: 'inert' })).toEqual({
      kind: 'save-conflict',
    });
  });

  it('maps a failed outcome to save-error', () => {
    expect(terminalCommitDisposition({ status: 'failed' })).toEqual({
      kind: 'save-error',
    });
  });

  it('maps a rejected outcome to save-error (never surfaces the rejection)', () => {
    expect(
      terminalCommitDisposition({
        status: 'rejected',
        error: new Error('boom'),
      }),
    ).toEqual({ kind: 'save-error' });
  });
});

describe('mapCommitMissionOutcome (V02-WI-04 C02 binding adapter)', () => {
  it('maps a committed command result to a committed outcome', () => {
    const result: CommitMissionResultResult = {
      outcome: 'committed',
      result: successResult,
    };
    expect(mapCommitMissionOutcome(result)).toEqual({
      status: 'committed',
      result: successResult,
    });
  });

  it('maps an inert command result to an inert outcome', () => {
    const result: CommitMissionResultResult = {
      outcome: 'inert',
      result: null,
    };
    expect(mapCommitMissionOutcome(result)).toEqual({ status: 'inert' });
  });

  it('maps a failed command result to a failed outcome', () => {
    const result: CommitMissionResultResult = {
      outcome: 'failed',
      result: null,
    };
    expect(mapCommitMissionOutcome(result)).toEqual({ status: 'failed' });
  });

  it('defensively maps an impossible committed-null result to failed', () => {
    const result = { outcome: 'committed', result: null } as const;
    expect(mapCommitMissionOutcome(result)).toEqual({ status: 'failed' });
  });
});

describe('createFrozenTerminalPayload (V02-WI-04 C02)', () => {
  it('freezes the first relay exactly once and every later freeze is ignored', () => {
    const payload = createFrozenTerminalPayload();
    const first: SuccessEconomyRelay = {
      combatRewards: 30,
      escapePenalties: 0,
      destroyedCounts: {
        'basic-drone': 2,
        'ranged-drone': 0,
        'hunter-drone': 0,
        'elite-drone': 0,
      },
      escapedCounts: {
        'basic-drone': 0,
        'ranged-drone': 0,
        'hunter-drone': 0,
        'elite-drone': 0,
      },
    };
    const second: SuccessEconomyRelay = {
      combatRewards: 99,
      escapePenalties: 5,
      destroyedCounts: {
        'basic-drone': 0,
        'ranged-drone': 0,
        'hunter-drone': 0,
        'elite-drone': 0,
      },
      escapedCounts: {
        'basic-drone': 0,
        'ranged-drone': 0,
        'hunter-drone': 0,
        'elite-drone': 0,
      },
    };
    expect(payload.freezeEconomy(first)).toBe(first);
    expect(payload.freezeEconomy(second)).toBe(first);
    expect(payload.currentEconomy()).toBe(first);
  });

  it('exposes null until the first relay freezes a payload', () => {
    const payload = createFrozenTerminalPayload();
    expect(payload.currentEconomy()).toBeNull();
  });
});

describe('createTerminalRetryController (V02-WI-04 C02)', () => {
  it('is single-flight: a second begin while in flight is rejected', () => {
    const controller = createTerminalRetryController();
    expect(controller.beginRetry()).toBe(true);
    expect(controller.beginRetry()).toBe(false);
  });

  it('releases after finish, allowing a repeated retry after a repeated failure', () => {
    const controller = createTerminalRetryController();
    expect(controller.beginRetry()).toBe(true);
    controller.finishRetry();
    expect(controller.beginRetry()).toBe(true);
    controller.finishRetry();
    expect(controller.beginRetry()).toBe(true);
  });
});
