import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { createSessionStore, initializeSession } from '@application/session';
import type { SessionStore } from '@application/session';
import type { AssetPreloadResult } from '@application/ports';
import { CONTENT_CATALOGUE } from '@content/index';
import { createApplicationContextValue } from '@test-support/ui';
import { ApplicationContext, useApplication } from '@ui/application-context';
import { App } from './app';

afterEach(() => {
  cleanup();
});

function renderReadyApp(): { store: SessionStore } {
  const store = createSessionStore();
  store.dispatch({
    type: 'session/initialized',
    session: initializeSession(3735928559, CONTENT_CATALOGUE),
  });
  const preparedAssets: AssetPreloadResult = [];
  const value = createApplicationContextValue({
    store,
    preparedAssets,
    content: CONTENT_CATALOGUE,
  });
  render(
    <ApplicationContext.Provider value={value}>
      <App phase="ready" onReload={vi.fn()} onSaveDataResolved={vi.fn()} />
    </ApplicationContext.Provider>,
  );
  return { store };
}

describe('App', () => {
  it('renders the Boot View while booting', () => {
    render(
      <App phase="boot" onReload={vi.fn()} onSaveDataResolved={vi.fn()} />,
    );
    expect(screen.getByTestId('boot-view').textContent).toBe('Loading…');
  });

  it('renders the Base shell with Operations when ready', () => {
    renderReadyApp();
    expect(screen.getByRole('main', { name: 'Operations' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Operations' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Interception' })).toBeDefined();
    expect(
      screen.getByRole('navigation', { name: 'Base Navigation' }),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeDefined();
  });

  it('renders the fatal view and wires Reload', () => {
    const onReload = vi.fn();
    render(
      <App phase="fatal" onReload={onReload} onSaveDataResolved={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('renders the Save Data Error Screen with its destructive New Game resolution', () => {
    const onSaveDataResolved = vi.fn();
    const value = createApplicationContextValue({});
    render(
      <ApplicationContext.Provider value={value}>
        <App
          phase="save-data-error"
          onReload={vi.fn()}
          onSaveDataResolved={onSaveDataResolved}
        />
      </ApplicationContext.Provider>,
    );
    expect(screen.getByTestId('save-data-error-screen')).toBeDefined();
    expect(
      screen.getByText('Saved game data could not be loaded.'),
    ).toBeDefined();
  });

  it('delivers the exact initialized store and prepared assets to the ready composition', () => {
    const store: SessionStore = createSessionStore();
    store.dispatch({
      type: 'session/initialized',
      session: initializeSession(3735928559, CONTENT_CATALOGUE),
    });
    const preparedAssets: AssetPreloadResult = [
      {
        id: 'icon-gear',
        kind: 'icon',
        sourcePath: 'assets/runtime/icons/gear.svg',
        url: '/icons/gear.svg',
        status: 'ready',
      },
    ];
    let observedStore: SessionStore | undefined;
    let observedAssets: AssetPreloadResult | undefined;
    function Capture(): ReactElement | null {
      const application = useApplication();
      observedStore = application.store;
      observedAssets = application.preparedAssets;
      return null;
    }
    const value = createApplicationContextValue({
      store,
      preparedAssets,
      content: CONTENT_CATALOGUE,
    });
    render(
      <ApplicationContext.Provider value={value}>
        <Capture />
        <App phase="ready" onReload={vi.fn()} onSaveDataResolved={vi.fn()} />
      </ApplicationContext.Provider>,
    );
    expect(observedStore).toBe(store);
    expect(observedAssets).toBe(preparedAssets);
    expect(store.getState()?.pilot.name).toBe('Андрій Шевченко');
    expect(screen.getByTestId('operations-screen')).toBeDefined();
  });
});
