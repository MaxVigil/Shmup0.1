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
import type { ContentCatalogue } from '@application/content';
import { INTERCEPTION_01, INTERCEPTION_03 } from '@application/content';
import { contentCatalogueWith } from '@test-support/content';
import {
  createInitializedSessionStore,
  successMissionResult,
} from '@test-support/session';
import { createApplicationContextValue } from '@test-support/ui';
import { CONTENT_CATALOGUE } from '@test-support/content';
import { ApplicationContext } from '../application-context';
import { OperationsScreen } from './operations-screen';

afterEach(() => {
  cleanup();
});

const BACKGROUND_READY: AssetPreloadResult = [
  {
    id: 'operations-background',
    kind: 'background',
    sourcePath: 'assets/runtime/backgrounds/operations-background.webp',
    url: '/backgrounds/operations-background.webp',
    status: 'ready',
  },
];

function renderScreen(assets: AssetPreloadResult): void {
  renderScreenWithStore(assets, createInitializedSessionStore());
}

function renderScreenWithStore(
  assets: AssetPreloadResult,
  store: SessionStore,
): void {
  renderScreenWithContent(assets, store, CONTENT_CATALOGUE);
}

function renderScreenWithContent(
  assets: AssetPreloadResult,
  store: SessionStore,
  content: ContentCatalogue,
): void {
  const value = createApplicationContextValue({
    store,
    preparedAssets: assets,
    content,
  });
  render(
    <ApplicationContext.Provider value={value}>
      <OperationsScreen />
    </ApplicationContext.Provider>,
  );
}

function storeWithPendingResult(): SessionStore {
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
    result: successMissionResult({
      missionInstanceOrdinal: 0,
      creditsAfter: 13,
      hullIntegrityAfter: 80,
      unlockedMissionIdsAfter: ['interception-01', 'interception-02'],
      completedMissionIdsAfter: ['interception-01'],
      creditsEarned: 8,
    }),
  });
  return store;
}

function backgroundElement(): HTMLElement {
  const element = document.querySelector('.ds-operations-background');
  if (element === null) {
    throw new Error('Operations background element is missing.');
  }
  return element as HTMLElement;
}

describe('OperationsScreen', () => {
  it('renders the accessible Screen name, Credits Panel, and three Mission Points (Base AC-007, Epic §6.1, V02-AC-001)', () => {
    renderScreen(BACKGROUND_READY);
    expect(screen.getByRole('main', { name: 'Operations' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Operations' })).toBeNull();
    expect(screen.getByText('Credits: 12')).toBeDefined();
    // A New Game shows exactly the three visible points: 01 available, 02 and
    // 03 locked (V02-AC-001).
    expect(
      screen.getByRole('button', { name: 'Interception 01' }),
    ).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Interception 02 (Locked)' }),
    ).toBeDefined();
    expect(
      (
        screen.getByRole('button', {
          name: 'Interception 02 (Locked)',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: 'Interception 03 (Locked)',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(backgroundElement().style.backgroundImage).toContain(
      '/backgrounds/operations-background.webp',
    );
  });

  it('reuses the prepared background inline data URI instead of a second request (MASTER-AC-014, V02-WI-02 C02)', () => {
    renderScreen([
      {
        ...BACKGROUND_READY[0]!,
        imageDataUri: 'data:image/webp;base64,AAAA',
      },
    ]);
    expect(backgroundElement().style.backgroundImage).toContain(
      'data:image/webp;base64,AAAA',
    );
    expect(backgroundElement().style.backgroundImage).not.toContain(
      '/backgrounds/operations-background.webp',
    );
  });

  it('shows the solid dark fallback when the background asset is not ready (Base AC-008)', () => {
    renderScreen([]);
    expect(backgroundElement().style.backgroundImage).toBe('');
  });

  it('opens Mission Details for an available mission and leaves Operations current (Base AC-009, V02-WI-03)', () => {
    renderScreen([]);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Interception 01' }));
    });
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(
      screen.getByRole('heading', { name: 'Interception 01' }),
    ).toBeDefined();
    expect(screen.getByRole('main', { name: 'Operations' })).toBeDefined();
  });

  it('a locked Mission Point is structurally non-launchable and cannot open Mission Details (Epic §6.1)', () => {
    renderScreen([]);
    const locked = screen.getByRole('button', {
      name: 'Interception 02 (Locked)',
    });
    expect((locked as HTMLButtonElement).disabled).toBe(true);
    // A programmatic activation of the disabled marker cannot open the flow.
    fireEvent.click(locked);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start Mission' })).toBeNull();
  });

  it('a completed mission remains launchable for replay (Epic §6.2, V02-AC-002)', () => {
    const store = createInitializedSessionStore();
    const session = store.getState();
    if (session === null) {
      throw new Error('Expected an initialized session.');
    }
    store.dispatch({
      type: 'session/new-game',
      session: {
        ...session,
        unlockedMissionIds: ['interception-01', 'interception-02'],
        completedMissionIds: ['interception-01'],
      },
    });
    renderScreenWithStore([], store);
    const completed = screen.getByRole('button', {
      name: 'Interception 01 (Completed)',
    });
    expect((completed as HTMLButtonElement).disabled).toBe(false);
    act(() => {
      fireEvent.click(completed);
    });
    expect(screen.getByRole('dialog')).toBeDefined();
    // The replay mission is the same validated definition with its own reward.
    expect(
      screen.getByRole('heading', { name: 'Interception 01' }),
    ).toBeDefined();
  });

  it('while a Mission Result is pending the Mission Points cannot open the Start Mission flow (S12-WI01)', () => {
    const store = storeWithPendingResult();
    renderScreenWithStore([], store);
    expect(store.getState()!.missionResult).toMatchObject({
      kind: 'success',
      missionInstanceOrdinal: 0,
    });
    // A programmatic Mission Point activation must not open Mission Details /
    // the Start Mission flow beneath the only continuation point.
    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Interception 01 (Completed)' }),
      );
    });
    expect(screen.queryByRole('button', { name: 'Start Mission' })).toBeNull();
    // The pending result is untouched.
    expect(store.getState()!.missionResult).toMatchObject({
      kind: 'success',
      missionInstanceOrdinal: 0,
    });
  });

  it('renders only missions present in the injected catalogue and never substitutes global content (V02-WI-03 correction)', () => {
    // The injected catalogue omits Interception 02 (still present in the
    // global MISSIONS registry). Operations must render only the injected
    // missions and must not display the global substituted mission.
    const injected = contentCatalogueWith({
      missions: [INTERCEPTION_01, INTERCEPTION_03],
    });
    renderScreenWithContent([], createInitializedSessionStore(), injected);
    expect(
      screen.getByRole('button', { name: 'Interception 01' }),
    ).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Interception 03 (Locked)' }),
    ).toBeDefined();
    expect(
      screen.queryByRole('button', { name: 'Interception 02' }),
    ).toBeNull();
  });

  it('a failed start for a mission absent from the injected catalogue opens no substituted Mission Details (V02-WI-03 correction)', () => {
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
      type: 'mission/start-failed',
      // V02-DEC-031: the start-failure signal carries the full originating
      // snapshot identity; a cross-mission id cannot clear the Active Mission
      // or reopen a substituted Mission Details Overlay.
      missionId: 'interception-02',
      missionAttemptId: 0,
      missionInstanceOrdinal: 0,
    });
    const injected = contentCatalogueWith({
      missions: [INTERCEPTION_01, INTERCEPTION_03],
    });
    renderScreenWithContent([], store, injected);
    // The failed mission is not in the injected catalogue, so resolving the
    // selected mission must yield nothing — no substituted dialog can open.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start Mission' })).toBeNull();
    expect(store.getState()?.missionStartFailedMissionId).toBeNull();
  });
});
