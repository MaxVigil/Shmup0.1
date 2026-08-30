import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { SessionStore } from '@application/session';
import { createInitializedSessionStore } from '@test-support/session';
import {
  InMemoryCampaignStore,
  InMemoryUserSettingsStore,
  campaignSchemaContext,
} from '@test-support/persistence';
import { createApplicationContextValue } from '@test-support/ui';
import { CONTENT_CATALOGUE } from '@test-support/content';
import { ApplicationContext } from '../application-context';
import { GameOverScreen } from './game-over-screen';

afterEach(() => {
  cleanup();
});

function gameOverStore(): SessionStore {
  const store = createInitializedSessionStore();
  const session = store.getState();
  if (session === null) {
    throw new Error('Expected an initialized session.');
  }
  store.dispatch({
    type: 'session/new-game',
    session: { ...session, runStatus: 'game-over', credits: 7 },
  });
  return store;
}

function renderScreen(store: SessionStore): void {
  const value = createApplicationContextValue({ store });
  render(
    <ApplicationContext.Provider value={value}>
      <GameOverScreen />
    </ApplicationContext.Provider>,
  );
}

describe('GameOverScreen (Epic §13.6, V02-AC-016/017)', () => {
  it('renders the canonical terminal copy and the New Game action', () => {
    renderScreen(gameOverStore());
    expect(screen.getByRole('main', { name: 'Game Over' })).toBeDefined();
    expect(screen.getByText('Game Over')).toBeDefined();
    expect(screen.getByText('The aircraft cannot be repaired.')).toBeDefined();
    expect(screen.getByText('The current operation is over.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'New Game' })).toBeDefined();
  });

  it('New Game opens the blocking destructive confirmation focused on Cancel', () => {
    renderScreen(gameOverStore());
    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText(
        'Start a new game? Current run progress will be reset.',
      ),
    ).toBeDefined();
    // Safe default focus: Cancel.
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Cancel' }),
    );
  });

  it('Cancel closes the confirmation and returns to Game Over without changes', () => {
    const store = gameOverStore();
    renderScreen(store);
    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('main', { name: 'Game Over' })).toBeDefined();
    expect(store.getState()?.runStatus).toBe('game-over');
    expect(store.getState()?.credits).toBe(7); // nothing was overwritten
  });

  it('Esc is equivalent to Cancel for the confirmation', () => {
    renderScreen(gameOverStore());
    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('confirming New Game atomically replaces the run and resets the session', async () => {
    const store = gameOverStore();
    const campaignStore = new InMemoryCampaignStore(
      campaignSchemaContext(CONTENT_CATALOGUE),
    );
    const userSettingsStore = new InMemoryUserSettingsStore();
    const value = createApplicationContextValue({
      store,
      campaignStore,
      userSettingsStore,
    });
    render(
      <ApplicationContext.Provider value={value}>
        <GameOverScreen />
      </ApplicationContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    });
    await act(async () => {});
    // The session reset mirrors the persisted fresh campaign.
    const session = store.getState()!;
    expect(session.runStatus).toBe('active');
    expect(session.credits).toBe(12);
    expect(session.hullIntegrity).toBe(100);
    expect(session.currentScreen).toBe('operations');
    expect(campaignStore.current?.credits).toBe(12);
    expect(campaignStore.current?.missionInProgress).toBeNull();
  });
});
