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
import { ApplicationContext } from '../application-context';
import { AircraftConfigurationPanel } from './aircraft-configuration-panel';

afterEach(() => {
  cleanup();
});

function storeWithHull(hullIntegrity: number, credits = 1): SessionStore {
  const store = createSessionStore();
  store.dispatch({
    type: 'session/initialized',
    session: {
      ...initializeSession(3735928559, CONTENT_CATALOGUE),
      hullIntegrity,
      credits,
    },
  });
  return store;
}

function renderPanel(store: SessionStore): void {
  render(
    <ApplicationContext.Provider
      value={{ store, preparedAssets: [], content: CONTENT_CATALOGUE }}
    >
      <AircraftConfigurationPanel onOpenWeaponSelection={vi.fn()} />
    </ApplicationContext.Provider>,
  );
}

describe('AircraftConfigurationPanel', () => {
  it('displays the fixed content order (Base AC-016, DS §8.13)', () => {
    renderPanel(storeWithHull(100));
    expect(screen.getByText('German Fighter')).toBeDefined();
    expect(screen.getByText('Pilot')).toBeDefined();
    expect(screen.getByText('Андрій Шевченко')).toBeDefined();
    expect(screen.getByText('Hull Integrity')).toBeDefined();
    expect(screen.getByRole('progressbar')).toBeDefined();
    expect(screen.getByText('100 / 100')).toBeDefined();
    expect(screen.getByText('Primary Weapon')).toBeDefined();
    expect(screen.getByText('Machine Gun')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Change Weapon' })).toBeDefined();
  });

  it('hides the entire Repair section at full Hull Integrity (Base AC-025)', () => {
    renderPanel(storeWithHull(100));
    expect(screen.queryByRole('button', { name: 'Repair' })).toBeNull();
    expect(screen.queryByText('Cost: 1 Credit')).toBeNull();
  });

  it('shows Repair with Credits and Cost and enables it when affordable (Base AC-026)', () => {
    renderPanel(storeWithHull(40));
    // The Repair section heading and the Repair action both carry the label.
    expect(screen.getAllByText('Repair').length).toBeGreaterThan(0);
    expect(screen.getByText('Credits')).toBeDefined();
    expect(screen.getByText('Cost')).toBeDefined();
    expect(screen.getByText('1 Credit')).toBeDefined();
    const repair = screen.getByRole('button', {
      name: 'Repair',
    }) as HTMLButtonElement;
    expect(repair.disabled).toBe(false);
  });

  it('disables Repair without Credits and shows no insufficient message (Base AC-027)', () => {
    renderPanel(storeWithHull(40, 0));
    const repair = screen.getByRole('button', {
      name: 'Repair',
    }) as HTMLButtonElement;
    expect(repair.disabled).toBe(true);
    expect(screen.queryByText('Insufficient')).toBeNull();
  });

  it('applies Repair atomically: one Credit, full Hull, section disappears (Base AC-028)', () => {
    const store = storeWithHull(40, 1);
    renderPanel(store);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Repair' }));
    });
    expect(store.getState()?.credits).toBe(0);
    expect(store.getState()?.hullIntegrity).toBe(100);
    expect(screen.queryByRole('button', { name: 'Repair' })).toBeNull();
    expect(screen.getByText('100 / 100')).toBeDefined();
  });

  it('opens the Weapon Selection from Change Weapon', () => {
    const onOpenWeaponSelection = vi.fn();
    render(
      <ApplicationContext.Provider
        value={{
          store: storeWithHull(100),
          preparedAssets: [],
          content: CONTENT_CATALOGUE,
        }}
      >
        <AircraftConfigurationPanel
          onOpenWeaponSelection={onOpenWeaponSelection}
        />
      </ApplicationContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Change Weapon' }));
    expect(onOpenWeaponSelection).toHaveBeenCalledTimes(1);
  });
});
