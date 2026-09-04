import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WithApplication } from '@test-support/ui/application-provider';
import { MissionStartRecoveryErrorOverlay } from './mission-start-recovery-error-overlay';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('V02-DEC-031 MissionStartRecoveryErrorOverlay (Epic §13.2, DS §8.26)', () => {
  it('renders the exact Mission Start Recovery Error title, body, and the only Retry Cleanup action', () => {
    render(
      <WithApplication>
        <MissionStartRecoveryErrorOverlay onRetryCleanup={() => undefined} />
      </WithApplication>,
    );
    expect(
      screen.getByRole('heading', { name: 'Mission Start Recovery Error' }),
    ).toBeDefined();
    expect(
      screen.getByText(
        'Combat could not start, and the active mission could not be cleared safely.',
      ),
    ).toBeDefined();
    expect(
      screen.getByText('Retry cleanup to return to Mission Details.'),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: 'Retry Cleanup' })).toBeDefined();
    // The recovery shell exposes no gameplay, pause, result, or terminal
    // continuation while the blocking Overlay is open.
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Return to Base' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
  });

  it('Retry Cleanup invokes the retry continuation for every relayed activation', () => {
    const onRetryCleanup = vi.fn();
    render(
      <WithApplication>
        <MissionStartRecoveryErrorOverlay onRetryCleanup={onRetryCleanup} />
      </WithApplication>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry Cleanup' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry Cleanup' }));
    // Single-flight is enforced by the application recovery controller, not
    // by React; every click is relayed.
    expect(onRetryCleanup).toHaveBeenCalledTimes(2);
  });

  it('initial focus is Retry Cleanup and Esc cannot close the blocking Overlay', () => {
    const onRetryCleanup = vi.fn();
    render(
      <WithApplication>
        <MissionStartRecoveryErrorOverlay onRetryCleanup={onRetryCleanup} />
      </WithApplication>,
    );
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Retry Cleanup' }),
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(
      screen.getByRole('heading', { name: 'Mission Start Recovery Error' }),
    ).toBeDefined();
    expect(onRetryCleanup).not.toHaveBeenCalled();
  });
});
