import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WithApplication } from '@test-support/ui/application-provider';
import { MissionPoint } from './mission-point';

afterEach(() => {
  cleanup();
});

describe('MissionPoint', () => {
  it('renders the marker Button with the Interception label (DS §8.10)', () => {
    render(
      <WithApplication>
        <MissionPoint onPress={vi.fn()} />
      </WithApplication>,
    );
    const marker = screen.getByRole('button', { name: 'Interception' });
    expect(marker.querySelector('.ds-icon--large')).not.toBeNull();
    expect(screen.getByText('Interception')).toBeDefined();
  });

  it('fires the action from the Marker Button', () => {
    const onPress = vi.fn();
    render(
      <WithApplication>
        <MissionPoint onPress={onPress} />
      </WithApplication>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Interception' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
