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
import { HangarScreen } from './hangar-screen';

afterEach(() => {
  cleanup();
});

const HANGAR_ASSETS: AssetPreloadResult = [
  {
    id: 'hangar-background',
    kind: 'background',
    sourcePath: 'assets/runtime/backgrounds/hangar-background.webp',
    url: '/backgrounds/hangar-background.webp',
    status: 'ready',
  },
  {
    id: 'german-fighter',
    kind: 'aircraft-image',
    sourcePath: 'assets/runtime/aircraft/german-fighter.png',
    url: '/aircraft/german-fighter.png',
    status: 'ready',
  },
];

function renderScreen(assets: AssetPreloadResult): void {
  const store = createInitializedSessionStore();
  render(
    <ApplicationContext.Provider
      value={{ store, preparedAssets: assets, content: CONTENT_CATALOGUE }}
    >
      <HangarScreen />
    </ApplicationContext.Provider>,
  );
}

describe('HangarScreen', () => {
  it('renders the heading, Configuration Panel, and aircraft visual (Base AC-015, AC-016)', () => {
    renderScreen(HANGAR_ASSETS);
    expect(screen.getByRole('heading', { name: 'Hangar' })).toBeDefined();
    expect(screen.getByText('German Fighter')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Change Weapon' })).toBeDefined();
    const image = document.querySelector(
      'img.ds-hangar-aircraft',
    ) as HTMLImageElement;
    expect(image.src).toContain('/aircraft/german-fighter.png');
    expect(image.alt).toBe('German Fighter');
    const background = document.querySelector(
      '.ds-hangar-background',
    ) as HTMLElement;
    expect(background.style.backgroundImage).toContain(
      '/backgrounds/hangar-background.webp',
    );
  });

  it('shows the neutral German Fighter placeholder when the asset is not ready (Base AC-017)', () => {
    renderScreen([]);
    expect(document.querySelector('img.ds-hangar-aircraft')).toBeNull();
    // The placeholder label and the panel aircraft title both say German Fighter.
    expect(screen.getAllByText('German Fighter').length).toBeGreaterThan(0);
    const background = document.querySelector(
      '.ds-hangar-background',
    ) as HTMLElement;
    expect(background.style.backgroundImage).toBe('');
  });

  it('opens the Weapon Selection Overlay from Change Weapon and blocks the screen (Base AC-019, AC-024)', () => {
    renderScreen(HANGAR_ASSETS);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Change Weapon' }));
    });
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(
      screen.getByRole('heading', { name: 'Select Primary Weapon' }),
    ).toBeDefined();
  });
});
