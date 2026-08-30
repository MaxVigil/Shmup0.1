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
import { createApplicationContextValue } from '@test-support/ui';
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
      value={createApplicationContextValue({
        store,
        preparedAssets: assets,
        content: CONTENT_CATALOGUE,
      })}
    >
      <HangarScreen />
    </ApplicationContext.Provider>,
  );
}

describe('HangarScreen', () => {
  it('renders the accessible Screen name, Configuration Panel, and aircraft visual (Base AC-015, AC-016)', () => {
    renderScreen(HANGAR_ASSETS);
    expect(screen.getByRole('main', { name: 'Hangar' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Hangar' })).toBeNull();
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

  it('reuses the prepared inline data URI instead of a second request for the background and aircraft (MASTER-AC-014, V02-WI-02 C02)', () => {
    renderScreen([
      {
        ...HANGAR_ASSETS[0]!,
        imageDataUri: 'data:image/webp;base64,BBBB',
      },
      {
        ...HANGAR_ASSETS[1]!,
        imageDataUri: 'data:image/png;base64,CCCC',
      },
    ]);
    const background = document.querySelector(
      '.ds-hangar-background',
    ) as HTMLElement;
    expect(background.style.backgroundImage).toContain(
      'data:image/webp;base64,BBBB',
    );
    expect(background.style.backgroundImage).not.toContain(
      '/backgrounds/hangar-background.webp',
    );
    const image = document.querySelector(
      'img.ds-hangar-aircraft',
    ) as HTMLImageElement;
    expect(image.src).toContain('data:image/png;base64,CCCC');
    expect(image.src).not.toContain('/aircraft/german-fighter.png');
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
