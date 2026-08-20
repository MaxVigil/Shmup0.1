import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FatalStartupView } from './fatal-startup-view';

afterEach(() => {
  cleanup();
});

describe('FatalStartupView', () => {
  it('renders the fatal message and the Reload action', () => {
    render(<FatalStartupView onReload={vi.fn()} />);
    expect(screen.getByText('Unable to start game.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeDefined();
  });

  it('calls onReload when Reload is selected', () => {
    const onReload = vi.fn();
    render(<FatalStartupView onReload={onReload} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
