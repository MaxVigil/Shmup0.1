import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WithApplication } from '@test-support/ui/application-provider';
import { EvacuationConfirmationOverlay } from './evacuation-confirmation-overlay';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderConfirmation(open = true): {
  onConfirm: ReturnType<typeof vi.fn>;
  onCancel: ReturnType<typeof vi.fn>;
} {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <WithApplication>
      <EvacuationConfirmationOverlay
        open={open}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </WithApplication>,
  );
  return { onConfirm, onCancel };
}

describe('EvacuationConfirmationOverlay (Epic §15.5, V02-DEC-030; DS §8.26, V02-WI-05 E03)', () => {
  it('renders the exact title, copy, action order, and action variants', () => {
    renderConfirmation();
    expect(screen.getByRole('heading', { name: 'Evacuate?' })).toBeDefined();
    expect(
      screen.getByText(
        'Evacuation takes 5 seconds. Combat continues during the countdown.',
      ),
    ).toBeDefined();
    expect(
      screen.getByText(
        'You will retain 50% of net combat rewards. The mission will not be completed and the next mission will not unlock.',
      ),
    ).toBeDefined();
    const actions = screen.getAllByRole('button');
    expect(actions.map((action) => action.textContent)).toEqual([
      'Cancel',
      'Confirm Evacuation',
    ]);
    expect(actions[0]?.className).toContain('ds-button--secondary');
    expect(actions[1]?.className).toContain('ds-button--destructive');
    expect(screen.queryByRole('button', { name: 'Return to Base' })).toBeNull();
  });

  it('renders nothing when closed', () => {
    renderConfirmation(false);
    expect(screen.queryByRole('heading', { name: 'Evacuate?' })).toBeNull();
  });

  it('owns initial focus with the secondary Cancel action', () => {
    renderConfirmation();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Cancel' }),
    );
  });

  it('Esc is equivalent to Cancel and never confirms', () => {
    const { onConfirm, onCancel } = renderConfirmation();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('keeps the Scrim inert', () => {
    const { onConfirm, onCancel } = renderConfirmation();
    const scrim = document.querySelector('.ds-overlay__scrim');
    expect(scrim).not.toBeNull();
    fireEvent.click(scrim!);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('relays each action exactly once when clicked', () => {
    const { onConfirm, onCancel } = renderConfirmation();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Evacuation' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('traps sequential focus between the two actions', () => {
    renderConfirmation();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const confirm = screen.getByRole('button', { name: 'Confirm Evacuation' });
    confirm.focus();
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Tab',
      shiftKey: false,
    });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Tab',
      shiftKey: true,
    });
    expect(document.activeElement).toBe(confirm);
  });

  it('restores focus to the still-existing opener when it closes', () => {
    const opener = document.createElement('button');
    opener.textContent = 'Evacuate';
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(
      <WithApplication>
        <EvacuationConfirmationOverlay
          open
          onConfirm={() => undefined}
          onCancel={() => undefined}
        />
      </WithApplication>,
    );
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Cancel' }),
    );
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('honours the explicit still-existing opener supplied by the Combat Screen (V02-WI-05 E04)', () => {
    const opener = document.createElement('button');
    opener.textContent = 'Evacuate';
    document.body.appendChild(opener);
    // The active-Combat affordance is disabled while the confirmation is open,
    // so the browser has already blurred it when the Overlay mounts.
    (document.activeElement as HTMLElement | null)?.blur();
    const restoreFocusRef = { current: opener };
    const { rerender } = render(
      <WithApplication>
        <EvacuationConfirmationOverlay
          open
          onConfirm={() => undefined}
          onCancel={() => undefined}
          restoreFocusRef={restoreFocusRef}
        />
      </WithApplication>,
    );
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Cancel' }),
    );
    rerender(
      <WithApplication>
        <EvacuationConfirmationOverlay
          open={false}
          onConfirm={() => undefined}
          onCancel={() => undefined}
          restoreFocusRef={restoreFocusRef}
        />
      </WithApplication>,
    );
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
