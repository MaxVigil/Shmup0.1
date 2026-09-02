import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WithApplication } from '@test-support/ui/application-provider';
import {
  SaveConflictOverlay,
  SaveErrorOverlay,
  TerminalExitPauseOverlay,
} from './terminal-save-overlays';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('V02-WI-04 C02 SaveErrorOverlay (DS §8.24, Epic §13.3)', () => {
  it('renders the exact Save Error title, message, and the only Retry Save action', () => {
    render(
      <WithApplication>
        <SaveErrorOverlay onRetry={() => undefined} />
      </WithApplication>,
    );
    expect(screen.getByRole('heading', { name: 'Save Error' })).toBeDefined();
    expect(
      screen.getByText(
        'Mission result could not be saved. Combat remains paused.',
      ),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: 'Retry Save' })).toBeDefined();
    // No gameplay or exit continuation exists while it is open.
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Return to Base' })).toBeNull();
  });

  it('Retry Save invokes the retry continuation exactly once per click', () => {
    const onRetry = vi.fn();
    render(
      <WithApplication>
        <SaveErrorOverlay onRetry={onRetry} />
      </WithApplication>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry Save' }));
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('initial focus is the Retry Save action and Esc does not close it', () => {
    const onRetry = vi.fn();
    render(
      <WithApplication>
        <SaveErrorOverlay onRetry={onRetry} />
      </WithApplication>,
    );
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Retry Save' }),
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.getByRole('heading', { name: 'Save Error' })).toBeDefined();
  });
});

describe('V02-WI-04 C03 TerminalExitPauseOverlay (Epic §13.3, V02-AC-019/023)', () => {
  it('renders Paused with the only Resume action and no other continuation', () => {
    render(
      <WithApplication>
        <TerminalExitPauseOverlay onResume={() => undefined} />
      </WithApplication>,
    );
    expect(screen.getByRole('heading', { name: 'Paused' })).toBeDefined();
    expect(
      screen.getByText(
        'Mission result saved. Combat remains paused — select Resume to finish.',
      ),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeDefined();
    // After the immutable Success commit, no invalid post-commit action exists.
    expect(screen.queryByRole('button', { name: 'Return to Base' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
  });

  it('Resume invokes the exit continuation exactly once per click', () => {
    const onResume = vi.fn();
    render(
      <WithApplication>
        <TerminalExitPauseOverlay onResume={onResume} />
      </WithApplication>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(onResume).toHaveBeenCalledTimes(2);
  });

  it('Esc cannot close the terminal-exit Pause (explicit Resume only)', () => {
    const onResume = vi.fn();
    render(
      <WithApplication>
        <TerminalExitPauseOverlay onResume={onResume} />
      </WithApplication>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.getByRole('heading', { name: 'Paused' })).toBeDefined();
    expect(onResume).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Resume' }),
    );
  });
});

describe('V02-WI-04 C02 SaveConflictOverlay (DS §8.24, Epic §13.3)', () => {
  it('renders the exact Save Conflict title, message, and the only Reload action', () => {
    render(
      <WithApplication>
        <SaveConflictOverlay onReload={() => undefined} />
      </WithApplication>,
    );
    expect(
      screen.getByRole('heading', { name: 'Save Conflict' }),
    ).toBeDefined();
    expect(
      screen.getByText(
        'Campaign data changed in another session. Reload to continue.',
      ),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeDefined();
    // No local retry, reward, result, or exit continuation exists.
    expect(screen.queryByRole('button', { name: 'Retry Save' })).toBeNull();
  });

  it('Reload invokes the reload continuation exactly once per click', () => {
    const onReload = vi.fn();
    render(
      <WithApplication>
        <SaveConflictOverlay onReload={onReload} />
      </WithApplication>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalledTimes(2);
  });

  it('Esc does not close Save Conflict (Reload is the only continuation)', () => {
    const onReload = vi.fn();
    render(
      <WithApplication>
        <SaveConflictOverlay onReload={onReload} />
      </WithApplication>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(
      screen.getByRole('heading', { name: 'Save Conflict' }),
    ).toBeDefined();
  });
});
