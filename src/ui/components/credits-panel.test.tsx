import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CreditsPanel } from './credits-panel';

afterEach(() => {
  cleanup();
});

describe('CreditsPanel', () => {
  it('renders the current Credits value (Base §4.3)', () => {
    render(<CreditsPanel credits={1} />);
    expect(screen.getByText('Credits: 1')).toBeDefined();
  });
});
