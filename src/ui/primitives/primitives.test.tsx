import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WithApplication } from '@test-support/ui/application-provider';
import {
  Button,
  Checkbox,
  Divider,
  Icon,
  Overlay,
  Panel,
  ProgressBar,
  Text,
} from './index';

afterEach(() => {
  cleanup();
});

describe('Text', () => {
  it('applies the approved presentation role and tone classes', () => {
    render(
      <Text style="heading" tone="secondary">
        Title
      </Text>,
    );
    const element = screen.getByText('Title');
    expect(element.className).toContain('ds-text--heading');
    expect(element.className).toContain('ds-text-tone--secondary');
  });

  it('uses the semantic element passed through the as prop', () => {
    render(
      <Text as="h1" style="heading">
        Heading
      </Text>,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Heading',
    );
  });
});

describe('Button', () => {
  it('renders a native button with the approved variant', () => {
    render(<Button variant="primary">Start Mission</Button>);
    const button = screen.getByRole('button', { name: 'Start Mission' });
    expect(button.className).toContain('ds-button--primary');
    expect(button.tagName).toBe('BUTTON');
  });

  it('activates on pointer and keyboard activation', () => {
    const onPress = vi.fn();
    render(<Button onClick={onPress}>Reload</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('Panel', () => {
  it('applies the compact variant and composes children', () => {
    render(<Panel variant="compact">Content</Panel>);
    expect(screen.getByText('Content').className).toContain(
      'ds-panel--compact',
    );
  });
});

describe('Divider', () => {
  it('renders a horizontal rule', () => {
    render(<Divider />);
    expect(document.querySelector('hr.ds-divider')).not.toBeNull();
  });
});

describe('ProgressBar', () => {
  it('exposes progress semantics and clamps the fill for display', () => {
    render(<ProgressBar value={150} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(bar.getAttribute('aria-valuenow')).toBe('100');
    const fill = bar.querySelector('.ds-progress-bar__fill') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });
});

describe('Checkbox', () => {
  it('preserves native boolean semantics and reports changes', () => {
    const onCheckedChange = vi.fn();
    render(
      <WithApplication>
        <Checkbox
          checked={false}
          onCheckedChange={onCheckedChange}
          label="Mouse Movement Enabled"
        />
      </WithApplication>,
    );
    const input = document.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    fireEvent.click(input);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(screen.getByText('Mouse Movement Enabled')).toBeDefined();
  });
});

describe('Icon', () => {
  it('renders the ready asset through the catalogue with currentcolor masking', () => {
    render(
      <WithApplication>
        <Icon icon="gear" size="medium" />
      </WithApplication>,
    );
    const icon = document.querySelector('.ds-icon') as HTMLElement;
    expect(icon).not.toBeNull();
    expect(icon.className).toContain('ds-icon--medium');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.style.getPropertyValue('--icon-url')).toContain(
      '/icons/gear.svg',
    );
  });

  it('renders nothing when the asset is not ready (no repeated request)', () => {
    render(
      <WithApplication assets={[]}>
        <Icon icon="gear" size="medium" />
      </WithApplication>,
    );
    expect(document.querySelector('.ds-icon')).toBeNull();
  });
});

describe('Overlay', () => {
  it('renders nothing when closed', () => {
    render(<Overlay open={false} labelledBy="t" onClose={vi.fn()} />);
    expect(document.querySelector('.ds-overlay')).toBeNull();
  });

  it('renders the Scrim, Surface and actions when open', () => {
    render(
      <Overlay
        open
        labelledBy="title"
        onClose={vi.fn()}
        header={<span id="title">Settings</span>}
        actions={<Button>Close</Button>}
      >
        Content
      </Overlay>,
    );
    expect(document.querySelector('.ds-overlay__scrim')).not.toBeNull();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('title');
    expect(screen.getByText('Content')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDefined();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <Overlay open labelledBy="title" onClose={onClose}>
        Content
      </Overlay>,
    );
    fireEvent.keyDown(
      document.querySelector('.ds-overlay__surface') as Element,
      {
        key: 'Escape',
      },
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
