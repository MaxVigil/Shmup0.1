import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import type { ReactElement } from 'react';
import { useOverlayFocus } from './use-overlay-focus';

interface OverlayHarnessProps {
  readonly open: boolean;
  readonly onClose?: () => void;
  readonly firstLabel?: string;
}

function OverlayHarness({
  open,
  onClose,
  firstLabel = 'First',
}: OverlayHarnessProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  useOverlayFocus({
    open,
    containerRef,
    ...(onClose === undefined ? {} : { onClose }),
  });
  return (
    <div ref={containerRef} data-testid="container">
      <button type="button">{firstLabel}</button>
      <button type="button">Last</button>
    </div>
  );
}

afterEach(() => {
  cleanup();
});

describe('useOverlayFocus', () => {
  it('moves focus to the first focusable control when the overlay opens', () => {
    const { rerender } = render(<OverlayHarness open={false} />);
    expect(document.activeElement?.textContent).not.toBe('First');
    rerender(<OverlayHarness open />);
    expect(document.activeElement?.textContent).toBe('First');
  });

  it('traps Tab within the overlay and wraps focus', () => {
    render(<OverlayHarness open />);
    const last = document.querySelectorAll('button')[1] as HTMLButtonElement;
    last.focus();
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(
      document.querySelector('[data-testid="container"]') as Element,
      { key: 'Tab' },
    );
    expect(document.activeElement?.textContent).toBe('First');
  });

  it('restores focus to the previous element when the overlay closes', () => {
    const opener = document.createElement('button');
    opener.textContent = 'Opener';
    document.body.appendChild(opener);
    opener.focus();
    const { rerender } = render(<OverlayHarness open onClose={vi.fn()} />);
    expect(document.activeElement?.textContent).toBe('First');
    rerender(<OverlayHarness open={false} onClose={vi.fn()} />);
    expect(document.activeElement).toBe(opener);
    document.body.removeChild(opener);
  });

  it('does not restore opener focus when only the callback identity changes while open', () => {
    const opener = document.createElement('button');
    opener.textContent = 'Opener';
    document.body.appendChild(opener);
    opener.focus();
    const { rerender } = render(<OverlayHarness open onClose={vi.fn()} />);
    expect(document.activeElement?.textContent).toBe('First');
    rerender(<OverlayHarness open onClose={vi.fn()} />);
    expect(document.activeElement).not.toBe(opener);
    expect(document.activeElement?.textContent).toBe('First');
    document.body.removeChild(opener);
  });

  it('does not reset current focus when controlled content changes while open', () => {
    const { rerender } = render(<OverlayHarness open onClose={vi.fn()} />);
    const last = document.querySelectorAll('button')[1] as HTMLButtonElement;
    last.focus();
    rerender(<OverlayHarness open onClose={vi.fn()} firstLabel="Changed" />);
    expect(document.activeElement).toBe(last);
  });

  it('still closes and restores opener focus after ordinary rerenders', () => {
    const opener = document.createElement('button');
    opener.textContent = 'Opener';
    document.body.appendChild(opener);
    opener.focus();
    const { rerender } = render(<OverlayHarness open onClose={vi.fn()} />);
    rerender(<OverlayHarness open onClose={vi.fn()} />);
    expect(document.activeElement).not.toBe(opener);
    rerender(<OverlayHarness open={false} onClose={vi.fn()} />);
    expect(document.activeElement).toBe(opener);
    document.body.removeChild(opener);
  });
});
