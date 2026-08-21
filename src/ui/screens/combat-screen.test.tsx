import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCombatSession } from '@application/combat';
import { createSessionStore, initializeSession } from '@application/session';
import type { SessionStore } from '@application/session';
import type { MissionSnapshot } from '@application/mission';
import type { AssetPreloadResult } from '@application/ports';
import { CONTENT_CATALOGUE } from '@test-support/content';
import { ApplicationContext } from '../application-context';
import { CombatScreen } from './combat-screen';

vi.mock('@application/combat', () => ({
  loadCombatSession: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function storeWithActiveMission(): SessionStore {
  const store = createSessionStore();
  store.dispatch({
    type: 'session/initialized',
    session: initializeSession(3735928559, CONTENT_CATALOGUE),
  });
  const session = store.getState();
  if (session === null) {
    throw new Error('Expected an initialized session.');
  }
  const snapshot: MissionSnapshot = {
    missionInstanceOrdinal: 0,
    combatMissionSeed: 1234,
    aircraftId: session.aircraftId,
    hullIntegrity: session.hullIntegrity,
    equippedWeapon: session.equippedWeapon,
    pilot: session.pilot,
    mouseMovementEnabled: session.mouseMovementEnabled,
  };
  store.dispatch({ type: 'mission/start', snapshot });
  return store;
}

function renderScreen(store: SessionStore): {
  unmount: () => void;
} {
  const preparedAssets: AssetPreloadResult = [];
  const { unmount } = render(
    <ApplicationContext.Provider
      value={{ store, preparedAssets, content: CONTENT_CATALOGUE }}
    >
      <CombatScreen />
    </ApplicationContext.Provider>,
  );
  return { unmount };
}

describe('CombatScreen', () => {
  let disposeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    disposeSpy = vi.fn();
    (loadCombatSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      dispose: disposeSpy,
    });
  });

  it('renders nothing without an active mission', () => {
    const store = createSessionStore();
    store.dispatch({
      type: 'session/initialized',
      session: initializeSession(3735928559, CONTENT_CATALOGUE),
    });
    renderScreen(store);
    expect(screen.queryByTestId('combat-screen')).toBeNull();
  });

  it('enters the lazy Combat boundary with the snapshot and container', async () => {
    const store = storeWithActiveMission();
    renderScreen(store);
    expect(screen.getByTestId('combat-screen')).toBeDefined();
    await act(async () => {});
    expect(loadCombatSession).toHaveBeenCalledTimes(1);
    const call = (loadCombatSession as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[0].snapshot).toBe(store.getState()?.activeMission);
    expect(call?.[0].container).toBeInstanceOf(HTMLElement);
  });

  it('disposes the Combat session on unmount (disposal contract)', async () => {
    const store = storeWithActiveMission();
    const { unmount } = renderScreen(store);
    await act(async () => {});
    act(() => {
      unmount();
    });
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it('clears the mission and signals failure when the lazy boundary rejects (Base AC-014)', async () => {
    const store = storeWithActiveMission();
    (loadCombatSession as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Combat initialization failed'),
    );
    renderScreen(store);
    await act(async () => {});
    expect(store.getState()?.activeMission).toBe('none');
    expect(store.getState()?.missionStartFailed).toBe(true);
    // Base state is unchanged.
    expect(store.getState()?.credits).toBe(1);
  });
});
