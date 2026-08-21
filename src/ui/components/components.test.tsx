import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WithApplication } from '@test-support/ui/application-provider';
import {
  BaseNavigation,
  FieldRow,
  HullIntegrityBar,
  NavigationItem,
  SettingsButton,
} from './index';

afterEach(() => {
  cleanup();
});

describe('NavigationItem', () => {
  it('renders with native button semantics and the active state', () => {
    render(
      <WithApplication>
        <NavigationItem label="Operations" icon="map-trifold" active />
      </WithApplication>,
    );
    const item = screen.getByRole('button', { name: 'Operations' });
    expect(item.className).toContain('ds-navigation-item--active');
    expect(item.getAttribute('aria-current')).toBe('page');
  });
});

describe('BaseNavigation', () => {
  it('composes navigation items inside a navigation landmark', () => {
    render(
      <WithApplication>
        <BaseNavigation>
          <NavigationItem label="Operations" icon="map-trifold" active />
          <NavigationItem label="Hangar" icon="warehouse" />
        </BaseNavigation>
      </WithApplication>,
    );
    expect(
      screen.getByRole('navigation', { name: 'Base Navigation' }),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: 'Operations' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Hangar' })).toBeDefined();
  });
});

describe('SettingsButton', () => {
  it('is an icon-only Button with the accessible name Settings', () => {
    const onPress = vi.fn();
    render(
      <WithApplication>
        <SettingsButton onPress={onPress} />
      </WithApplication>,
    );
    const button = screen.getByRole('button', { name: 'Settings' });
    expect(button.className).toContain('ds-button--icon-only');
    expect(button.querySelector('.ds-icon')).not.toBeNull();
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows a visible text fallback when the gear icon is not ready', () => {
    const onPress = vi.fn();
    render(
      <WithApplication assets={[]}>
        <SettingsButton onPress={onPress} />
      </WithApplication>,
    );
    const button = screen.getByRole('button', { name: 'Settings' });
    // Canonical Button behaviour retained: not icon-only, visible text label,
    // no failed-icon request, and the action still fires.
    expect(button.className).toContain('ds-button');
    expect(button.className).not.toContain('ds-button--icon-only');
    expect(button.textContent).toBe('Settings');
    expect(button.querySelector('.ds-icon')).toBeNull();
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('FieldRow', () => {
  it('renders the label and the value', () => {
    render(<FieldRow label="Credits" value={1} />);
    expect(screen.getByText('Credits')).toBeDefined();
    expect(screen.getByText('1')).toBeDefined();
  });
});

describe('HullIntegrityBar', () => {
  it('exposes progress semantics and the numeric value', () => {
    render(<HullIntegrityBar current={75} />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(
      '75',
    );
    expect(screen.getByText('75 / 100')).toBeDefined();
  });

  it('omits the numeric value when showValue is false (Combat)', () => {
    render(<HullIntegrityBar current={75} showValue={false} />);
    expect(screen.queryByText('75 / 100')).toBeNull();
  });
});
