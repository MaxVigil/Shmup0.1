import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { createSessionStore } from '@application/session';
import { ApplicationContext, useApplication } from './application-context';

afterEach(() => {
  cleanup();
});

function Probe(): ReactElement | null {
  // Reads the context during render; the caller captures the value.
  useApplication();
  return null;
}

describe('useApplication', () => {
  it('throws when the composition root does not provide the context', () => {
    expect(() => render(<Probe />)).toThrow('ApplicationContext is missing');
  });

  it('returns the exact provided store and prepared assets', () => {
    const store = createSessionStore();
    const preparedAssets = [
      {
        id: 'icon-gear',
        kind: 'icon' as const,
        sourcePath: 'assets/runtime/icons/gear.svg',
        url: '/icons/gear.svg',
        status: 'ready' as const,
      },
    ];
    let observed: { store: unknown; preparedAssets: unknown } | undefined;
    function Capture(): ReactElement | null {
      const application = useApplication();
      observed = {
        store: application.store,
        preparedAssets: application.preparedAssets,
      };
      return null;
    }
    render(
      <ApplicationContext.Provider value={{ store, preparedAssets }}>
        <Capture />
      </ApplicationContext.Provider>,
    );
    expect(observed?.store).toBe(store);
    expect(observed?.preparedAssets).toBe(preparedAssets);
  });
});
