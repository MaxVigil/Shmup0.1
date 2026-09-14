import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WithApplication } from '@test-support/ui/application-provider';
import { PauseOverlay } from './pause-overlay';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPauseOverlay(
  open: boolean,
  evacuationEligible = true,
): {
  onResume: ReturnType<typeof vi.fn>;
  onEvacuate: ReturnType<typeof vi.fn>;
} {
  const onResume = vi.fn();
  const onEvacuate = vi.fn();
  render(
    <WithApplication>
      <PauseOverlay
        open={open}
        onResume={onResume}
        onEvacuate={onEvacuate}
        evacuationEligible={evacuationEligible}
      />
    </WithApplication>,
  );
  return { onResume, onEvacuate };
}

describe('PauseOverlay (Combat §10, DS §8.22; v0.2 DS §8.26, V02-WI-05 E03)', () => {
  it('renders the Paused title with primary Resume first and destructive Evacuate second', () => {
    renderPauseOverlay(true);
    expect(screen.getByRole('heading', { name: 'Paused' })).toBeDefined();
    const actions = screen.getAllByRole('button');
    expect(actions.map((action) => action.textContent)).toEqual([
      'Resume',
      'Evacuate',
    ]);
    // V02-WI-05 E03: the v0.1 Return to Base instant-Aborted action is gone and
    // the final v0.2 destructive Evacuate action replaces it.
    expect(screen.queryByRole('button', { name: 'Return to Base' })).toBeNull();
    expect(actions[0]?.className).toContain('ds-button--primary');
    expect(actions[1]?.className).toContain('ds-button--destructive');
  });

  it('offers no Evacuate action once the irreversible commitment exists', () => {
    renderPauseOverlay(true, false);
    expect(screen.getByRole('button', { name: 'Resume' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Evacuate' })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('renders nothing when closed', () => {
    renderPauseOverlay(false);
    expect(screen.queryByRole('heading', { name: 'Paused' })).toBeNull();
  });

  it('Esc is equivalent to Resume', () => {
    const { onResume, onEvacuate } = renderPauseOverlay(true);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onEvacuate).not.toHaveBeenCalled();
  });

  it('initial focus is the primary Resume action', () => {
    renderPauseOverlay(true);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Resume' }),
    );
  });

  it('relays Evacuate exactly once and does not resume', () => {
    const { onResume, onEvacuate } = renderPauseOverlay(true);
    fireEvent.click(screen.getByRole('button', { name: 'Evacuate' }));
    expect(onEvacuate).toHaveBeenCalledTimes(1);
    expect(onResume).not.toHaveBeenCalled();
  });

  it('keeps the Scrim inert and traps focus inside the Overlay', () => {
    const { onResume, onEvacuate } = renderPauseOverlay(true);
    const scrim = document.querySelector('.ds-overlay__scrim');
    expect(scrim).not.toBeNull();
    fireEvent.click(scrim!);
    expect(onResume).not.toHaveBeenCalled();
    expect(onEvacuate).not.toHaveBeenCalled();

    const resume = screen.getByRole('button', { name: 'Resume' });
    const evacuate = screen.getByRole('button', { name: 'Evacuate' });
    evacuate.focus();
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Tab',
      shiftKey: false,
    });
    expect(document.activeElement).toBe(resume);
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Tab',
      shiftKey: true,
    });
    expect(document.activeElement).toBe(evacuate);
  });
});
