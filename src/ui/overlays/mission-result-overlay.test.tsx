import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { SessionStore } from '@application/session';
import type { AssetPreloadResult } from '@application/ports';
import {
  createInitializedSessionStore,
  successMissionResult,
} from '@test-support/session';
import { createApplicationContextValue } from '@test-support/ui';
import { CONTENT_CATALOGUE } from '@test-support/content';
import { ApplicationContext } from '../application-context';
import { MissionResultOverlay } from './mission-result-overlay';

afterEach(() => {
  cleanup();
});

function storeWithResult(
  result: 'success' | 'defeat' | 'evacuated',
): SessionStore {
  const store = createInitializedSessionStore();
  const session = store.getState();
  if (session === null) {
    throw new Error('Expected an initialized session.');
  }
  store.dispatch({
    type: 'mission/start',
    snapshot: {
      missionId: 'interception-01',
      missionInstanceOrdinal: 0,
      missionAttemptId: 0,
      combatMissionSeed: 0,
      aircraftId: session.aircraftId,
      hullIntegrity: session.hullIntegrity,
      equippedWeapon: session.equippedWeapon,
      pilot: session.pilot,
      mouseMovementEnabled: session.mouseMovementEnabled,
    },
  });
  store.dispatch({
    type: 'mission/result',
    result:
      result === 'success'
        ? successMissionResult({
            missionInstanceOrdinal: 0,
            creditsAfter: 13,
            hullIntegrityAfter: 80,
            unlockedMissionIdsAfter: ['interception-01', 'interception-02'],
            completedMissionIdsAfter: ['interception-01'],
            creditsEarned: 8,
          })
        : result === 'defeat'
          ? {
              kind: 'defeat',
              missionInstanceOrdinal: 0,
              creditsAfter: 4,
              hullIntegrityAfter: 100,
              runStatusAfter: 'active',
              repairCostCredits: 8,
            }
          : {
              kind: 'evacuated',
              missionInstanceOrdinal: 0,
              creditsAfter: 14,
              hullIntegrityAfter: 70,
              creditsEarned: 2,
              combatRewards: 5,
              escapePenalties: 1,
              netCombatReward: 4,
              destroyedCounts: {
                'basic-drone': 3,
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
              unlockedMissionIdsAfter: ['interception-01'],
              completedMissionIdsAfter: [],
            },
  });
  return store;
}

function renderOverlay(store: SessionStore): void {
  const preparedAssets: AssetPreloadResult = [];
  const value = createApplicationContextValue({
    store,
    preparedAssets,
    content: CONTENT_CATALOGUE,
  });
  render(
    <ApplicationContext.Provider value={value}>
      <MissionResultOverlay />
    </ApplicationContext.Provider>,
  );
}

describe('MissionResultOverlay (Base §9.5, S12)', () => {
  it('shows MISSION COMPLETE with the v0.2 breakdown and focused Continue on Success', () => {
    const store = storeWithResult('success');
    renderOverlay(store);
    expect(
      screen.getByRole('heading', { name: 'MISSION COMPLETE' }),
    ).toBeDefined();
    expect(screen.getByText('Destroyed')).toBeDefined();
    expect(screen.getByText('Escaped')).toBeDefined();
    expect(screen.getByText('Combat rewards')).toBeDefined();
    expect(screen.getByText('Completion reward')).toBeDefined();
    expect(screen.getByText('Escape penalties')).toBeDefined();
    expect(screen.getByText('8 Credits')).toBeDefined();
    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(continueButton).toBeDefined();
    expect(document.activeElement).toBe(continueButton);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('shows MISSION FAILED with the v0.2 reward/repair rows on an affordable-Repair Defeat (Epic §15.4)', () => {
    const store = storeWithResult('defeat');
    renderOverlay(store);
    expect(
      screen.getByRole('heading', { name: 'MISSION FAILED' }),
    ).toBeDefined();
    expect(screen.getByText('Mission reward')).toBeDefined();
    expect(screen.getByText('0 Credits')).toBeDefined();
    expect(screen.getByText('Repair cost')).toBeDefined();
    expect(screen.getByText('-8 Credits')).toBeDefined();
  });

  it('shows EVACUATED with the frozen counts, retained 50%, and not-completed note (Epic §15.4)', () => {
    const store = storeWithResult('evacuated');
    renderOverlay(store);
    expect(screen.getByRole('heading', { name: 'EVACUATED' })).toBeDefined();
    expect(screen.getByText('Destroyed')).toBeDefined();
    expect(screen.getByText('Escaped')).toBeDefined();
    expect(screen.getByText('Retained 50%')).toBeDefined();
    expect(screen.getByText('+2 Credits')).toBeDefined();
    expect(screen.getByText('Mission not completed')).toBeDefined();
    // No completion reward or unlock rows exist for an Evacuation.
    expect(screen.queryByText('Completion reward')).toBeNull();
    expect(screen.queryByText('Mission unlocked')).toBeNull();
  });

  it('renders nothing when no result is pending', () => {
    const store = createInitializedSessionStore();
    renderOverlay(store);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Continue clears the consumed result boundary without reapplying effects', () => {
    const store = storeWithResult('success');
    renderOverlay(store);
    const creditsBefore = store.getState()!.credits;
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    });
    expect(store.getState()!.missionResult).toBeNull();
    expect(store.getState()!.credits).toBe(creditsBefore); // never reapplied
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Esc does not close the only continuation point', () => {
    const store = storeWithResult('defeat');
    renderOverlay(store);
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(store.getState()!.missionResult).toMatchObject({
      kind: 'defeat',
      missionInstanceOrdinal: 0,
    });
    expect(screen.getByRole('dialog')).toBe(dialog);
  });

  it('Continue dispatches consumption bound to the presented Mission Instance', () => {
    const store = storeWithResult('success');
    renderOverlay(store);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    });
    expect(store.getState()!.missionResult).toBeNull();
  });

  it('a stale Continue for another Mission Instance cannot clear the presented result', () => {
    const store = storeWithResult('success'); // presented result bound to ordinal 0
    renderOverlay(store);
    act(() => {
      // A Continue command originating from an older/newer mission (ordinal 999)
      // must remain a strict no-op: the presented result is ordinal 0.
      store.dispatch({
        type: 'mission/result-consumed',
        missionInstanceOrdinal: 999,
      });
    });
    expect(store.getState()!.missionResult).toMatchObject({
      kind: 'success',
      missionInstanceOrdinal: 0,
    });
    expect(screen.getByRole('dialog')).toBeDefined();
  });
});
