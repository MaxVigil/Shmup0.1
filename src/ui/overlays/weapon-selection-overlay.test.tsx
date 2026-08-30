import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionStore, initializeSession } from '@application/session';
import type { SessionStore } from '@application/session';
import { CONTENT_CATALOGUE } from '@test-support/content';
import { createApplicationContextValue } from '@test-support/ui';
import { ApplicationContext } from '../application-context';
import { WeaponSelectionOverlay } from './weapon-selection-overlay';

afterEach(() => {
  cleanup();
});

function storeWithWeapon(
  weapon: 'machine-gun' | 'cannon' = 'machine-gun',
): SessionStore {
  const store = createSessionStore();
  store.dispatch({
    type: 'session/initialized',
    session: {
      ...initializeSession(3735928559, CONTENT_CATALOGUE),
      equippedWeapon: weapon,
    },
  });
  return store;
}

function renderOverlay(store: SessionStore, onClose: () => void): void {
  render(
    <ApplicationContext.Provider
      value={createApplicationContextValue({
        store,
        preparedAssets: [],
        content: CONTENT_CATALOGUE,
      })}
    >
      <WeaponSelectionOverlay open onClose={onClose} />
    </ApplicationContext.Provider>,
  );
}

describe('WeaponSelectionOverlay', () => {
  it('renders both weapons with canonical statistics and Confirm left / Cancel right (Base AC-020)', () => {
    const store = storeWithWeapon();
    renderOverlay(store, vi.fn());
    const dialog = screen.getByRole('dialog');
    expect(
      screen.getByRole('heading', { name: 'Select Primary Weapon' }),
    ).toBeDefined();
    expect(screen.getByText('Machine Gun')).toBeDefined();
    expect(screen.getByText('Cannon')).toBeDefined();
    expect(screen.getByText('6 shots/s')).toBeDefined();
    expect(screen.getByText('3 hits')).toBeDefined();
    expect(screen.getByText('2 shots/s')).toBeDefined();
    expect(screen.getByText('1 hit')).toBeDefined();
    expect(dialog.querySelectorAll('button')).toHaveLength(2);
    expect(dialog.getElementsByClassName('ds-weapon-option').length).toBe(2);

    const confirm = screen.getByRole('button', { name: 'Confirm' });
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(confirm.className).toContain('ds-button--primary');
    expect(cancel.className).toContain('ds-button--secondary');
    // The action row is rendered Start/Confirm before Cancel (DS §8.18 left
    // then right; the visual arrangement is covered by the browser e2e).
    const actions = dialog.querySelector('.ds-overlay__actions') as HTMLElement;
    const actionButtons = Array.from(actions.querySelectorAll('button'));
    expect(actionButtons[0]).toBe(confirm);
    expect(actionButtons[1]).toBe(cancel);
  });

  it('moves initial focus to the equipped weapon option (DS §10.4)', () => {
    const store = storeWithWeapon('machine-gun');
    renderOverlay(store, vi.fn());
    expect(document.activeElement).toBe(
      screen.getByRole('radio', { name: /Machine Gun/ }),
    );
  });

  it('moves initial focus to the equipped weapon when it is the second option', () => {
    const store = storeWithWeapon('cannon');
    renderOverlay(store, vi.fn());
    expect(document.activeElement).toBe(
      screen.getByRole('radio', { name: /Cannon/ }),
    );
  });

  it('changes only the pending selection until Confirm (Base AC-021, AC-022)', () => {
    const store = storeWithWeapon('machine-gun');
    const onClose = vi.fn();
    renderOverlay(store, onClose);
    const cannon = screen.getByRole('radio', {
      name: /Cannon/,
    }) as HTMLInputElement;

    act(() => {
      fireEvent.click(cannon);
    });
    // Pending changed but the equipped weapon is unchanged.
    expect(cannon.checked).toBe(true);
    expect(store.getState()?.equippedWeapon).toBe('machine-gun');

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    });
    expect(store.getState()?.equippedWeapon).toBe('cannon');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Cancel and Esc discard the pending selection (Base AC-023)', () => {
    const store = storeWithWeapon('machine-gun');
    const onClose = vi.fn();
    renderOverlay(store, onClose);
    act(() => {
      fireEvent.click(screen.getByRole('radio', { name: /Cannon/ }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(store.getState()?.equippedWeapon).toBe('machine-gun');
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('radio', { name: /Cannon/ }));
    fireEvent.keyDown(
      document.querySelector('.ds-overlay__surface') as Element,
      { key: 'Escape' },
    );
    expect(store.getState()?.equippedWeapon).toBe('machine-gun');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('does not close when clicking outside (Base AC-024)', () => {
    const store = storeWithWeapon();
    const onClose = vi.fn();
    renderOverlay(store, onClose);
    fireEvent.click(document.querySelector('.ds-overlay__scrim') as Element);
    expect(onClose).not.toHaveBeenCalled();
  });
});
