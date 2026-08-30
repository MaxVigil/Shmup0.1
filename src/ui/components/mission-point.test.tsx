import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WithApplication } from '@test-support/ui/application-provider';
import { MissionPoint } from './mission-point';

afterEach(() => {
  cleanup();
});

describe('MissionPoint', () => {
  it('renders the marker Button with the mission label (DS §8.10, v0.2)', () => {
    render(
      <WithApplication>
        <MissionPoint
          label="Interception 01"
          state="available"
          onPress={vi.fn()}
        />
      </WithApplication>,
    );
    const marker = screen.getByRole('button', { name: 'Interception 01' });
    expect(marker.querySelector('.ds-icon--large')).not.toBeNull();
    expect(screen.getByText('Interception 01')).toBeDefined();
    expect((marker as HTMLButtonElement).disabled).toBe(false);
  });

  it('communicates the locked state structurally and semantically without colour alone (Epic §6.1)', () => {
    render(
      <WithApplication>
        <MissionPoint
          label="Interception 02"
          state="locked"
          onPress={vi.fn()}
        />
      </WithApplication>,
    );
    const marker = screen.getByRole('button', {
      name: 'Interception 02 (Locked)',
    });
    // Structurally non-launchable: disabled (not focusable, no activation);
    // the native disabled state is the semantic signal.
    expect((marker as HTMLButtonElement).disabled).toBe(true);
    // Semantically communicated in visible copy, never by colour alone.
    expect(screen.getByText('Interception 02 (Locked)')).toBeDefined();
  });

  it('keeps a completed mission launchable (replay, Epic §6.2)', () => {
    render(
      <WithApplication>
        <MissionPoint
          label="Interception 01"
          state="completed"
          onPress={vi.fn()}
        />
      </WithApplication>,
    );
    const marker = screen.getByRole('button', {
      name: 'Interception 01 (Completed)',
    });
    expect((marker as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText('Interception 01 (Completed)')).toBeDefined();
  });

  it('fires the action from the Marker Button', () => {
    const onPress = vi.fn();
    render(
      <WithApplication>
        <MissionPoint
          label="Interception 01"
          state="available"
          onPress={onPress}
        />
      </WithApplication>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Interception 01' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
