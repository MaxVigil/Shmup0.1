import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { AssetPreloadResult } from '@application/ports';
import { createInitializedSessionStore } from '@test-support/session';
import { CONTENT_CATALOGUE } from '@test-support/content';
import { ApplicationContext } from '../application-context';
import { OperationsScreen } from './operations-screen';

afterEach(() => {
  cleanup();
});

const BACKGROUND_READY: AssetPreloadResult = [
  {
    id: 'operations-background',
    kind: 'background',
    sourcePath: 'assets/runtime/backgrounds/operations-background.webp',
    url: '/backgrounds/operations-background.webp',
    status: 'ready',
  },
];

function renderScreen(assets: AssetPreloadResult): void {
  const store = createInitializedSessionStore();
  render(
    <ApplicationContext.Provider
      value={{ store, preparedAssets: assets, content: CONTENT_CATALOGUE }}
    >
      <OperationsScreen />
    </ApplicationContext.Provider>,
  );
}

function backgroundElement(): HTMLElement {
  const element = document.querySelector('.ds-operations-background');
  if (element === null) {
    throw new Error('Operations background element is missing.');
  }
  return element as HTMLElement;
}

describe('OperationsScreen', () => {
  it('renders the accessible Screen name, Credits Panel, Mission Point, and background (Base AC-007)', () => {
    renderScreen(BACKGROUND_READY);
    expect(screen.getByRole('main', { name: 'Operations' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Operations' })).toBeNull();
    expect(screen.getByText('Credits: 1')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Interception' })).toBeDefined();
    expect(backgroundElement().style.backgroundImage).toContain(
      '/backgrounds/operations-background.webp',
    );
  });

  it('shows the solid dark fallback when the background asset is not ready (Base AC-008)', () => {
    renderScreen([]);
    expect(backgroundElement().style.backgroundImage).toBe('');
  });

  it('opens Mission Details Overlay from the Mission Point and leaves Operations current (Base AC-009)', () => {
    renderScreen([]);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Interception' }));
    });
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByRole('main', { name: 'Operations' })).toBeDefined();
  });
});
