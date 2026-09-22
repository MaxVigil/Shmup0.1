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
  elite: null,
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
    'hunter-drone': 3,
    'elite-drone': 0,
  },
  destroyedByProjectileEnemiesByType: {
    'basic-drone': 5,
    'ranged-drone': 0,
    'hunter-drone': 2,
    'elite-drone': 0,
  },
  destroyedByContactEnemiesByType: {
    'basic-drone': 2,
    'ranged-drone': 0,
    'hunter-drone': 1,
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
  encounterIds: readonly string[] = [
    'interception-01-e1',
    'interception-01-e2',
    'interception-01-e3',
    'interception-01-e4',
    'interception-01-e5',
  ],
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
        encounterIds={encounterIds}
      />
    </WithApplication>,
  );
  return { getObservability, submitDebugAction, onClose };
}

describe('DebugOverlay (Combat §11, Epic §17, DS §8.24)', () => {
  it('shows exactly the approved observability values and sections', () => {
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
    expect(screen.getByText('Elite Phase')).toBeDefined();
    expect(screen.getByText('Elite Phase Time')).toBeDefined();
    expect(screen.getByText('Player Hull')).toBeDefined();
    expect(screen.getByText('100')).toBeDefined();
    expect(screen.getByText('Active Enemies')).toBeDefined();
    expect(screen.getByText('Basic 3 · Ranged 1')).toBeDefined();
    expect(screen.getByText('Destroyed Enemies')).toBeDefined();
    expect(screen.getByText('Basic 7 · Hunter 3')).toBeDefined();
    expect(screen.getByText('Destroyed by Projectile')).toBeDefined();
    // The exact projectile remainder per role, with non-zero overlapping total
    // (Basic 7, Hunter 3) and contact (Basic 2, Hunter 1) counts.
    expect(screen.getByText('Basic 5 · Hunter 2')).toBeDefined();
    expect(screen.getByText('Destroyed by Contact')).toBeDefined();
    expect(screen.getByText('Basic 2 · Hunter 1')).toBeDefined();
    expect(screen.getByText('Escaped Enemies')).toBeDefined();
    expect(screen.getByText('Basic 1')).toBeDefined();
    expect(screen.getByText('Combat Rewards')).toBeDefined();
    expect(screen.getByText('9')).toBeDefined();
    expect(screen.getByText('Escape Penalties')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
    // No Elite in this simulation: both Elite rows are absent values.
    const elitePhase = screen.getByText('Elite Phase').closest('.ds-field-row');
    const elitePhaseTime = screen
      .getByText('Elite Phase Time')
      .closest('.ds-field-row');
    expect(elitePhase?.textContent).toContain('—');
    expect(elitePhaseTime?.textContent).toContain('—');
    // No FPS, hitboxes, coordinates, or extra diagnostics.
    expect(screen.queryByText(/fps|hitbox|coordinat/i)).toBeNull();
  });

  it('shows the current Elite phase and its authoritative phase time with Elite in the role formatting', () => {
    renderDebugOverlay({
      ...BASE_OBSERVABILITY,
      elite: { phase: 'vulnerable', phaseElapsedSeconds: 1.5 },
      activeEnemiesByType: {
        'basic-drone': 0,
        'ranged-drone': 0,
        'hunter-drone': 0,
        'elite-drone': 1,
      },
    });
    expect(screen.getByText('Vulnerable')).toBeDefined();
    expect(screen.getByText('1.5 s')).toBeDefined();
    expect(screen.getByText('Elite 1')).toBeDefined();
  });

  it('shows an entering Elite with no active phase time', () => {
    renderDebugOverlay({
      ...BASE_OBSERVABILITY,
      elite: { phase: 'entering', phaseElapsedSeconds: 0 },
    });
    expect(screen.getByText('Entering')).toBeDefined();
    const elitePhaseTime = screen
      .getByText('Elite Phase Time')
      .closest('.ds-field-row');
    expect(elitePhaseTime?.textContent).toContain('—');
  });

  it('refreshes observability on open and relays every approved action', () => {
    const { getObservability, submitDebugAction } = renderDebugOverlay();
    const firstCallCount = getObservability.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Set Hull: 25' }));
    fireEvent.click(screen.getByRole('button', { name: 'Spawn Basic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Spawn Ranged' }));
    fireEvent.click(screen.getByRole('button', { name: 'Spawn Hunter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Spawn Elite' }));
    fireEvent.click(screen.getByRole('button', { name: 'Spawn E1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Win Mission' }));
    fireEvent.click(screen.getByRole('button', { name: 'Evacuate Mission' }));
    expect(submitDebugAction.mock.calls.map((call) => call[0])).toEqual([
      { type: 'combat-debug/set-hull', hull: 25 },
      { type: 'combat-debug/spawn-enemy', enemyType: 'basic-drone' },
      { type: 'combat-debug/spawn-enemy', enemyType: 'ranged-drone' },
      { type: 'combat-debug/spawn-enemy', enemyType: 'hunter-drone' },
      { type: 'combat-debug/spawn-enemy', enemyType: 'elite-drone' },
      {
        type: 'combat-debug/spawn-encounter',
        encounterId: 'interception-01-e1',
      },
      { type: 'combat-debug/win-mission' },
      { type: 'combat-debug/evacuate-mission' },
    ]);
    // Refreshed on open and after each accepted action, never per frame.
    expect(getObservability.mock.calls.length).toBe(firstCallCount + 8);
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
          encounterIds={['interception-01-e1']}
        />
      </WithApplication>,
    );
    expect(screen.queryByRole('heading', { name: 'Debug' })).toBeNull();
  });

  it('addresses EVERY authored Encounter of the CURRENT mission in authored order (V02-WI-05 M02-R01, V02-WI-07 D01)', () => {
    const { submitDebugAction } = renderDebugOverlay(BASE_OBSERVABILITY, [
      'interception-02-e1',
      'interception-02-e2',
      'interception-02-e3',
      'interception-02-e4',
      'interception-02-e5',
      'interception-02-e6',
    ]);
    // One action per authored Encounter: no hard-coded first/fifth subset.
    for (const index of [1, 2, 3, 4, 5, 6]) {
      expect(
        screen.getByRole('button', { name: `Spawn E${index}` }),
      ).toBeDefined();
    }
    expect(screen.queryByRole('button', { name: 'Spawn E7' })).toBeNull();
    for (const index of [1, 2, 3, 4, 5, 6]) {
      fireEvent.click(screen.getByRole('button', { name: `Spawn E${index}` }));
    }
    expect(submitDebugAction.mock.calls.map((call) => call[0])).toEqual([
      {
        type: 'combat-debug/spawn-encounter',
        encounterId: 'interception-02-e1',
      },
      {
        type: 'combat-debug/spawn-encounter',
        encounterId: 'interception-02-e2',
      },
      {
        type: 'combat-debug/spawn-encounter',
        encounterId: 'interception-02-e3',
      },
      {
        type: 'combat-debug/spawn-encounter',
        encounterId: 'interception-02-e4',
      },
      {
        type: 'combat-debug/spawn-encounter',
        encounterId: 'interception-02-e5',
      },
      {
        type: 'combat-debug/spawn-encounter',
        encounterId: 'interception-02-e6',
      },
    ]);
  });

  it('renders one action per authored encounter and none for an absent identity (V02-WI-05 M02-R01)', () => {
    const { submitDebugAction } = renderDebugOverlay(BASE_OBSERVABILITY, [
      'interception-01-e1',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Spawn E1' }));
    expect(submitDebugAction).toHaveBeenCalledWith({
      type: 'combat-debug/spawn-encounter',
      encounterId: 'interception-01-e1',
    });
    // The mission has no fifth authored Encounter, so no foreign-identity
    // action exists to relay at all.
    expect(screen.queryByRole('button', { name: 'Spawn E5' })).toBeNull();
    expect(submitDebugAction).toHaveBeenCalledTimes(1);
  });

  it('enables the Elite phase actions only while a current Elite exists', () => {
    const first = renderDebugOverlay();
    const armoured = screen.getByRole('button', {
      name: 'Elite: Armoured',
    }) as HTMLButtonElement;
    const vulnerable = screen.getByRole('button', {
      name: 'Elite: Vulnerable',
    }) as HTMLButtonElement;
    expect(armoured.disabled).toBe(true);
    expect(vulnerable.disabled).toBe(true);
    expect(first.submitDebugAction).not.toHaveBeenCalled();

    cleanup();
    const second = renderDebugOverlay({
      ...BASE_OBSERVABILITY,
      elite: { phase: 'armoured', phaseElapsedSeconds: 3 },
    });
    const enabledArmoured = screen.getByRole('button', {
      name: 'Elite: Armoured',
    }) as HTMLButtonElement;
    const enabledVulnerable = screen.getByRole('button', {
      name: 'Elite: Vulnerable',
    }) as HTMLButtonElement;
    expect(enabledArmoured.disabled).toBe(false);
    expect(enabledVulnerable.disabled).toBe(false);
    fireEvent.click(enabledVulnerable);
    expect(second.submitDebugAction).toHaveBeenCalledWith({
      type: 'combat-debug/set-elite-phase',
      phase: 'vulnerable',
    });
  });
});
