import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  InMemoryCampaignStore,
  InMemoryUserSettingsStore,
  campaignSchemaContext,
} from '@test-support/persistence';
import { createApplicationContextValue } from '@test-support/ui';
import { CONTENT_CATALOGUE } from '@test-support/content';
import { ApplicationContext } from '../application-context';
import { SaveDataErrorScreen } from './save-data-error-screen';

afterEach(() => {
  cleanup();
});

function renderScreen(onResolved: () => void): void {
  const value = createApplicationContextValue({});
  render(
    <ApplicationContext.Provider value={value}>
      <SaveDataErrorScreen onResolved={onResolved} />
    </ApplicationContext.Provider>,
  );
}

describe('SaveDataErrorScreen (Epic §14.2, V02-AC-021)', () => {
  it('renders the canonical copy and the Start New Game action', () => {
    renderScreen(vi.fn());
    expect(screen.getByRole('main', { name: 'Save Data Error' })).toBeDefined();
    expect(screen.getByText('Save Data Error')).toBeDefined();
    expect(
      screen.getByText('Saved game data could not be loaded.'),
    ).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Start New Game' }),
    ).toBeDefined();
  });

  it('Start New Game opens the blocking destructive confirmation focused on Cancel', () => {
    renderScreen(vi.fn());
    fireEvent.click(screen.getByRole('button', { name: 'Start New Game' }));
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText(
        'Start a new game? Current run progress will be reset.',
      ),
    ).toBeDefined();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Cancel' }),
    );
  });

  it('Cancel returns to the error Screen and never overwrites the unreadable data', () => {
    renderScreen(vi.fn());
    fireEvent.click(screen.getByRole('button', { name: 'Start New Game' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('main', { name: 'Save Data Error' })).toBeDefined();
  });

  it('confirming New Game initializes the session and resolves the phase', async () => {
    const onResolved = vi.fn();
    const campaignStore = new InMemoryCampaignStore(
      campaignSchemaContext(CONTENT_CATALOGUE),
    );
    const userSettingsStore = new InMemoryUserSettingsStore();
    const value = createApplicationContextValue({
      campaignStore,
      userSettingsStore,
    });
    render(
      <ApplicationContext.Provider value={value}>
        <SaveDataErrorScreen onResolved={onResolved} />
      </ApplicationContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start New Game' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    });
    await act(async () => {});
    expect(onResolved).toHaveBeenCalledTimes(1);
    const session = value.store.getState();
    expect(session?.runStatus).toBe('active');
    expect(session?.credits).toBe(12);
    expect(campaignStore.current?.credits).toBe(12);
  });
});
