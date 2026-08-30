import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { createSessionStore } from '@application/session';
import type { SessionStore } from '@application/session';
import type { AssetPreloadResult } from '@application/ports';
import { createInitializedSessionStore } from '@test-support/session';
import { CONTENT_CATALOGUE } from '@test-support/content';
import { createApplicationContextValue } from '@test-support/ui';
import { ApplicationContext } from '../application-context';
import { useSessionState } from './use-session-state';

afterEach(() => {
  cleanup();
});

function renderWithStore(
  store: SessionStore,
  probe: () => ReactElement | null,
): void {
  const preparedAssets: AssetPreloadResult = [];
  render(
    <ApplicationContext.Provider
      value={createApplicationContextValue({
        store,
        preparedAssets,
        content: CONTENT_CATALOGUE,
      })}
    >
      {probe()}
    </ApplicationContext.Provider>,
  );
}

describe('useSessionState', () => {
  it('throws when no initialized session exists', () => {
    const emptyStore = createSessionStore();
    const Probe = (): ReactElement | null => {
      useSessionState();
      return null;
    };
    expect(() => renderWithStore(emptyStore, () => <Probe />)).toThrow(
      'SessionState is missing',
    );
  });

  it('returns the session and re-renders on store changes', () => {
    const store = createInitializedSessionStore();
    const seen: string[] = [];
    const Probe = (): ReactElement | null => {
      seen.push(useSessionState().currentScreen);
      return null;
    };
    renderWithStore(store, () => <Probe />);
    expect(seen).toEqual(['operations']);

    act(() => {
      store.dispatch({ type: 'session/navigate', target: 'hangar' });
    });
    expect(seen).toEqual(['operations', 'hangar']);

    act(() => {
      store.dispatch({ type: 'session/navigate', target: 'hangar' });
    });
    // A no-op navigation does not notify subscribers, so no re-render occurs.
    expect(seen).toEqual(['operations', 'hangar']);
  });
});
