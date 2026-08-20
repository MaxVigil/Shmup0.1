import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OperationsScreen } from './operations-screen';

afterEach(() => {
  cleanup();
});

describe('OperationsScreen', () => {
  it('renders the Operations destination', () => {
    render(<OperationsScreen />);
    expect(screen.getByTestId('operations-screen').textContent).toBe(
      'Operations',
    );
  });
});
