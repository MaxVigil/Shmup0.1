import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CombatObservability } from '@application/combat';
import { WithApplication } from '@test-support/ui/application-provider';
import { DebugOverlay } from './debug-overlay';

const BASE_OBSERVABILITY: CombatObservability = {
  combatSeed: 12345,
  missionTimeSeconds: 42,
  countdownSeconds: 148,
  currentEncounterId: 'interception-01-e1',
  playerHullIntegrity: 100,
  godModeEnabled: false,
  activeEnemiesByType: {
    'basic-drone': 3,
    'ranged-drone': 1,
    'hunter-drone': 0,
    'elite-drone': 0,
  },
  activeEnemyBounds: [
    {
      type: 'basic-drone',
      centerX: 320,
      centerY: 120,
      width: 96,
      height: 50,
    },
  ],
  destroyedEnemiesByType: {
    'basic-drone': 7,
    'ranged-drone': 0,
    'hunter-drone': 0,
    'elite-drone': 0,
  },
  destroyedByContactEnemiesByType: {
    'basic-drone': 0,
    'ranged-drone': 0,
    'hunter-drone': 0,
    'elite-drone': 0,
  },
  escapedEnemiesByType: {
    'basic-drone': 1,
    'ranged-drone': 0,
    'hunter-drone': 0,
    'elite-drone': 0,
  },
  pendingCombatRewards: 9,
  pendingEscapePenalties: 2,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderDebugOverlay(
  observability: CombatObservability | null = BASE_OBSERVABILITY,
): {
  getObservability: ReturnType<typeof vi.fn>;
  submitDebugAction: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
} {
  const getObservability = vi.fn().mockReturnValue(observability);
  const submitDebugAction = vi.fn();
  const onClose = vi.fn();
  render(
    <WithApplication>
      <DebugOverlay
        open
        onClose={onClose}
        getObservability={getObservability}
        submitDebugAction={submitDebugAction}
      />
    </WithApplication>,
  );
  return { getObservability, submitDebugAction, onClose };
}

describe('DebugOverlay (Combat §11, DS §8.24)', () => {
  it('shows only the approved observability values and sections', () => {
    renderDebugOverlay();
    expect(screen.getByRole('heading', { name: 'Debug' })).toBeDefined();
    expect(screen.getByText('Combat Seed')).toBeDefined();
    expect(screen.getByText('12345')).toBeDefined();
    expect(screen.getByText('Mission Clock')).toBeDefined();
    expect(screen.getByText('42.0 s')).toBeDefined();
    expect(screen.getByText('Combat Countdown')).toBeDefined();
    expect(screen.getByText('148 s')).toBeDefined();
    expect(screen.getByText('Current Encounter')).toBeDefined();
    expect(screen.getByText('interception-01-e1')).toBeDefined();
    expect(screen.getByText('Player Hull')).toBeDefined();
    expect(screen.getByText('100')).toBeDefined();
    expect(screen.getByText('Active Enemies')).toBeDefined();
    expect(screen.getByText('Basic 3 · Ranged 1')).toBeDefined();
    expect(screen.getByText('Destroyed Enemies')).toBeDefined();
    expect(screen.getByText('Basic 7')).toBeDefined();
    expect(screen.getByText('Escaped Enemies')).toBeDefined();
    expect(screen.getByText('Basic 1')).toBeDefined();
    expect(screen.getByText('Combat Rewards')).toBeDefined();
    expect(screen.getByText('9')).toBeDefined();
    expect(screen.getByText('Escape Penalties')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
    // No FPS, hitboxes, coordinates, or extra diagnostics.
    expect(screen.queryByText(/fps|hitbox|coordinat/i)).toBeNull();
  });

  it('refreshes observability on open and relays every approved action', () => {
    const { getObservability, submitDebugAction } = renderDebugOverlay();
    const firstCallCount = getObservability.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Set Hull: 25' }));
    fireEvent.click(screen.getByRole('button', { name: 'Spawn Basic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Spawn E1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Win Mission' }));
    expect(submitDebugAction.mock.calls.map((call) => call[0])).toEqual([
      { type: 'combat-debug/set-hull', hull: 25 },
      { type: 'combat-debug/spawn-standard-enemy' },
      {
        type: 'combat-debug/spawn-encounter',
        encounterId: 'interception-01-e1',
      },
      { type: 'combat-debug/win-mission' },
    ]);
    // Refreshed on open and after each accepted action, never per frame.
    expect(getObservability.mock.calls.length).toBe(firstCallCount + 4);
  });

  it('Set Hull is disabled while God Mode is enabled', () => {
    renderDebugOverlay({
      ...BASE_OBSERVABILITY,
      godModeEnabled: true,
    });
    expect(
      (
        screen.getByRole('button', {
          name: 'Set Hull: 25',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: 'Set Hull: 100',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('God Mode is a canonical Checkbox relaying the toggle command', () => {
    const { submitDebugAction } = renderDebugOverlay();
    const checkbox = screen.getByRole('checkbox', { name: 'God Mode' });
    fireEvent.click(checkbox);
    expect(submitDebugAction).toHaveBeenCalledWith({
      type: 'combat-debug/god-mode',
      enabled: true,
    });
  });

  it('Close and Esc close through the same callback', () => {
    const { onClose } = renderDebugOverlay();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders nothing when closed', () => {
    const getObservability = vi.fn();
    const submitDebugAction = vi.fn();
    render(
      <WithApplication>
        <DebugOverlay
          open={false}
          onClose={vi.fn()}
          getObservability={getObservability}
          submitDebugAction={submitDebugAction}
        />
      </WithApplication>,
    );
    expect(screen.queryByRole('heading', { name: 'Debug' })).toBeNull();
  });
});
