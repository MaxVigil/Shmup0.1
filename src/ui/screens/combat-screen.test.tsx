import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
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
  let setControlMode: ReturnType<typeof vi.fn>;
  let submitDebugCommand: ReturnType<typeof vi.fn>;
  let getObservability: ReturnType<typeof vi.fn>;
  let sessionMock: CombatSession;

  beforeEach(() => {
    disposeSpy = vi.fn();
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

  it('renders the utility cluster with Evacuate, Pause and Settings controls (DS §8.21, §8.26)', async () => {
    const store = storeWithActiveMission();
    renderScreen(store, ALL_ICONS_READY);
    await act(async () => {});
    const utility = screen.getByTestId('combat-utility');
    // V02-WI-05 E03: the approved v0.2 order is the destructive text Evacuate
    // first, then the icon-only Pause and Settings controls (DS §8.26).
    expect(utility.querySelector('[aria-label="Pause"]')).not.toBeNull();
    expect(utility.querySelector('[aria-label="Settings"]')).not.toBeNull();
    const buttons = utility.querySelectorAll('button');
    expect(buttons[0]?.textContent).toBe('Evacuate');
    expect(buttons[0]?.className).toContain('ds-button--destructive');
    expect(buttons[1]?.getAttribute('aria-label')).toBe('Pause');
    expect(buttons[2]?.getAttribute('aria-label')).toBe('Settings');
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

  it('the removed Return to Base abort seam exposes no action and no session seam (V02-WI-05 E01/E03)', async () => {
    const store = storeWithActiveMission();
    renderScreen(store);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('heading', { name: 'Paused' })).toBeDefined();
    // E01 removed the temporary Return to Base action; E03 replaces it with the
    // final v0.2 destructive Evacuate action alongside the primary Resume.
    const pauseDialog = screen.getByRole('dialog');
    expect(
      within(pauseDialog).queryByRole('button', { name: 'Return to Base' }),
    ).toBeNull();
    const actions = within(pauseDialog).getAllByRole('button');
    expect(actions.map((action) => action.textContent)).toEqual([
      'Resume',
      'Evacuate',
    ]);
    // The session object itself no longer carries the instant-abort relay.
    expect(
      (sessionMock as unknown as Record<string, unknown>).requestReturnToBase,
    ).toBeUndefined();
    // Resume still works; the mission remains active (nothing resolved it).
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(store.getState()?.activeMission).not.toBe('none');
  });

  it('renders the canonical utility order Evacuate, Pause, Settings while Evacuation is eligible (DS §8.26)', async () => {
    const store = storeWithActiveMission();
    renderScreen(store, ALL_ICONS_READY);
    await act(async () => {});
    const utility = screen.getByTestId('combat-utility');
    const buttons = Array.from(utility.querySelectorAll('button'));
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Evacuate',
      '',
      '',
    ]);
    expect(buttons[0]?.className).toContain('ds-button--destructive');
    expect(buttons[1]?.getAttribute('aria-label')).toBe('Pause');
    expect(buttons[2]?.getAttribute('aria-label')).toBe('Settings');
    expect(buttons[0]?.disabled).toBe(false);
  });

  it('opens the exact blocking Evacuate? confirmation from active Combat and restores running on Cancel (Epic §13.4, §15.5)', async () => {
    const store = storeWithActiveMission();
    renderScreen(store, ALL_ICONS_READY);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Evacuate' }));

    // The exact approved confirmation content and action contract.
    const dialog = screen.getByRole('dialog');
    expect(screen.getByRole('heading', { name: 'Evacuate?' })).toBeDefined();
    expect(
      within(dialog).getByText(
        'Evacuation takes 5 seconds. Combat continues during the countdown.',
      ),
    ).toBeDefined();
    expect(
      within(dialog).getByText(
        'You will retain 50% of net combat rewards. The mission will not be completed and the next mission will not unlock.',
      ),
    ).toBeDefined();
    const actions = within(dialog).getAllByRole('button');
    expect(actions.map((action) => action.textContent)).toEqual([
      'Cancel',
      'Confirm Evacuation',
    ]);
    expect(document.activeElement).toBe(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    );
    // The application-owned lifecycle recorded the running origin and paused.
    let lifecycle = store.getState()!.combatLifecycle;
    expect(lifecycle.overlay).toBe('evacuation-confirmation');
    expect(lifecycle.running).toBe(false);
    expect(lifecycle.evacuationConfirmationOrigin).toBe('running');
    expect(lifecycle.evacuationCommitted).toBe(false);

    // Cancel restores the exact prior running state and returns focus to the
    // still-existing cluster affordance (DS §8.5, DS-AC-005; V02-WI-05 E04).
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    lifecycle = store.getState()!.combatLifecycle;
    expect(lifecycle.overlay).toBe('none');
    expect(lifecycle.running).toBe(true);
    expect(lifecycle.evacuationConfirmationOrigin).toBe('none');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Evacuate' }),
    );
  });

  it('opens the same confirmation from Pause, records the Pause origin, and Cancel returns to Pause (V02-DEC-013/030)', async () => {
    const store = storeWithActiveMission();
    renderScreen(store, ALL_ICONS_READY);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    const pauseDialog = screen.getByRole('dialog');
    fireEvent.click(
      within(pauseDialog).getByRole('button', { name: 'Evacuate' }),
    );

    let lifecycle = store.getState()!.combatLifecycle;
    expect(lifecycle.overlay).toBe('evacuation-confirmation');
    expect(lifecycle.running).toBe(false);
    expect(lifecycle.evacuationConfirmationOrigin).toBe('pause');
    // Only the confirmation Overlay is open; Pause is not rendered beside it.
    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    const confirmation = screen.getByRole('dialog');
    fireEvent.click(
      within(confirmation).getByRole('button', { name: 'Cancel' }),
    );
    lifecycle = store.getState()!.combatLifecycle;
    expect(lifecycle.overlay).toBe('pause');
    expect(lifecycle.running).toBe(false);
    expect(screen.getByRole('heading', { name: 'Paused' })).toBeDefined();
  });

  it('Confirm records the irreversible commitment exactly once and removes every Evacuate affordance (Epic §13.4, §15.5)', async () => {
    const store = storeWithActiveMission();
    renderScreen(store, ALL_ICONS_READY);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Evacuate' }));
    const confirmDialog = screen.getByRole('dialog');
    fireEvent.click(
      within(confirmDialog).getByRole('button', { name: 'Confirm Evacuation' }),
    );

    let lifecycle = store.getState()!.combatLifecycle;
    expect(lifecycle.overlay).toBe('none');
    expect(lifecycle.running).toBe(true);
    expect(lifecycle.evacuationCommitted).toBe(true);
    expect(lifecycle.evacuationConfirmationOrigin).toBe('none');

    // Active Combat exposes only the utility Pause and Settings controls.
    let utilityButtons = Array.from(
      screen.getByTestId('combat-utility').querySelectorAll('button'),
    );
    expect(
      utilityButtons.map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Pause', 'Settings']);
    expect(screen.queryByRole('button', { name: 'Evacuate' })).toBeNull();

    // Pause exposes Resume only again; no action can re-offer Evacuation.
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    const pausedDialog = screen.getByRole('dialog');
    expect(within(pausedDialog).getAllByRole('button')).toHaveLength(1);
    expect(
      within(pausedDialog).getByRole('button', { name: 'Resume' }),
    ).toBeDefined();
    expect(
      within(pausedDialog).queryByRole('button', { name: 'Evacuate' }),
    ).toBeNull();
    fireEvent.click(
      within(pausedDialog).getByRole('button', { name: 'Resume' }),
    );

    // A retained/repeated callback that replays the open command (or a second
    // Confirm) is a strict no-op for the same Mission Instance.
    const committedState = store.getState();
    act(() => {
      store.dispatch({
        type: 'combat-lifecycle/open-evacuation-confirmation',
        missionInstanceOrdinal: 0,
      });
      store.dispatch({
        type: 'combat-lifecycle/confirm-evacuation',
        missionInstanceOrdinal: 0,
      });
    });
    expect(store.getState()).toBe(committedState);
    lifecycle = store.getState()!.combatLifecycle;
    expect(lifecycle.overlay).toBe('none');
    expect(lifecycle.evacuationCommitted).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
    // The mission is still active: E03 confirms the commitment only and never
    // commits, presents, or navigates a terminal result itself.
    expect(store.getState()?.activeMission).not.toBe('none');
    expect(store.getState()?.missionResult).toBeNull();
    utilityButtons = Array.from(
      screen.getByTestId('combat-utility').querySelectorAll('button'),
    );
    expect(
      utilityButtons.map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Pause', 'Settings']);
  });

  it('browser-safety during the confirmation requires explicit Resume and never resumes Combat (V02-AC-014/019)', async () => {
    const store = storeWithActiveMission();
    renderScreen(store, ALL_ICONS_READY);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Evacuate' }));
    // The tab becomes hidden while the confirmation is open. Both browser-safety
    // triggers dispatch the same canonical lifecycle event; the window-blur
    // trigger is exercised at the store level (the existing loading test) and the
    // hidden-tab trigger drives the DOM assertions here.
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(store.getState()!.combatLifecycle.browserSafetyLatched).toBe(true);
    // The confirmation survives the safety event: only the Resume requirement
    // was added, and no Pause/Settings Overlay replaced it.
    const latchedDialog = screen.getByRole('dialog');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    // Cancel cannot restore running Combat under the latch: it returns to Pause.
    fireEvent.click(
      within(latchedDialog).getByRole('button', { name: 'Cancel' }),
    );
    expect(store.getState()!.combatLifecycle.overlay).toBe('pause');
    expect(store.getState()!.combatLifecycle.running).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(store.getState()!.combatLifecycle.running).toBe(true);
    expect(store.getState()!.combatLifecycle.browserSafetyLatched).toBe(false);

    // Confirm under the latch records the commitment but also requires Resume.
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    const pauseDialog = screen.getByRole('dialog');
    fireEvent.click(
      within(pauseDialog).getByRole('button', { name: 'Evacuate' }),
    );
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const confirmDialog = screen.getByRole('dialog');
    fireEvent.click(
      within(confirmDialog).getByRole('button', {
        name: 'Confirm Evacuation',
      }),
    );
    const latched = store.getState()!.combatLifecycle;
    expect(latched.overlay).toBe('pause');
    expect(latched.running).toBe(false);
    expect(latched.evacuationCommitted).toBe(true);
    expect(latched.browserSafetyLatched).toBe(true);
    // Only the explicit Resume resumes the committed countdown.
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(store.getState()!.combatLifecycle.running).toBe(true);
    expect(store.getState()!.combatLifecycle.overlay).toBe('none');
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
  });

  it('P, Settings, and development F1 cannot displace the open confirmation (single-Overlay precedence)', async () => {
    const store = storeWithActiveMission();
    renderScreen(store, ALL_ICONS_READY);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Evacuate' }));
    const opened = store.getState()!.combatLifecycle;

    fireEvent.keyDown(window, { code: 'KeyP' });
    fireEvent.keyDown(window, { code: 'F1' });
    expect(store.getState()!.combatLifecycle).toBe(opened);
    expect(screen.getByRole('heading', { name: 'Evacuate?' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Paused' })).toBeNull();
    const utility = screen.getByTestId('combat-utility');
    const settings = utility.querySelector(
      '[aria-label="Settings"]',
    ) as HTMLButtonElement;
    expect(settings.disabled).toBe(true);
    // V02-WI-05 E03 C01: the cluster affordance stays visible but disabled
    // behind the open confirmation.
    const clusterEvacuate = within(utility).getByRole('button', {
      name: 'Evacuate',
    }) as HTMLButtonElement;
    expect(clusterEvacuate.disabled).toBe(true);
    fireEvent.click(settings);
    fireEvent.click(clusterEvacuate);
    expect(store.getState()!.combatLifecycle).toBe(opened);
    expect(screen.getByRole('heading', { name: 'Evacuate?' })).toBeDefined();
  });

  it('hides the Evacuate affordance while the atomic terminal write is pending in both the cluster and the Pause Overlay', async () => {
    const store = storeWithActiveMission();
    renderScreen(store, ALL_ICONS_READY);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    act(() => {
      store.dispatch({
        type: 'combat-terminal/pending',
        missionInstanceOrdinal: 0,
      });
    });
    expect(store.getState()!.combatLifecycle.terminalSavePending).toBe(true);
    expect(store.getState()!.combatLifecycle.overlay).toBe('pause');

    // Cluster: no Evacuate action at all (hidden, not disabled).
    const utility = screen.getByTestId('combat-utility');
    expect(
      within(utility).queryByRole('button', { name: 'Evacuate' }),
    ).toBeNull();
    expect(within(utility).getAllByRole('button')).toHaveLength(2);
    // Pause Overlay: the Evacuate action is hidden; Resume remains the only
    // continuation.
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).queryByRole('button', { name: 'Evacuate' }),
    ).toBeNull();
    expect(within(dialog).getAllByRole('button')).toHaveLength(1);
    expect(
      within(dialog).getByRole('button', { name: 'Resume' }),
    ).toBeDefined();
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

  it('a mission that resolves while the lazy owner loads never creates a late owner (S13-WI01)', async () => {
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
    // Resolve the mission through the canonical typed terminal while the lazy
    // Combat chunk is still loading (the only canonical way an active mission
    // can end without a Combat owner — the removed Return to Base seam no
    // longer exists).
    store.dispatch({
      type: 'mission/result',
      result: {
        kind: 'defeat',
        missionInstanceOrdinal: 0,
        creditsAfter: 4,
        hullIntegrityAfter: 100,
        runStatusAfter: 'active',
        repairCostCredits: 8,
      },
    });
    expect(store.getState()?.activeMission).toBe('none');
    expect(store.getState()?.missionResult?.kind).toBe('defeat');
    // Resolve the lazy import after resolution. The post-import creation guard
    // must reject it before a presentation owner, runtime, canvas, or listener
    // can be created.
    act(() => {
      releaseImport?.();
    });
    await act(async () => {});
    expect(createOwner).not.toHaveBeenCalled();
    expect(disposeSpy).not.toHaveBeenCalled();
    // The mission stays resolved with no late-owner side effect.
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

  it('hides the Evacuate affordance in Save Error, Save Conflict, and Mission Start Recovery Error', async () => {
    const blockingStates: readonly (readonly [
      string,
      (
        | 'combat-terminal/save-error'
        | 'combat-terminal/save-conflict'
        | 'combat-start/recovery-error'
      ),
    ])[] = [
      ['save-error', 'combat-terminal/save-error'],
      ['save-conflict', 'combat-terminal/save-conflict'],
      ['mission-start-recovery-error', 'combat-start/recovery-error'],
    ];
    for (const [label, type] of blockingStates) {
      cleanup();
      const store = storeWithActiveMission();
      renderScreen(store, ALL_ICONS_READY);
      await act(async () => {});
      act(() => {
        store.dispatch({ type, missionInstanceOrdinal: 0 });
      });
      const utility = screen.getByTestId('combat-utility');
      expect(
        within(utility).queryByRole('button', { name: 'Evacuate' }),
        label,
      ).toBeNull();
      expect(within(utility).getAllByRole('button'), label).toHaveLength(2);
      expect(
        screen.queryByRole('button', { name: 'Evacuate' }),
        label,
      ).toBeNull();
      // The blocking Overlay itself owns the screen.
      expect(screen.getAllByRole('dialog'), label).toHaveLength(1);
    }
  });

  it('hides the Evacuate affordance in the Resume-only terminal-exit Pause', async () => {
    const store = storeWithActiveMission();
    renderScreen(store, ALL_ICONS_READY);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    // The canonical route into the Resume-only terminal-exit Pause: an atomic
    // terminal write is pending, the tab becomes hidden (latching manual
    // Resume), and the committed outcome resolves behind that latch.
    act(() => {
      store.dispatch({
        type: 'combat-terminal/pending',
        missionInstanceOrdinal: 0,
      });
    });
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(store.getState()!.combatLifecycle.browserSafetyLatched).toBe(true);
    act(() => {
      store.dispatch({
        type: 'combat-terminal/recover',
        missionInstanceOrdinal: 0,
      });
    });
    expect(store.getState()!.combatLifecycle.overlay).toBe(
      'terminal-exit-pause',
    );

    const utility = screen.getByTestId('combat-utility');
    expect(
      within(utility).queryByRole('button', { name: 'Evacuate' }),
    ).toBeNull();
    expect(within(utility).getAllByRole('button')).toHaveLength(2);
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).queryByRole('button', { name: 'Evacuate' }),
    ).toBeNull();
    expect(
      within(dialog).getByRole('button', { name: 'Resume' }),
    ).toBeDefined();
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
  });

  it('keeps the Evacuate affordance visible but disabled behind Settings and Debug', async () => {
    const store = storeWithActiveMission();
    renderScreen(store, ALL_ICONS_READY);
    await act(async () => {});

    // Settings: the cluster affordance stays rendered and disabled.
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    let utility = screen.getByTestId('combat-utility');
    let clusterEvacuate = within(utility).getByRole('button', {
      name: 'Evacuate',
    }) as HTMLButtonElement;
    expect(clusterEvacuate.disabled).toBe(true);
    const settingsState = store.getState()!.combatLifecycle;
    fireEvent.click(clusterEvacuate);
    expect(store.getState()!.combatLifecycle).toBe(settingsState);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    // Debug (development): the same visible-but-disabled behaviour.

    fireEvent.keyDown(window, { code: 'F1' });
    expect(store.getState()!.combatLifecycle.overlay).toBe('debug');
    utility = screen.getByTestId('combat-utility');
    clusterEvacuate = within(utility).getByRole('button', {
      name: 'Evacuate',
    }) as HTMLButtonElement;
    expect(clusterEvacuate.disabled).toBe(true);
    const debugState = store.getState()!.combatLifecycle;
    fireEvent.click(clusterEvacuate);
    expect(store.getState()!.combatLifecycle).toBe(debugState);
    fireEvent.keyDown(window, { code: 'F1' });
    expect(store.getState()!.combatLifecycle.overlay).toBe('none');
  });
});
