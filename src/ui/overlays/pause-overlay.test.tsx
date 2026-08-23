import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WithApplication } from '@test-support/ui/application-provider';
import { PauseOverlay } from './pause-overlay';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPauseOverlay(open: boolean): {
  onResume: ReturnType<typeof vi.fn>;
  onReturnToBase: ReturnType<typeof vi.fn>;
} {
  const onResume = vi.fn();
  const onReturnToBase = vi.fn();
  render(
    <WithApplication>
      <PauseOverlay
        open={open}
        onResume={onResume}
        onReturnToBase={onReturnToBase}
      />
    </WithApplication>,
  );
  return { onResume, onReturnToBase };
}

describe('PauseOverlay (Combat §10, DS §8.22)', () => {
  it('renders the Paused title and the Resume/Return to Base actions', () => {
    renderPauseOverlay(true);
    expect(screen.getByRole('heading', { name: 'Paused' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Return to Base' }),
    ).toBeDefined();
  });

  it('renders nothing when closed', () => {
    renderPauseOverlay(false);
    expect(screen.queryByRole('heading', { name: 'Paused' })).toBeNull();
  });

  it('Esc is equivalent to Resume', () => {
    const { onResume } = renderPauseOverlay(true);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('initial focus is the primary Resume action', () => {
    renderPauseOverlay(true);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Resume' }),
    );
  });

  it('Return to Base dispatches without a confirmation Overlay', () => {
    const { onReturnToBase } = renderPauseOverlay(true);
    fireEvent.click(screen.getByRole('button', { name: 'Return to Base' }));
    expect(onReturnToBase).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('heading', { name: 'Paused' })).toBeDefined();
  });
});
