import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCombatSession } from '@application/combat';
import { createSessionStore, initializeSession } from '@application/session';
import type { SessionStore } from '@application/session';
import type { MissionSnapshot } from '@application/mission';
import type { AssetPreloadResult } from '@application/ports';
import { CONTENT_CATALOGUE } from '@test-support/content';
import { createApplicationContextValue } from '@test-support/ui';
import { ApplicationContext } from '../application-context';
import { SessionRouter } from './session-router';

vi.mock('@application/combat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@application/combat')>();
  return { ...actual, loadCombatSession: vi.fn() };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRouter(store: SessionStore): void {
  const preparedAssets: AssetPreloadResult = [];
  render(
    <ApplicationContext.Provider
      value={createApplicationContextValue({
        store,
        preparedAssets,
        content: CONTENT_CATALOGUE,
      })}
    >
      <SessionRouter />
    </ApplicationContext.Provider>,
  );
}

function startMissionIn(store: SessionStore): void {
  const session = store.getState();
  if (session === null) {
    throw new Error('Expected an initialized session.');
  }
  const snapshot: MissionSnapshot = {
    missionId: 'interception-01',
    missionInstanceOrdinal: 0,
    missionAttemptId: 0,
    combatMissionSeed: 1234,
    aircraftId: session.aircraftId,
    hullIntegrity: session.hullIntegrity,
    equippedWeapon: session.equippedWeapon,
    pilot: session.pilot,
    mouseMovementEnabled: session.mouseMovementEnabled,
  };
  store.dispatch({ type: 'mission/start', snapshot });
}

describe('SessionRouter', () => {
  beforeEach(() => {
    (loadCombatSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      dispose: vi.fn(),
      requestReturnToBase: vi.fn(),
      setControlMode: vi.fn(),
      submitDebugCommand: vi.fn(),
      getObservability: vi.fn(),
    });
  });

  it('renders Base without an active mission', () => {
    const store = createSessionStore();
    store.dispatch({
      type: 'session/initialized',
      session: initializeSession(3735928559, CONTENT_CATALOGUE),
    });
    renderRouter(store);
    expect(screen.getByTestId('operations-screen')).toBeDefined();
    expect(screen.queryByTestId('combat-screen')).toBeNull();
  });

  it('switches to Combat when a mission snapshot becomes active and back to Base when it clears', async () => {
    const store = createSessionStore();
    store.dispatch({
      type: 'session/initialized',
      session: initializeSession(3735928559, CONTENT_CATALOGUE),
    });
    renderRouter(store);
    expect(screen.getByTestId('operations-screen')).toBeDefined();

    act(() => {
      startMissionIn(store);
    });
    await act(async () => {});
    expect(screen.getByTestId('combat-screen')).toBeDefined();
    expect(screen.queryByTestId('operations-screen')).toBeNull();

    // A mission result/abort later returns to Base (S12/S13); here the failure
    // path demonstrates the same switch.
    act(() => {
      store.dispatch({
        type: 'mission/start-failed',
        missionId: 'interception-01',
        missionAttemptId: 0,
        missionInstanceOrdinal: 0,
      });
    });
    expect(screen.getByTestId('operations-screen')).toBeDefined();
    expect(screen.queryByTestId('combat-screen')).toBeNull();
  });
});
