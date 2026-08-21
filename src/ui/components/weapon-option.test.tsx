import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { weaponOptions } from '@application/hangar';
import { CONTENT_CATALOGUE } from '@test-support/content';
import { WeaponOption } from './weapon-option';

afterEach(() => {
  cleanup();
});

describe('WeaponOption', () => {
  it('renders the radio selection with name and canonical statistics (DS §8.14)', () => {
    const machineGun = weaponOptions(CONTENT_CATALOGUE)[0];
    if (machineGun === undefined) {
      throw new Error('Expected the Machine Gun option.');
    }
    render(
      <WeaponOption
        option={machineGun}
        selected
        name="primary-weapon"
        onSelect={vi.fn()}
      />,
    );
    const input = screen.getByRole('radio', { name: /Machine Gun/ });
    expect((input as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('Damage')).toBeDefined();
    expect(screen.getByText('1')).toBeDefined();
    expect(screen.getByText('Fire Rate')).toBeDefined();
    expect(screen.getByText('6 shots/s')).toBeDefined();
    expect(screen.getByText('Destroys Basic Drone')).toBeDefined();
    expect(screen.getByText('3 hits')).toBeDefined();
  });

  it('reports selection changes through the native radio', () => {
    const machineGun = weaponOptions(CONTENT_CATALOGUE)[0];
    if (machineGun === undefined) {
      throw new Error('Expected the Machine Gun option.');
    }
    const onSelect = vi.fn();
    render(
      <WeaponOption
        option={machineGun}
        selected={false}
        name="primary-weapon"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /Machine Gun/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
