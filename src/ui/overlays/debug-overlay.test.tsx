import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { CONTENT_CATALOGUE } from '@test-support/content';
import type { CombatObservability } from '@application/combat';
import { startMission } from '@application/mission';
import type {
  CampaignReadResult,
  CampaignStartOutcome,
  CampaignStorePort,
  CampaignUpdateOutcome,
  DebugCampaignCommand,
} from '@application/persistence';
import { createDebugCampaignCommand } from '@application/persistence';
import { createSessionStore } from '@application/session';
import type { SessionStore } from '@application/session';
import type {
  CampaignStateV1,
  CampaignTransitionResult,
  MissionId,
} from '@domain/index';
import { createInitializedTestApplication } from '@test-support/persistence';
import {
  InMemoryCampaignStore,
  campaignSchemaContext,
} from '@test-support/persistence';
import { WithApplication } from '@test-support/ui/application-provider';
import { DebugOverlay } from './debug-overlay';

const BASE_OBSERVABILITY: CombatObservability = {
  combatSeed: 12345,
  missionTimeSeconds: 42,
  countdownSeconds: 148,
  currentEncounterId: 'interception-01-e1',
  elite: null,
  playerHullIntegrity: 100,
  godModeEnabled: false,
  activeEnemiesByType: {
    'basic-drone': 3,
    'ranged-drone': 1,
    'hunter-drone': 0,
    'elite-drone': 0,
  },
  activeEnemyBounds: [
    {
      type: 'basic-drone',
      centerX: 320,
      centerY: 120,
      width: 96,
      height: 50,
    },
  ],
  destroyedEnemiesByType: {
    'basic-drone': 7,
    'ranged-drone': 0,
    'hunter-drone': 3,
    'elite-drone': 0,
  },
  destroyedByProjectileEnemiesByType: {
    'basic-drone': 5,
    'ranged-drone': 0,
    'hunter-drone': 2,
    'elite-drone': 0,
  },
  destroyedByContactEnemiesByType: {
    'basic-drone': 2,
    'ranged-drone': 0,
    'hunter-drone': 1,
    'elite-drone': 0,
  },
  escapedEnemiesByType: {
    'basic-drone': 1,
    'ranged-drone': 0,
    'hunter-drone': 0,
    'elite-drone': 0,
  },
  pendingCombatRewards: 9,
  pendingEscapePenalties: 2,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** One development-only campaign Debug command bound to the harness context. */
function testCommand(
  store: SessionStore,
  campaignStore: CampaignStorePort,
  navigate: () => void = vi.fn(),
): DebugCampaignCommand {
  // Bound exactly as the Combat Screen binds it: the identity of the mission
  // that is active when the command is constructed (F4).
  const snapshot = store.getState()?.activeMission;
  return createDebugCampaignCommand({
    store,
    campaignStore,
    debugMode: true,
    navigate,
    origin:
      snapshot === undefined || snapshot === 'none'
        ? {
            missionId: 'interception-01',
            attemptId: 0,
            missionInstanceOrdinal: 0,
          }
        : {
            missionId: snapshot.missionId,
            attemptId: snapshot.missionAttemptId,
            missionInstanceOrdinal: snapshot.missionInstanceOrdinal,
          },
  });
}

function renderDebugOverlay(
  observability: CombatObservability | null = BASE_OBSERVABILITY,
  encounterIds: readonly string[] = [
    'interception-01-e1',
    'interception-01-e2',
    'interception-01-e3',
    'interception-01-e4',
    'interception-01-e5',
  ],
  options: { readonly open?: boolean } = {},
): {
  getObservability: ReturnType<typeof vi.fn>;
  submitDebugAction: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
} {
  const getObservability = vi.fn().mockReturnValue(observability);
  const submitDebugAction = vi.fn();
  const onClose = vi.fn();
  const store = createSessionStore();
  const campaignStore = new InMemoryCampaignStore(
    campaignSchemaContext(CONTENT_CATALOGUE),
  );
  render(
    <WithApplication store={store} campaignStore={campaignStore}>
      <DebugOverlay
        open={options.open ?? true}
        onClose={onClose}
        getObservability={getObservability}
        submitDebugAction={submitDebugAction}
        encounterIds={encounterIds}
        campaignCommand={testCommand(store, campaignStore)}
      />
    </WithApplication>,
  );
  return { getObservability, submitDebugAction, onClose };
}

describe('DebugOverlay (Combat §11, Epic §17, DS §8.24)', () => {
  it('shows exactly the approved observability values and sections', () => {
    renderDebugOverlay();
    expect(screen.getByRole('heading', { name: 'Debug' })).toBeDefined();
    expect(screen.getByText('Combat Seed')).toBeDefined();
    expect(screen.getByText('12345')).toBeDefined();
    expect(screen.getByText('Mission Clock')).toBeDefined();
    expect(screen.getByText('42.0 s')).toBeDefined();
    expect(screen.getByText('Combat Countdown')).toBeDefined();
    expect(screen.getByText('148 s')).toBeDefined();
    expect(screen.getByText('Current Encounter')).toBeDefined();
    expect(screen.getByText('interception-01-e1')).toBeDefined();
    expect(screen.getByText('Elite Phase')).toBeDefined();
    expect(screen.getByText('Elite Phase Time')).toBeDefined();
    expect(screen.getByText('Player Hull')).toBeDefined();
    expect(screen.getByText('100')).toBeDefined();
    expect(screen.getByText('Active Enemies')).toBeDefined();
    expect(screen.getByText('Basic 3 · Ranged 1')).toBeDefined();
    expect(screen.getByText('Destroyed Enemies')).toBeDefined();
    expect(screen.getByText('Basic 7 · Hunter 3')).toBeDefined();
    expect(screen.getByText('Destroyed by Projectile')).toBeDefined();
    // The exact projectile remainder per role, with non-zero overlapping total
    // (Basic 7, Hunter 3) and contact (Basic 2, Hunter 1) counts.
    expect(screen.getByText('Basic 5 · Hunter 2')).toBeDefined();
    expect(screen.getByText('Destroyed by Contact')).toBeDefined();
    expect(screen.getByText('Basic 2 · Hunter 1')).toBeDefined();
    expect(screen.getByText('Escaped Enemies')).toBeDefined();
    expect(screen.getByText('Basic 1')).toBeDefined();
    expect(screen.getByText('Combat Rewards')).toBeDefined();
    expect(screen.getByText('9')).toBeDefined();
    expect(screen.getByText('Escape Penalties')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
    // No Elite in this simulation: both Elite rows are absent values.
    const elitePhase = screen.getByText('Elite Phase').closest('.ds-field-row');
    const elitePhaseTime = screen
      .getByText('Elite Phase Time')
      .closest('.ds-field-row');
    expect(elitePhase?.textContent).toContain('—');
    expect(elitePhaseTime?.textContent).toContain('—');
    // No FPS, hitboxes, coordinates, or extra diagnostics.
    expect(screen.queryByText(/fps|hitbox|coordinat/i)).toBeNull();
  });

  it('shows the current Elite phase and its authoritative phase time with Elite in the role formatting', () => {
    renderDebugOverlay({
      ...BASE_OBSERVABILITY,
      elite: { phase: 'vulnerable', phaseElapsedSeconds: 1.5 },
      activeEnemiesByType: {
        'basic-drone': 0,
        'ranged-drone': 0,
        'hunter-drone': 0,
        'elite-drone': 1,
      },
    });
    expect(screen.getByText('Vulnerable')).toBeDefined();
    expect(screen.getByText('1.5 s')).toBeDefined();
    expect(screen.getByText('Elite 1')).toBeDefined();
  });

  it('shows an entering Elite with no active phase time', () => {
    renderDebugOverlay({
      ...BASE_OBSERVABILITY,
      elite: { phase: 'entering', phaseElapsedSeconds: 0 },
    });
    expect(screen.getByText('Entering')).toBeDefined();
    const elitePhaseTime = screen
      .getByText('Elite Phase Time')
      .closest('.ds-field-row');
    expect(elitePhaseTime?.textContent).toContain('—');
  });

  it('refreshes observability on open and relays every approved action', () => {
    const { getObservability, submitDebugAction } = renderDebugOverlay();
    const firstCallCount = getObservability.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Set Hull: 25' }));
    fireEvent.click(screen.getByRole('button', { name: 'Spawn Basic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Spawn Ranged' }));
    fireEvent.click(screen.getByRole('button', { name: 'Spawn Hunter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Spawn Elite' }));
    fireEvent.click(screen.getByRole('button', { name: 'Spawn E1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Win Mission' }));
    fireEvent.click(screen.getByRole('button', { name: 'Evacuate Mission' }));
    expect(submitDebugAction.mock.calls.map((call) => call[0])).toEqual([
      { type: 'combat-debug/set-hull', hull: 25 },
      { type: 'combat-debug/spawn-enemy', enemyType: 'basic-drone' },
      { type: 'combat-debug/spawn-enemy', enemyType: 'ranged-drone' },
      { type: 'combat-debug/spawn-enemy', enemyType: 'hunter-drone' },
      { type: 'combat-debug/spawn-enemy', enemyType: 'elite-drone' },
      {
        type: 'combat-debug/spawn-encounter',
        encounterId: 'interception-01-e1',
      },
      { type: 'combat-debug/win-mission' },
      { type: 'combat-debug/evacuate-mission' },
    ]);
    // Refreshed on open and after each accepted action, never per frame.
    expect(getObservability.mock.calls.length).toBe(firstCallCount + 8);
  });

  it('Set Hull is disabled while God Mode is enabled', () => {
    renderDebugOverlay({
      ...BASE_OBSERVABILITY,
      godModeEnabled: true,
    });
    expect(
      (
        screen.getByRole('button', {
          name: 'Set Hull: 25',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: 'Set Hull: 100',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('God Mode is a canonical Checkbox relaying the toggle command', () => {
    const { submitDebugAction } = renderDebugOverlay();
    const checkbox = screen.getByRole('checkbox', { name: 'God Mode' });
    fireEvent.click(checkbox);
    expect(submitDebugAction).toHaveBeenCalledWith({
      type: 'combat-debug/god-mode',
      enabled: true,
    });
  });

  it('Close and Esc close through the same callback', () => {
    const { onClose } = renderDebugOverlay();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders nothing when closed', () => {
    renderDebugOverlay(BASE_OBSERVABILITY, ['interception-01-e1'], {
      open: false,
    });
    expect(screen.queryByRole('heading', { name: 'Debug' })).toBeNull();
  });

  it('addresses EVERY authored Encounter of the CURRENT mission in authored order (V02-WI-05 M02-R01, V02-WI-07 D01)', () => {
    const { submitDebugAction } = renderDebugOverlay(BASE_OBSERVABILITY, [
      'interception-02-e1',
      'interception-02-e2',
      'interception-02-e3',
      'interception-02-e4',
      'interception-02-e5',
      'interception-02-e6',
    ]);
    // One action per authored Encounter: no hard-coded first/fifth subset.
    for (const index of [1, 2, 3, 4, 5, 6]) {
      expect(
        screen.getByRole('button', { name: `Spawn E${index}` }),
      ).toBeDefined();
    }
    expect(screen.queryByRole('button', { name: 'Spawn E7' })).toBeNull();
    for (const index of [1, 2, 3, 4, 5, 6]) {
      fireEvent.click(screen.getByRole('button', { name: `Spawn E${index}` }));
    }
    expect(submitDebugAction.mock.calls.map((call) => call[0])).toEqual([
      {
        type: 'combat-debug/spawn-encounter',
        encounterId: 'interception-02-e1',
      },
      {
        type: 'combat-debug/spawn-encounter',
        encounterId: 'interception-02-e2',
      },
      {
        type: 'combat-debug/spawn-encounter',
        encounterId: 'interception-02-e3',
      },
      {
        type: 'combat-debug/spawn-encounter',
        encounterId: 'interception-02-e4',
      },
      {
        type: 'combat-debug/spawn-encounter',
        encounterId: 'interception-02-e5',
      },
      {
        type: 'combat-debug/spawn-encounter',
        encounterId: 'interception-02-e6',
      },
    ]);
  });

  it('renders one action per authored encounter and none for an absent identity (V02-WI-05 M02-R01)', () => {
    const { submitDebugAction } = renderDebugOverlay(BASE_OBSERVABILITY, [
      'interception-01-e1',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Spawn E1' }));
    expect(submitDebugAction).toHaveBeenCalledWith({
      type: 'combat-debug/spawn-encounter',
      encounterId: 'interception-01-e1',
    });
    // The mission has no fifth authored Encounter, so no foreign-identity
    // action exists to relay at all.
    expect(screen.queryByRole('button', { name: 'Spawn E5' })).toBeNull();
    expect(submitDebugAction).toHaveBeenCalledTimes(1);
  });

  it('enables the Elite phase actions only while a current Elite exists', () => {
    const first = renderDebugOverlay();
    const armoured = screen.getByRole('button', {
      name: 'Elite: Armoured',
    }) as HTMLButtonElement;
    const vulnerable = screen.getByRole('button', {
      name: 'Elite: Vulnerable',
    }) as HTMLButtonElement;
    expect(armoured.disabled).toBe(true);
    expect(vulnerable.disabled).toBe(true);
    expect(first.submitDebugAction).not.toHaveBeenCalled();

    cleanup();
    const second = renderDebugOverlay({
      ...BASE_OBSERVABILITY,
      elite: { phase: 'armoured', phaseElapsedSeconds: 3 },
    });
    const enabledArmoured = screen.getByRole('button', {
      name: 'Elite: Armoured',
    }) as HTMLButtonElement;
    const enabledVulnerable = screen.getByRole('button', {
      name: 'Elite: Vulnerable',
    }) as HTMLButtonElement;
    expect(enabledArmoured.disabled).toBe(false);
    expect(enabledVulnerable.disabled).toBe(false);
    fireEvent.click(enabledVulnerable);
    expect(second.submitDebugAction).toHaveBeenCalledWith({
      type: 'combat-debug/set-elite-phase',
      phase: 'vulnerable',
    });
  });
});

/** Holds the durable update open so the pending/disabled state is observable. */
class DeferredCampaignStore implements CampaignStorePort {
  private startUpdate: (() => void) | null = null;

  constructor(private readonly inner: CampaignStorePort) {}

  read(): Promise<CampaignReadResult> {
    return this.inner.read();
  }

  update(
    transform: (current: CampaignStateV1) => CampaignTransitionResult,
  ): Promise<CampaignUpdateOutcome> {
    return new Promise<CampaignUpdateOutcome>((resolve) => {
      this.startUpdate = () => {
        void this.inner.update(transform).then(resolve);
      };
    });
  }

  startMission(missionId: MissionId): Promise<CampaignStartOutcome> {
    return this.inner.startMission(missionId);
  }

  replace(next: CampaignStateV1): Promise<void> {
    return this.inner.replace(next);
  }

  get pending(): boolean {
    return this.startUpdate !== null;
  }

  flush(): void {
    const start = this.startUpdate;
    this.startUpdate = null;
    start?.();
  }
}

/**
 * Mounts the Overlay exactly as the Combat Screen does for one logical active
 * mission: the Debug lifecycle is authoritative-open, a real Debug campaign
 * command is injected, and the Overlay can be unmounted/re-mounted like the
 * `lifecycle.overlay === 'debug'` conditional render.
 */
function CampaignOverlayHarness({
  app,
  command,
  open,
  campaignStore,
}: {
  readonly app: ReturnType<typeof createInitializedTestApplication>;
  readonly command: DebugCampaignCommand;
  readonly open: boolean;
  readonly campaignStore: CampaignStorePort;
}): ReactElement {
  return (
    <WithApplication store={app.store} campaignStore={campaignStore}>
      {open ? (
        <DebugOverlay
          open
          onClose={vi.fn()}
          getObservability={() => BASE_OBSERVABILITY}
          submitDebugAction={vi.fn()}
          encounterIds={['interception-01-e1']}
          campaignCommand={command}
        />
      ) : null}
    </WithApplication>
  );
}

async function renderWithCampaign(
  app: ReturnType<typeof createInitializedTestApplication>,
  campaignStore: CampaignStorePort = app.campaignStore,
): Promise<{
  readonly command: DebugCampaignCommand;
  readonly navigate: ReturnType<typeof vi.fn>;
  readonly rerenderOpen: (open: boolean) => void;
}> {
  const start = await startMission(
    { ...app, content: CONTENT_CATALOGUE },
    'interception-01',
  );
  if (start.kind !== 'accepted') {
    throw new Error('Expected the mission start to be accepted.');
  }
  // The Combat Screen renders this Overlay only while Debug is the
  // authoritative lifecycle Overlay, so the harness establishes that exact
  // state (the injected command enforces it at its own boundary).
  app.store.dispatch({
    type: 'combat-lifecycle/open-debug',
    missionInstanceOrdinal: start.snapshot.missionInstanceOrdinal,
  });
  const navigate = vi.fn();
  const command = testCommand(app.store, campaignStore, navigate);
  const { rerender } = render(
    <CampaignOverlayHarness
      app={app}
      command={command}
      open
      campaignStore={campaignStore}
    />,
  );
  return {
    command,
    navigate,
    rerenderOpen: (open: boolean) => {
      rerender(
        <CampaignOverlayHarness
          app={app}
          command={command}
          open={open}
          campaignStore={campaignStore}
        />,
      );
    },
  };
}

function fieldRow(label: string): HTMLElement {
  const row = screen.getByText(label, { exact: true }).closest('.ds-field-row');
  if (row === null) {
    throw new Error(`Expected the ${label} Field Row.`);
  }
  return row as HTMLElement;
}

function button(name: string): HTMLButtonElement {
  return screen.getByRole('button', { name }) as HTMLButtonElement;
}

describe('DebugOverlay D02-A campaign authority (Epic §17, V02-AC-026)', () => {
  it('shows the persisted Credits, the exact marker identity, and runStatus', async () => {
    const app = createInitializedTestApplication();
    await renderWithCampaign(app);
    const marker = app.campaignStore.current!.missionInProgress!;
    await waitFor(() => {
      expect(fieldRow('Credits').textContent).toContain('12');
    });
    expect(fieldRow('missionInProgress').textContent).toContain(
      `${marker.missionId} · attempt ${marker.attemptId}`,
    );
    expect(fieldRow('runStatus').textContent).toContain('active');
    // The started mission persisted an exact marker for the current snapshot, so
    // the recovery affordance is eligible.
    expect(button('Reload for Recovery').disabled).toBe(false);
  });

  it('renders the absent value while no campaign record is available', async () => {
    // A brand-new context without a persisted record: loading/unavailable.
    renderDebugOverlay(BASE_OBSERVABILITY, []);
    await act(async () => {});
    expect(fieldRow('Credits').textContent).toContain('—');
    expect(fieldRow('missionInProgress').textContent).toContain('—');
    expect(fieldRow('runStatus').textContent).toContain('—');
    // The recovery affordance requires a proven marker match.
    expect(button('Reload for Recovery').disabled).toBe(true);
  });

  it('applies Set Credits: 7 through the atomic campaign transaction and reconciles the session', async () => {
    const app = createInitializedTestApplication();
    await renderWithCampaign(app);
    await waitFor(() => {
      expect(fieldRow('Credits').textContent).toContain('12');
    });
    fireEvent.click(button('Set Credits: 7'));
    await waitFor(() => {
      expect(app.campaignStore.current?.credits).toBe(7);
    });
    expect(app.store.getState()?.credits).toBe(7);
    expect(fieldRow('Credits').textContent).toContain('7');
  });

  it('disables both Credit controls while the single-flight command is pending', async () => {
    const app = createInitializedTestApplication();
    const deferred = new DeferredCampaignStore(app.campaignStore);
    await renderWithCampaign(app, deferred);
    await waitFor(() => {
      expect(fieldRow('Credits').textContent).toContain('12');
    });
    expect(button('Set Credits: 7').disabled).toBe(false);
    expect(button('Set Credits: 8').disabled).toBe(false);

    fireEvent.click(button('Set Credits: 7'));
    await waitFor(() => {
      expect(deferred.pending).toBe(true);
    });
    // A repeated activation while pending is inert at the UI.
    fireEvent.click(button('Set Credits: 8'));
    expect(button('Set Credits: 7').disabled).toBe(true);
    expect(button('Set Credits: 8').disabled).toBe(true);

    await act(async () => {
      deferred.flush();
    });
    await waitFor(() => {
      expect(button('Set Credits: 7').disabled).toBe(false);
    });
    expect(button('Set Credits: 8').disabled).toBe(false);
    // Only the first bounded value was applied, exactly once.
    expect(app.campaignStore.current?.credits).toBe(7);
    expect(fieldRow('Credits').textContent).toContain('7');
  });

  it('enables Reload for Recovery only for an exact active marker match', async () => {
    const app = createInitializedTestApplication();
    await renderWithCampaign(app);
    await waitFor(() => {
      expect(button('Reload for Recovery').disabled).toBe(false);
    });

    // A foreign attempt id invalidates the match on the next fresh read.
    const marker = app.campaignStore.current!.missionInProgress!;
    app.campaignStore.seed({
      ...app.campaignStore.current!,
      missionInProgress: { ...marker, attemptId: marker.attemptId + 5 },
    });
    fireEvent.click(button('Set Credits: 8'));
    await waitFor(() => {
      expect(button('Reload for Recovery').disabled).toBe(true);
    });
    // The stale-marker Credit attempt was a strict no-op.
    expect(app.campaignStore.current?.credits).toBe(12);
  });

  it('keeps the Credit controls disabled and single-flight across a Debug close/reopen (D02-A-C01 F2)', async () => {
    const app = createInitializedTestApplication();
    const deferred = new DeferredCampaignStore(app.campaignStore);
    const { rerenderOpen } = await renderWithCampaign(app, deferred);
    await waitFor(() => {
      expect(fieldRow('Credits').textContent).toContain('12');
    });

    fireEvent.click(button('Set Credits: 7'));
    await waitFor(() => {
      expect(deferred.pending).toBe(true);
    });
    expect(button('Set Credits: 7').disabled).toBe(true);

    // The player closes Debug: the Overlay unmounts exactly as the Combat
    // Screen's `lifecycle.overlay === 'debug'` conditional does.
    rerenderOpen(false);
    expect(screen.queryByRole('button', { name: 'Set Credits: 7' })).toBeNull();

    // Reopening Debug must still observe the ONE in-flight command: both Credit
    // controls stay disabled and a repeated activation joins the same
    // transaction instead of creating a second one.
    rerenderOpen(true);
    await waitFor(() => {
      expect(button('Set Credits: 7').disabled).toBe(true);
    });
    expect(button('Set Credits: 8').disabled).toBe(true);
    fireEvent.click(button('Set Credits: 8'));

    await act(async () => {
      deferred.flush();
    });
    await waitFor(() => {
      expect(button('Set Credits: 7').disabled).toBe(false);
    });
    // Exactly one durable write happened, with the first bounded value.
    expect(app.campaignStore.current?.credits).toBe(7);
    expect(app.store.getState()?.credits).toBe(7);
    await waitFor(() => {
      expect(fieldRow('Credits').textContent).toContain('7');
    });
  });

  it('re-verifies the persisted campaign when Reload for Recovery is activated (D02-A-C01 F3)', async () => {
    const app = createInitializedTestApplication();
    const { navigate } = await renderWithCampaign(app);
    await waitFor(() => {
      expect(button('Reload for Recovery').disabled).toBe(false);
    });

    // Another tab replaces the marker while this Overlay stays open: the
    // visible affordance is still enabled, but activation re-reads the
    // authoritative record and must NOT navigate.
    const marker = app.campaignStore.current!.missionInProgress!;
    app.campaignStore.seed({
      ...app.campaignStore.current!,
      missionInProgress: { ...marker, attemptId: marker.attemptId + 3 },
    });
    fireEvent.click(button('Reload for Recovery'));
    await act(async () => {});
    expect(navigate).not.toHaveBeenCalled();
    // The refresh after the inert activation removes the stale affordance.
    await waitFor(() => {
      expect(button('Reload for Recovery').disabled).toBe(true);
    });

    // Restoring the exact marker makes one activation navigate exactly once.
    app.campaignStore.seed({
      ...app.campaignStore.current!,
      missionInProgress: marker,
    });
    fireEvent.click(button('Set Credits: 8'));
    await waitFor(() => {
      expect(button('Reload for Recovery').disabled).toBe(false);
    });
    fireEvent.click(button('Reload for Recovery'));
    await act(async () => {});
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
