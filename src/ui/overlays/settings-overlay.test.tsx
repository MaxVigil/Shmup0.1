import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionStore } from '@application/session';
import type { AssetPreloadResult } from '@application/ports';
import { createInitializedSessionStore } from '@test-support/session';
import { CONTENT_CATALOGUE } from '@test-support/content';
import { ApplicationContext } from '../application-context';
import { SettingsOverlay } from './settings-overlay';

afterEach(() => {
  cleanup();
});

function renderOverlay(store: SessionStore, onClose: () => void): void {
  const preparedAssets: AssetPreloadResult = [];
  render(
    <ApplicationContext.Provider
      value={{ store, preparedAssets, content: CONTENT_CATALOGUE }}
    >
      <SettingsOverlay open onClose={onClose} />
    </ApplicationContext.Provider>,
  );
}

describe('SettingsOverlay', () => {
  it('contains only Mouse Movement Enabled and Close (Base AC-006, DS §8.19)', () => {
    const store = createInitializedSessionStore();
    renderOverlay(store, vi.fn());
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-labelledby')).toBe(
      'settings-overlay-title',
    );
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeDefined();
    expect(screen.getByRole('checkbox')).toBeDefined();
    expect(screen.getByText('Mouse Movement Enabled')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDefined();
    // Exactly one control besides the heading content.
    expect(dialog.querySelectorAll('button, input')).toHaveLength(2);
  });

  it('moves initial focus to the Mouse Movement Enabled checkbox (DS §10.4)', () => {
    const store = createInitializedSessionStore();
    renderOverlay(store, vi.fn());
    expect(document.activeElement).toBe(screen.getByRole('checkbox'));
  });

  it('updates the single shared setting immediately (Base AC-044)', () => {
    const store = createInitializedSessionStore();
    renderOverlay(store, vi.fn());
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    act(() => {
      fireEvent.click(checkbox);
    });
    expect(store.getState()?.mouseMovementEnabled).toBe(false);
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(
      false,
    );
  });

  it('closes through the Close action and Esc without changing the Screen or setting', () => {
    const store = createInitializedSessionStore();
    const onClose = vi.fn();
    renderOverlay(store, onClose);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(store.getState()?.currentScreen).toBe('operations');
    expect(store.getState()?.mouseMovementEnabled).toBe(true);

    // Esc is equivalent to Close (Base AC-006).
    fireEvent.keyDown(
      document.querySelector('.ds-overlay__surface') as Element,
      { key: 'Escape' },
    );
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('does not close when clicking the Scrim (Base AC-006)', () => {
    const store = createInitializedSessionStore();
    const onClose = vi.fn();
    renderOverlay(store, onClose);
    fireEvent.click(document.querySelector('.ds-overlay__scrim') as Element);
    expect(onClose).not.toHaveBeenCalled();
  });
});
