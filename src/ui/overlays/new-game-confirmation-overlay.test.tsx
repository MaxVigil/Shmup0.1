import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewGameConfirmationOverlay } from './new-game-confirmation-overlay';

afterEach(() => {
  cleanup();
});

function renderOverlay(
  overrides: Partial<{
    readonly open?: boolean;
    readonly busy?: boolean;
    readonly onConfirm?: () => void;
    readonly onCancel?: () => void;
  }> = {},
): void {
  render(
    <NewGameConfirmationOverlay
      open={overrides.open ?? true}
      busy={overrides.busy ?? false}
      onConfirm={overrides.onConfirm ?? vi.fn()}
      onCancel={overrides.onCancel ?? vi.fn()}
    />,
  );
}

describe('NewGameConfirmationOverlay (Epic §13.6/§14.2)', () => {
  it('renders the destructive confirmation copy with Confirm and Cancel', () => {
    renderOverlay();
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText(
        'Start a new game? Current run progress will be reset.',
      ),
    ).toBeDefined();
    expect(
      within(dialog).getByRole('button', { name: 'Confirm' }).className,
    ).toContain('ds-button--destructive');
    expect(
      within(dialog).getByRole('button', { name: 'Cancel' }).className,
    ).toContain('ds-button--secondary');
  });

  it('moves initial focus to Cancel (the safe default)', () => {
    renderOverlay();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Cancel' }),
    );
  });

  it('invokes onConfirm through the destructive action and onCancel through Cancel/Esc', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderOverlay({ onConfirm, onCancel });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('disables both actions while the atomic replacement is busy', () => {
    renderOverlay({ busy: true });
    expect(
      (screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('renders nothing when closed', () => {
    renderOverlay({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
