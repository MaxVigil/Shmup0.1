import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { createSessionStore, initializeSession } from '@application/session';
import type { SessionStore } from '@application/session';
import type { AssetPreloadResult } from '@application/ports';
import { CONTENT_CATALOGUE } from '@content/index';
import { ApplicationContext, useApplication } from '@ui/application-context';
import { App } from './app';

afterEach(() => {
  cleanup();
});

describe('App', () => {
  it('renders the Boot View while booting', () => {
    render(<App phase="boot" onReload={vi.fn()} />);
    expect(screen.getByTestId('boot-view').textContent).toBe('Loading…');
  });

  it('renders the Operations screen when ready', () => {
    render(<App phase="ready" onReload={vi.fn()} />);
    expect(screen.getByTestId('operations-screen').textContent).toBe(
      'Operations',
    );
  });

  it('renders the fatal view and wires Reload', () => {
    const onReload = vi.fn();
    render(<App phase="fatal" onReload={onReload} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalledTimes(1);
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
    render(
      <ApplicationContext.Provider value={{ store, preparedAssets }}>
        <Capture />
        <App phase="ready" onReload={vi.fn()} />
      </ApplicationContext.Provider>,
    );
    expect(observedStore).toBe(store);
    expect(observedAssets).toBe(preparedAssets);
    expect(store.getState()?.pilot.name).toBe('Андрій Шевченко');
    expect(screen.getByTestId('operations-screen')).toBeDefined();
  });
});
