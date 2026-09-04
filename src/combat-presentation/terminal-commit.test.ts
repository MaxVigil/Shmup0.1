import { describe, expect, it } from 'vitest';
import type {
  CommitMissionResultResult,
  MissionResult,
  SuccessEconomyRelay,
} from '@application/mission';
import type { SessionState } from '@application/session';
import type { TerminalCommitOutcome } from '@application/combat';
import {
  createFrozenTerminalPayload,
  createTerminalRetryController,
  mapCommitMissionOutcome,
  mayPresentHeldDefeat,
  ownsTerminalSnapshot,
  planCommittedTerminal,
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
  hullIntegrityAfter: 100,
  runStatusAfter: 'active',
  repairCostCredits: 8,
};

/** A committed Evacuation result shares the Success relay shape minus its
 *  economy-specific meaning; built from the same committed-payload surface. */
const evacuatedResult: MissionResult = {
  ...successResult,
  kind: 'evacuated',
};

describe('terminalCommitDisposition (V02-WI-04 C02)', () => {
  it('maps a committed Success to authorize-exit carrying the result', () => {
    const outcome: TerminalCommitOutcome = {
      status: 'committed',
      result: successResult,
    };
    expect(terminalCommitDisposition(outcome)).toEqual({
      kind: 'authorize-exit',
      result: successResult,
    });
  });

  it('maps a committed Evacuation to authorize-exit carrying the result (V02-WI-05)', () => {
    const outcome: TerminalCommitOutcome = {
      status: 'committed',
      result: evacuatedResult,
    };
    expect(terminalCommitDisposition(outcome)).toEqual({
      kind: 'authorize-exit',
      result: evacuatedResult,
    });
  });

  it('maps a committed Defeat to present-defeat carrying the immutable result (V02-WI-05 C03)', () => {
    const outcome: TerminalCommitOutcome = {
      status: 'committed',
      result: defeatResult,
    };
    // The command no longer navigates: the committed result is returned to the
    // lifecycle boundary, which dispatches it only when presentation is safe
    // or holds it behind the explicit Resume-only continuation.
    expect(terminalCommitDisposition(outcome)).toEqual({
      kind: 'present-defeat',
      result: defeatResult,
    });
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

describe('V02-WI-05 C04 terminal boundary plan (planCommittedTerminal)', () => {
  const identity = {
    missionId: 'interception-01',
    missionAttemptId: 7,
    missionInstanceOrdinal: 1,
  };

  function sessionWith(
    missionInstanceOrdinal = 1,
    missionAttemptId = 7,
    missionId = 'interception-01',
    latched = false,
    overlay: 'none' | 'terminal-exit-pause' | 'pause' = 'none',
    running = true,
  ): SessionState {
    return {
      activeMission: {
        missionId,
        missionAttemptId,
        missionInstanceOrdinal,
      },
      combatLifecycle: {
        running,
        overlay,
        browserSafetyLatched: latched,
      },
    } as unknown as SessionState;
  }

  it('rejects any completion that no longer owns the exact mission + durable attempt as stale', () => {
    const committed = {
      status: 'committed',
      result: defeatResult,
    } as const satisfies TerminalCommitOutcome;
    expect(planCommittedTerminal(committed, null, identity)).toEqual({
      kind: 'stale',
    });
    // Same session ordinal but a different durable attempt (restart scenario).
    expect(
      planCommittedTerminal(committed, sessionWith(1, 99), identity),
    ).toEqual({ kind: 'stale' });
    // Same ordinal + attempt but a different mission.
    expect(
      planCommittedTerminal(
        committed,
        sessionWith(1, 7, 'interception-02'),
        identity,
      ),
    ).toEqual({ kind: 'stale' });
    // A committed payload bound to a different instance ordinal is stale even
    // when the session snapshot happens to match this owner's ordinal.
    expect(
      planCommittedTerminal(
        {
          status: 'committed',
          result: { ...defeatResult, missionInstanceOrdinal: 9 },
        },
        sessionWith(),
        identity,
      ),
    ).toEqual({ kind: 'stale' });
  });

  it('ownsTerminalSnapshot requires the exact mission id, attempt id, and ordinal', () => {
    expect(ownsTerminalSnapshot(sessionWith(), identity)).toBe(true);
    expect(ownsTerminalSnapshot(sessionWith(2, 7), identity)).toBe(false);
    expect(ownsTerminalSnapshot(sessionWith(1, 8), identity)).toBe(false);
    expect(
      ownsTerminalSnapshot(sessionWith(1, 7, 'interception-02'), identity),
    ).toBe(false);
    expect(ownsTerminalSnapshot(null, identity)).toBe(false);
  });

  it('presents a committed Defeat immediately only when no safety latch is set', () => {
    const outcome = {
      status: 'committed',
      result: defeatResult,
    } as const;
    expect(planCommittedTerminal(outcome, sessionWith(), identity)).toEqual({
      kind: 'present',
      result: defeatResult,
    });
  });

  it('holds a committed Defeat/Game Over under the browser-safety latch for explicit Resume', () => {
    const outcome = {
      status: 'committed',
      result: defeatResult,
    } as const;
    expect(
      planCommittedTerminal(
        outcome,
        sessionWith(1, 7, 'interception-01', true),
        identity,
      ),
    ).toEqual({ kind: 'hold', result: defeatResult });
  });

  it('maps committed Success/Evacuation to authorize-exit and failed/inert outcomes to Save Error/Conflict', () => {
    const success = { status: 'committed', result: successResult } as const;
    expect(planCommittedTerminal(success, sessionWith(), identity)).toEqual({
      kind: 'authorize-exit',
      result: successResult,
    });
    expect(
      planCommittedTerminal({ status: 'inert' }, sessionWith(), identity),
    ).toEqual({ kind: 'save-conflict' });
    expect(
      planCommittedTerminal({ status: 'failed' }, sessionWith(), identity),
    ).toEqual({ kind: 'save-error' });
  });

  it('mayPresentHeldDefeat is true only after an explicit Resume on the exact snapshot', () => {
    // Held behind the terminal-exit Pause: not presentable yet.
    expect(
      mayPresentHeldDefeat(
        sessionWith(
          1,
          7,
          'interception-01',
          true,
          'terminal-exit-pause',
          false,
        ),
        identity,
      ),
    ).toBe(false);
    // After Resume: running with no Overlay.
    expect(mayPresentHeldDefeat(sessionWith(), identity)).toBe(true);
    // A newer attempt or mission can never be presented by this owner.
    expect(mayPresentHeldDefeat(sessionWith(1, 99), identity)).toBe(false);
    expect(
      mayPresentHeldDefeat(sessionWith(1, 7, 'interception-02'), identity),
    ).toBe(false);
  });
});
