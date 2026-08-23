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
import { createInitializedSessionStore } from '@test-support/session';
import { CONTENT_CATALOGUE } from '@test-support/content';
import { ApplicationContext } from '../application-context';
import { MissionResultOverlay } from './mission-result-overlay';

afterEach(() => {
  cleanup();
});

function storeWithResult(result: 'success' | 'defeat'): SessionStore {
  const store = createInitializedSessionStore();
  const session = store.getState();
  if (session === null) {
    throw new Error('Expected an initialized session.');
  }
  store.dispatch({
    type: 'mission/start',
    snapshot: {
      missionInstanceOrdinal: 0,
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
        ? {
            kind: 'success',
            missionInstanceOrdinal: 0,
            combatHullIntegrity: 80,
          }
        : { kind: 'defeat', missionInstanceOrdinal: 0 },
  });
  return store;
}

function renderOverlay(store: SessionStore): void {
  const preparedAssets: AssetPreloadResult = [];
  render(
    <ApplicationContext.Provider
      value={{ store, preparedAssets, content: CONTENT_CATALOGUE }}
    >
      <MissionResultOverlay />
    </ApplicationContext.Provider>,
  );
}

describe('MissionResultOverlay (Base §9.5, S12)', () => {
  it('shows Mission Complete / Reward: 1 Credit with focused Continue on Success', () => {
    const store = storeWithResult('success');
    renderOverlay(store);
    expect(
      screen.getByRole('heading', { name: 'Mission Complete' }),
    ).toBeDefined();
    expect(screen.getByText('Reward')).toBeDefined();
    expect(screen.getByText('1 Credit')).toBeDefined();
    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(continueButton).toBeDefined();
    expect(document.activeElement).toBe(continueButton);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('shows Mission Failed / Reward: 0 Credits on Defeat', () => {
    const store = storeWithResult('defeat');
    renderOverlay(store);
    expect(
      screen.getByRole('heading', { name: 'Mission Failed' }),
    ).toBeDefined();
    expect(screen.getByText('0 Credits')).toBeDefined();
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
