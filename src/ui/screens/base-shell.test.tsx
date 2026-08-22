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
import { BaseShell } from './base-shell';

afterEach(() => {
  cleanup();
});

function renderShell(store: SessionStore): void {
  const preparedAssets: AssetPreloadResult = [];
  render(
    <ApplicationContext.Provider
      value={{ store, preparedAssets, content: CONTENT_CATALOGUE }}
    >
      <BaseShell />
    </ApplicationContext.Provider>,
  );
}

describe('BaseShell', () => {
  it('renders the persistent Navigation, current Screen, and Settings control (Base AC-002, AC-006)', () => {
    const store = createInitializedSessionStore();
    renderShell(store);
    const nav = screen.getByRole('navigation', { name: 'Base Navigation' });
    expect(nav.querySelectorAll('button')).toHaveLength(2);
    const operations = screen.getByRole('button', { name: 'Operations' });
    const hangar = screen.getByRole('button', { name: 'Hangar' });
    expect(operations.getAttribute('aria-current')).toBe('page');
    expect(hangar.getAttribute('aria-current')).toBeNull();
    expect(screen.getByTestId('operations-screen')).toBeDefined();
    expect(screen.queryByTestId('hangar-screen')).toBeNull();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeDefined();
  });

  it('navigates to Hangar, updates the active item, and focuses the active Navigation Item (Base AC-004, AC-052)', () => {
    const store = createInitializedSessionStore();
    renderShell(store);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Hangar' }));
    });
    expect(store.getState()?.currentScreen).toBe('hangar');
    expect(screen.getByTestId('hangar-screen')).toBeDefined();
    expect(screen.queryByTestId('operations-screen')).toBeNull();
    expect(
      screen
        .getByRole('button', { name: 'Hangar' })
        .getAttribute('aria-current'),
    ).toBe('page');
    expect(
      screen
        .getByRole('button', { name: 'Operations' })
        .getAttribute('aria-current'),
    ).toBeNull();
    // Screen-transition focus moves to the active Navigation Item (AC-052).
    expect(document.activeElement?.textContent).toBe('Hangar');
  });

  it('does not change the screen or shared state when the active item is selected (Base AC-003)', () => {
    const store = createInitializedSessionStore();
    renderShell(store);
    const before = store.getState();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Operations' }));
    });
    expect(store.getState()).toBe(before);
    expect(screen.getByTestId('operations-screen')).toBeDefined();
  });

  it('opens Settings, blocks navigation, and restores focus to the Settings button on close (Base AC-005, AC-006, AC-051)', () => {
    const store = createInitializedSessionStore();
    renderShell(store);
    const settingsButton = screen.getByRole('button', { name: 'Settings' });
    // Real pointer activation moves focus to the opening control before the
    // Overlay captures it for restoration (jsdom clicks do not move focus).
    settingsButton.focus();
    act(() => {
      fireEvent.click(settingsButton);
    });
    expect(screen.getByRole('dialog')).toBeDefined();

    // Base Navigation is blocked while the blocking Overlay is open (AC-005).
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Hangar' }));
    });
    expect(store.getState()?.currentScreen).toBe('operations');
    expect(screen.getByRole('dialog')).toBeDefined();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    // Closing restores focus to the still-existing opener (Base AC-051).
    expect(document.activeElement).toBe(settingsButton);
  });

  it('retains the shared setting across Base navigation (Base AC-039, AC-037)', () => {
    const store = createInitializedSessionStore();
    renderShell(store);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    });
    act(() => {
      fireEvent.click(screen.getByRole('checkbox'));
    });
    expect(store.getState()?.mouseMovementEnabled).toBe(false);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Hangar' }));
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    });
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(
      false,
    );
  });
});
