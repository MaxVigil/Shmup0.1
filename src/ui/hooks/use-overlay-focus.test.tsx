import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import type { ReactElement, RefObject } from 'react';
import { useOverlayFocus } from './use-overlay-focus';

interface OverlayHarnessProps {
  readonly open: boolean;
  readonly onClose?: () => void;
  readonly firstLabel?: string;
  readonly restoreFocusRef?: RefObject<HTMLElement | null>;
}

function OverlayHarness({
  open,
  onClose,
  firstLabel = 'First',
  restoreFocusRef,
}: OverlayHarnessProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  useOverlayFocus({
    open,
    containerRef,
    ...(restoreFocusRef === undefined ? {} : { restoreFocusRef }),
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

  it('restores focus to an explicitly supplied opener the browser already blurred (V02-WI-05 E04)', () => {
    const opener = document.createElement('button');
    opener.textContent = 'Evacuate';
    document.body.appendChild(opener);
    // The opener is disabled by the same commit that opens the Overlay, so the
    // browser has already blurred it and `document.activeElement` is `<body>`.
    (document.activeElement as HTMLElement | null)?.blur();
    const restoreFocusRef = { current: opener };
    const { rerender } = render(
      <OverlayHarness
        open
        onClose={vi.fn()}
        restoreFocusRef={restoreFocusRef}
      />,
    );
    expect(document.activeElement?.textContent).toBe('First');
    rerender(
      <OverlayHarness
        open={false}
        onClose={vi.fn()}
        restoreFocusRef={restoreFocusRef}
      />,
    );
    expect(document.activeElement).toBe(opener);
    document.body.removeChild(opener);
  });

  it('repairs an inert content focus loss back inside the Overlay (V02-WI-05 E04 C01)', () => {
    render(<OverlayHarness open onClose={vi.fn()} />);
    const first = document.querySelectorAll('button')[0] as HTMLButtonElement;
    expect(document.activeElement).toBe(first);
    // A real browser moves focus to `<body>` on a mousedown over non-focusable
    // Overlay content; without the containment repair `Esc`/`Tab` would stop
    // working because the key handler lives on the Surface.
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(first);
  });

  it('defers the containment repair until a pointer gesture ends so native drag/selection is untouched (V02-WI-05 E04 C01)', () => {
    render(<OverlayHarness open onClose={vi.fn()} />);
    const first = document.querySelectorAll('button')[0] as HTMLButtonElement;
    document.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    (document.activeElement as HTMLElement).blur();
    // The gesture is still active: no focus steal while the player drags.
    expect(document.activeElement).toBe(document.body);
    document.dispatchEvent(new Event('pointerup', { bubbles: true }));
    expect(document.activeElement).toBe(first);
  });
});
