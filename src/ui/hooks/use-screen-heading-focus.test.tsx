import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useRef } from 'react';
import type { ReactElement } from 'react';
import { useScreenHeadingFocus } from './use-screen-heading-focus';

function HeadingHarness(): ReactElement {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useScreenHeadingFocus(headingRef);
  return (
    <h1 ref={headingRef} tabIndex={-1}>
      Operations
    </h1>
  );
}

afterEach(() => {
  cleanup();
});

describe('useScreenHeadingFocus', () => {
  it('moves programmatic focus to the Screen heading on mount', () => {
    render(<HeadingHarness />);
    expect(document.activeElement?.textContent).toBe('Operations');
  });
});
