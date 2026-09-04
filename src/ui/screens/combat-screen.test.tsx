import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCombatSession } from '@application/combat';
import type { CombatSession } from '@application/combat';
import { createSessionStore, initializeSession } from '@application/session';
import type { SessionStore } from '@application/session';
import type { MissionSnapshot } from '@application/mission';
import type { AssetPreloadResult } from '@application/ports';
import type {
  CampaignReadResult,
  CampaignStartOutcome,
  CampaignStorePort,
  CampaignUpdateOutcome,
} from '@application/persistence';
import type { CampaignStateV1, MissionId } from '@domain/index';
import type { CampaignTransitionResult } from '@domain/index';
import { CONTENT_CATALOGUE } from '@test-support/content';
import {
  ALL_ICONS_READY,
  createApplicationContextValue,
} from '@test-support/ui/application-provider';
import { buildNewGameCampaign } from '@application/persistence';
import {
  InMemoryCampaignStore,
  campaignSchemaContext,
} from '@test-support/persistence';
import { ApplicationContext } from '../application-context';
import { CombatScreen } from './combat-screen';

/**
 * V02-DEC-031 DOM helper: a campaign store whose `update` throws for the first
 * invocation and then delegates to the real in-memory store, so a Combat
 * initialization failure can be exercised through the real recovery shell and
 * a later Retry Cleanup can succeed against the restored durable state.
 */
class FailFirstUpdateCampaignStore implements CampaignStorePort {
  failing = true;

  constructor(private readonly delegate: InMemoryCampaignStore) {}

  async read(): Promise<CampaignReadResult> {
    return this.delegate.read();
  }

  async update(
    transform: (current: CampaignStateV1) => CampaignTransitionResult,
  ): Promise<CampaignUpdateOutcome> {
    if (this.failing) {
      this.failing = false;
      throw new Error('Simulated persistence infrastructure failure');
    }
    return this.delegate.update(transform);
  }

  async startMission(): Promise<CampaignStartOutcome> {
    return this.delegate.startMission('interception-01' as MissionId);
  }

  async replace(next: CampaignStateV1): Promise<void> {
    return this.delegate.replace(next);
  }
}

vi.mock('@application/combat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@application/combat')>();
  return { ...actual, loadCombatSession: vi.fn() };
});

// S13: the Debug Overlay is lazy-loaded only in development builds; the mock
// keeps the CombatScreen tests deterministic without loading the real module.
vi.mock('@ui/overlays/debug-overlay', () => ({
  DebugOverlay: () => <div data-testid="debug-overlay-mock">Debug</div>,
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
  return store;
}

function renderScreen(
  store: SessionStore,
  assets: AssetPreloadResult = [],
): {
  unmount: () => void;
} {
  const preparedAssets: AssetPreloadResult = assets;
  const value = createApplicationContextValue({
    store,
    preparedAssets,
    content: CONTENT_CATALOGUE,
  });
  // Mirror the real before-state: the persisted New Game campaign carries the
  // missionInProgress marker before Combat becomes active (Epic §13.2), so the
  // bound abort/terminal commands can commit through the in-memory store.
  const session = store.getState();
  if (session !== null) {
    const campaign = buildNewGameCampaign(
      CONTENT_CATALOGUE,
      session.sessionSeed,
    );
    void value.campaignStore.replace({
      ...campaign,
      missionInProgress: { missionId: 'interception-01', attemptId: 0 },
    });
  }
  const { unmount } = render(
    <ApplicationContext.Provider value={value}>
      <CombatScreen />
    </ApplicationContext.Provider>,
  );
  return { unmount };
}

describe('CombatScreen', () => {
  let disposeSpy: ReturnType<typeof vi.fn>;
  let requestReturnToBase: ReturnType<typeof vi.fn>;
  let setControlMode: ReturnType<typeof vi.fn>;
  let submitDebugCommand: ReturnType<typeof vi.fn>;
  let getObservability: ReturnType<typeof vi.fn>;
  let sessionMock: CombatSession;

  beforeEach(() => {
    disposeSpy = vi.fn();
    requestReturnToBase = vi.fn();
    setControlMode = vi.fn();
    submitDebugCommand = vi.fn();
    getObservability = vi.fn().mockReturnValue({
      missionTimeSeconds: 0,
      playerHullIntegrity: 100,
      godModeEnabled: false,
      activeEnemies: 0,
      destroyedEnemies: 0,
      escapedEnemies: 0,
      finalGroupSpawned: false,
    });
    sessionMock = {
      dispose: disposeSpy,
      requestReturnToBase,
      setControlMode,
      submitDebugCommand,
      getObservability,
    } as unknown as CombatSession;
    (loadCombatSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      sessionMock,
    );
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
    expect(call?.[0].store).toBe(store);
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
    expect(store.getState()?.credits).toBe(12);
  });

  it('renders the utility cluster with Pause and Settings controls (DS §8.21)', async () => {
    const store = storeWithActiveMission();
    renderScreen(store, ALL_ICONS_READY);
    await act(async () => {});
    const utility = screen.getByTestId('combat-utility');
    // The cluster exposes the icon-only Pause then Settings in the approved
    // order, with the accessible names Pause/Settings (DS §8.21, §10.8).
    expect(utility.querySelector('[aria-label="Pause"]')).not.toBeNull();
    expect(utility.querySelector('[aria-label="Settings"]')).not.toBeNull();
    const buttons = utility.querySelectorAll('button');
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Pause');
    expect(buttons[1]?.getAttribute('aria-label')).toBe('Settings');
  });
  it('opens the Pause Overlay from the Pause Button and resumes (AC-052)', async () => {
    const store = storeWithActiveMission();
    renderScreen(store);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('heading', { name: 'Paused' })).toBeDefined();
    const resume = screen.getByRole('button', { name: 'Resume' });
    expect(resume).toBeDefined();
    // The utility buttons are disabled while a blocking Overlay is open.
    expect(
      (screen.getByRole('button', { name: 'Pause' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(resume);
    expect(screen.queryByRole('heading', { name: 'Paused' })).toBeNull();
    expect(store.getState()?.combatLifecycle.overlay).toBe('none');
    expect(store.getState()?.combatLifecycle.running).toBe(true);
  });

  it('P toggles Pause and resume through the window key handler', async () => {
    const store = storeWithActiveMission();
    renderScreen(store);
    await act(async () => {});
    fireEvent.keyDown(window, { code: 'KeyP' });
    expect(screen.getByRole('heading', { name: 'Paused' })).toBeDefined();
    fireEvent.keyDown(window, { code: 'KeyP' });
    expect(screen.queryByRole('heading', { name: 'Paused' })).toBeNull();
  });

  it('Return to Base relays the S12 abort seam through the session', async () => {
    const store = storeWithActiveMission();
    renderScreen(store);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.click(screen.getByRole('button', { name: 'Return to Base' }));
    expect(requestReturnToBase).toHaveBeenCalledTimes(1);
  });

  it('opens the shared Settings Overlay from the cluster and closes via Esc (AC-038)', async () => {
    const store = storeWithActiveMission();
    renderScreen(store);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeDefined();
    expect(store.getState()?.combatLifecycle.running).toBe(false);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('heading', { name: 'Settings' })).toBeNull();
    expect(store.getState()?.combatLifecycle.running).toBe(true);
  });

  it('development F1 opens Debug and Escape closes it through the matrix', async () => {
    const store = storeWithActiveMission();
    renderScreen(store);
    await act(async () => {});
    fireEvent.keyDown(window, { code: 'F1' });
    await act(async () => {});
    expect(store.getState()?.combatLifecycle.overlay).toBe('debug');
    expect(screen.getByTestId('debug-overlay-mock')).toBeDefined();
    fireEvent.keyDown(window, { code: 'F1' });
    await act(async () => {});
    expect(store.getState()?.combatLifecycle.overlay).toBe('none');
    expect(screen.queryByTestId('debug-overlay-mock')).toBeNull();
  });

  it('shared Settings changes are relayed to the simulation for use on Resume (AC-038)', async () => {
    const store = storeWithActiveMission();
    renderScreen(store);
    await act(async () => {});
    store.dispatch({
      type: 'session/set-mouse-movement-enabled',
      enabled: false,
    });
    await act(async () => {});
    expect(setControlMode).toHaveBeenCalledWith('keyboard');
  });
  it('F1 does not open Debug before the Combat owner is ready (S13-WI01)', async () => {
    const store = storeWithActiveMission();
    let resolveLoad: ((value: CombatSession) => void) | undefined;
    (loadCombatSession as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => {
        resolveLoad = resolve;
      }),
    );
    renderScreen(store);
    await act(async () => {});
    // The owner is still loading: F1 must not open a Debug Overlay with
    // unavailable observability or no-op actions.
    fireEvent.keyDown(window, { code: 'F1' });
    await act(async () => {});
    expect(store.getState()?.combatLifecycle.overlay).toBe('none');

    // Once the owner attaches, F1 opens Debug normally.
    act(() => {
      resolveLoad?.(sessionMock);
    });
    await act(async () => {});
    fireEvent.keyDown(window, { code: 'F1' });
    await act(async () => {});
    expect(store.getState()?.combatLifecycle.overlay).toBe('debug');
  });

  it('reconciles the simulation mode on owner attachment from the current shared Settings value (S13-WI01)', async () => {
    const store = storeWithActiveMission();
    let resolveLoad: ((value: CombatSession) => void) | undefined;
    (loadCombatSession as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => {
        resolveLoad = resolve;
      }),
    );
    renderScreen(store);
    await act(async () => {});
    // The shared Setting changes while the owner is still loading.
    store.dispatch({
      type: 'session/set-mouse-movement-enabled',
      enabled: false,
    });
    act(() => {
      resolveLoad?.(sessionMock);
    });
    await act(async () => {});
    // Attachment reconciles the simulation mode from the CURRENT shared value.
    expect(setControlMode).toHaveBeenCalledWith('keyboard');
  });

  it('early Return to Base uses the snapshot fallback and prevents late owner creation (S13-WI01)', async () => {
    const store = storeWithActiveMission();
    let releaseImport: (() => void) | undefined;
    const createOwner = vi.fn(() => sessionMock);
    (loadCombatSession as ReturnType<typeof vi.fn>).mockImplementation(
      (
        _input: unknown,
        mayCreate: () => boolean,
      ): Promise<CombatSession | null> =>
        new Promise((resolve) => {
          releaseImport = () => resolve(mayCreate() ? createOwner() : null);
        }),
    );
    renderScreen(store);
    await act(async () => {});
    // Open Pause before the owner loads, then select Return to Base.
    fireEvent.keyDown(window, { code: 'KeyP' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Return to Base' }));
    });
    await act(async () => {});
    // The S12 abort seam used the immutable snapshot identity + Hull and
    // committed through the persisted campaign transaction first.
    expect(store.getState()?.activeMission).toBe('none');
    expect(store.getState()?.missionResult).toBeNull();
    // Resolve the lazy import after Abort. The post-import creation guard must
    // reject it before a presentation owner, runtime, canvas, or listener can
    // be created.
    act(() => {
      releaseImport?.();
    });
    await act(async () => {});
    expect(createOwner).not.toHaveBeenCalled();
    expect(disposeSpy).not.toHaveBeenCalled();
    // The mission stays resolved to Operations with no late-owner side effect.
    expect(store.getState()?.activeMission).toBe('none');
  });

  it('blur/visibility during loading produces one identity-bound safety Pause (S13-WI01)', async () => {
    const store = storeWithActiveMission();
    (loadCombatSession as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    );
    const { unmount } = renderScreen(store);
    await act(async () => {});
    // A focus-loss event while the owner is still loading still pauses.
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(store.getState()?.combatLifecycle.overlay).toBe('pause');
    expect(store.getState()?.combatLifecycle.running).toBe(false);
    // Cleanup removes the listeners: late events after unmount are inert.
    act(() => {
      unmount();
    });
    act(() => {
      window.dispatchEvent(new Event('blur'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(store.getState()?.combatLifecycle.overlay).toBe('pause');
  });

  it('a rejected Combat initialization whose exact cleanup cannot be proven safe opens the blocking Mission Start Recovery Error shell; Retry Cleanup reconciles once the durable store recovers (V02-DEC-031)', async () => {
    const store = storeWithActiveMission();
    const session = store.getState();
    if (session === null || session.activeMission === 'none') {
      throw new Error('Expected an Active Mission.');
    }
    const delegate = new InMemoryCampaignStore(
      campaignSchemaContext(CONTENT_CATALOGUE),
    );
    const campaignStore = new FailFirstUpdateCampaignStore(delegate);
    await campaignStore.replace({
      ...buildNewGameCampaign(CONTENT_CATALOGUE, session.sessionSeed),
      missionInProgress: {
        missionId: session.activeMission.missionId,
        attemptId: session.activeMission.missionAttemptId,
      },
    });
    (loadCombatSession as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Combat initialization failed'),
    );
    const preparedAssets: AssetPreloadResult = [];
    const value = createApplicationContextValue({
      store,
      preparedAssets,
      content: CONTENT_CATALOGUE,
      campaignStore,
    });
    const { unmount } = render(
      <ApplicationContext.Provider value={value}>
        <CombatScreen />
      </ApplicationContext.Provider>,
    );
    await act(async () => {});

    // Frozen non-interactive Combat shell with exactly the blocking Overlay.
    expect(
      screen.getByRole('heading', { name: 'Mission Start Recovery Error' }),
    ).toBeDefined();
    expect(
      screen.getByText('Retry cleanup to return to Mission Details.'),
    ).toBeDefined();
    expect(store.getState()?.combatLifecycle.overlay).toBe(
      'mission-start-recovery-error',
    );
    expect(store.getState()?.combatLifecycle.running).toBe(false);
    expect(store.getState()?.activeMission).not.toBe('none');
    expect(store.getState()?.missionStartFailed).toBe(false);
    expect(store.getState()?.missionResult).toBeNull();
    // No Phaser/simulation owner or canvas exists in the shell.
    expect(
      screen.getByTestId('combat-screen').querySelector('canvas'),
    ).toBeNull();
    // Combat utility controls are disabled behind the blocking Overlay.
    expect(
      (screen.getByRole('button', { name: 'Pause' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Settings' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    // Esc, P, and blur cannot close or replace the blocking Overlay.
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.keyDown(window, { code: 'KeyP' });
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(store.getState()?.combatLifecycle.overlay).toBe(
      'mission-start-recovery-error',
    );
    expect(
      screen.getByRole('heading', { name: 'Mission Start Recovery Error' }),
    ).toBeDefined();

    // Retry Cleanup re-runs the SAME originating cleanup; the durable store
    // has recovered, so the exact marker is cleared and the session
    // reconciles to Mission Details with `Unable to start mission.`.
    fireEvent.click(screen.getByRole('button', { name: 'Retry Cleanup' }));
    await act(async () => {});
    expect(store.getState()?.activeMission).toBe('none');
    expect(store.getState()?.missionStartFailed).toBe(true);
    expect(store.getState()?.combatLifecycle.overlay).toBe('none');
    expect(store.getState()?.credits).toBe(12);
    expect(store.getState()?.hullIntegrity).toBe(100);
    unmount();
  });
});
