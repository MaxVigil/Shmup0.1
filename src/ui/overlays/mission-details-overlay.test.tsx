import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as mission from '@application/mission';
import type { MissionStartResult } from '@application/mission';
import { createSessionStore } from '@application/session';
import type { SessionStore } from '@application/session';
import type { AssetPreloadResult } from '@application/ports';
import { createInitializedSessionStore } from '@test-support/session';
import { createApplicationContextValue } from '@test-support/ui';
import { CONTENT_CATALOGUE } from '@test-support/content';
import { INTERCEPTION_01 } from '@application/content';
import type { MissionDefinition } from '@application/content';
import { ApplicationContext } from '../application-context';
import { MissionDetailsOverlay } from './mission-details-overlay';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** An accepted start result derived from the store session (the Overlay only
 *  observes the `kind`; S07's snapshot recording is covered by startMission). */
function acceptedResult(store: SessionStore): MissionStartResult {
  const session = store.getState();
  if (session === null) {
    throw new Error('Expected an initialized session.');
  }
  return {
    kind: 'accepted',
    snapshot: {
      missionId: INTERCEPTION_01.id,
      missionInstanceOrdinal: 0,
      missionAttemptId: 0,
      combatMissionSeed: 0,
      aircraftId: session.aircraftId,
      hullIntegrity: session.hullIntegrity,
      equippedWeapon: session.equippedWeapon,
      pilot: session.pilot,
      mouseMovementEnabled: session.mouseMovementEnabled,
    },
  };
}

function renderOverlay(
  store: SessionStore,
  onClose: () => void,
  mission: MissionDefinition | undefined | null = INTERCEPTION_01,
  open = true,
): void {
  const resolvedMission = mission === null ? undefined : mission;
  const preparedAssets: AssetPreloadResult = [];
  const value = createApplicationContextValue({
    store,
    preparedAssets,
    content: CONTENT_CATALOGUE,
  });
  render(
    <ApplicationContext.Provider value={value}>
      <MissionDetailsOverlay
        open={open}
        mission={resolvedMission}
        state={resolvedMission === undefined ? 'locked' : 'available'}
        onClose={onClose}
      />
    </ApplicationContext.Provider>,
  );
}

describe('MissionDetailsOverlay', () => {
  it('displays the approved content and action order for the selected mission (Base AC-010, DS §8.17, V02-WI-03)', () => {
    const store = createInitializedSessionStore();
    renderOverlay(store, vi.fn());
    const dialog = screen.getByRole('dialog');
    expect(
      screen.getByRole('heading', { name: INTERCEPTION_01.displayName }),
    ).toBeDefined();
    expect(screen.getByText(INTERCEPTION_01.description)).toBeDefined();
    expect(screen.getByText('Reward')).toBeDefined();
    expect(
      screen.getByText(`${INTERCEPTION_01.completionReward} Credits`),
    ).toBeDefined();
    const start = screen.getByRole('button', { name: 'Start Mission' });
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(start.className).toContain('ds-button--primary');
    expect(cancel.className).toContain('ds-button--secondary');
    // Exactly the two approved actions; no aircraft selector or Open Hangar.
    expect(dialog.querySelectorAll('button')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Open Hangar' })).toBeNull();
  });

  it('renders nothing when no validated mission definition is selected', () => {
    const store = createInitializedSessionStore();
    renderOverlay(store, vi.fn(), null);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a locked mission renders no Start Mission action (Epic §6.1)', () => {
    const store = createInitializedSessionStore();
    const value = createApplicationContextValue({
      store,
      preparedAssets: [] as AssetPreloadResult,
      content: CONTENT_CATALOGUE,
    });
    render(
      <ApplicationContext.Provider value={value}>
        <MissionDetailsOverlay
          open
          mission={INTERCEPTION_01}
          state="locked"
          onClose={vi.fn()}
        />
      </ApplicationContext.Provider>,
    );
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Start Mission' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDefined();
  });

  it('moves initial focus to Start Mission (DS §10.4)', () => {
    const store = createInitializedSessionStore();
    renderOverlay(store, vi.fn());
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Start Mission' }),
    );
  });

  it('closes through Cancel and Esc without changing Operations (Base AC-011)', () => {
    const store = createInitializedSessionStore();
    const onClose = vi.fn();
    renderOverlay(store, onClose);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(
      document.querySelector('.ds-overlay__surface') as Element,
      { key: 'Escape' },
    );
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('does not close when clicking outside the Overlay (Base AC-012)', () => {
    const store = createInitializedSessionStore();
    const onClose = vi.fn();
    renderOverlay(store, onClose);
    fireEvent.click(document.querySelector('.ds-overlay__scrim') as Element);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('disables Start Mission and emits exactly one accepted start command (Base AC-013, §5.5)', async () => {
    const store = createInitializedSessionStore();
    const spy = vi
      .spyOn(mission, 'startMission')
      .mockImplementation(async () => acceptedResult(store));
    renderOverlay(store, vi.fn());
    const start = screen.getByRole('button', {
      name: 'Start Mission',
    }) as HTMLButtonElement;

    await act(async () => {
      fireEvent.click(start);
    });
    expect(start.disabled).toBe(true);
    // A repeated click on the disabled action cannot emit a second request.
    await act(async () => {
      fireEvent.click(start);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(store.getState()?.credits).toBe(12);
  });

  it('shows the failure message, keeps the Overlay open, and re-enables Start Mission on rejection (Base AC-014)', async () => {
    const store = createSessionStore();
    renderOverlay(store, vi.fn());
    const start = screen.getByRole('button', {
      name: 'Start Mission',
    }) as HTMLButtonElement;

    await act(async () => {
      fireEvent.click(start);
    });
    expect(screen.getByText('Unable to start mission.')).toBeDefined();
    expect(start.disabled).toBe(false);
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('resets the request state when the Overlay opens again', async () => {
    const store = createInitializedSessionStore();
    const spy = vi
      .spyOn(mission, 'startMission')
      .mockImplementation(async () => acceptedResult(store));
    const onClose = vi.fn();
    const value = createApplicationContextValue({
      store,
      preparedAssets: [] as AssetPreloadResult,
      content: CONTENT_CATALOGUE,
    });
    const { rerender } = render(
      <ApplicationContext.Provider value={value}>
        <MissionDetailsOverlay
          open={false}
          mission={INTERCEPTION_01}
          state="available"
          onClose={onClose}
        />
      </ApplicationContext.Provider>,
    );
    rerender(
      <ApplicationContext.Provider value={value}>
        <MissionDetailsOverlay
          open
          mission={INTERCEPTION_01}
          state="available"
          onClose={onClose}
        />
      </ApplicationContext.Provider>,
    );
    const start = screen.getByRole('button', {
      name: 'Start Mission',
    }) as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(start);
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
