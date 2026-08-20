import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BootView } from './boot-view';

afterEach(() => {
  cleanup();
});

describe('BootView', () => {
  it('renders the Loading state', () => {
    render(<BootView />);
    expect(screen.getByTestId('boot-view').textContent).toBe('Loading…');
  });
});
