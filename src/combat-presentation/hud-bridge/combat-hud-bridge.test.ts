import { afterEach, describe, expect, it } from 'vitest';
import { createCombatHudBridge } from './combat-hud-bridge';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('createCombatHudBridge', () => {
  it('creates the DS-structured Hull bar without a visible numeric value', () => {
    const bridge = createCombatHudBridge();
    document.body.appendChild(bridge.element);
    expect(bridge.element.className).toContain('ds-combat-hud');
    const track = bridge.element.querySelector('.ds-combat-hud__track');
    expect(track?.getAttribute('role')).toBe('progressbar');
    expect(track?.getAttribute('aria-valuemin')).toBe('0');
    expect(track?.getAttribute('aria-valuemax')).toBe('100');
    expect(track?.querySelector('.ds-combat-hud__fill')).not.toBeNull();
    expect(bridge.element.textContent).toBe('');
  });

  it('positions the bar below the aircraft with the approved geometry', () => {
    const bridge = createCombatHudBridge();
    document.body.appendChild(bridge.element);
    bridge.update({
      aircraftCenterX: 640,
      aircraftBottomY: 516,
      aircraftWidth: 74.7,
      hullRatio: 1,
      viewportShortSide: 600,
    });
    expect(bridge.element.style.left).toBe(`${640 - (74.7 * 0.65) / 2}px`);
    expect(bridge.element.style.top).toBe(`${516 + 600 * 0.01}px`);
    expect(bridge.element.style.width).toBe(`${74.7 * 0.65}px`);
    const fill = bridge.element.querySelector(
      '.ds-combat-hud__fill',
    ) as HTMLElement;
    expect(fill.style.width).toBe('100%');
    expect(
      bridge.element
        .querySelector('.ds-combat-hud__track')
        ?.getAttribute('aria-valuenow'),
    ).toBe('100');
  });

  it('clamps the Hull ratio to the visible range and updates progress semantics', () => {
    const bridge = createCombatHudBridge();
    document.body.appendChild(bridge.element);
    bridge.update({
      aircraftCenterX: 100,
      aircraftBottomY: 200,
      aircraftWidth: 40,
      hullRatio: 0.4,
      viewportShortSide: 600,
    });
    const fill = bridge.element.querySelector(
      '.ds-combat-hud__fill',
    ) as HTMLElement;
    expect(fill.style.width).toBe('40%');
    expect(
      bridge.element
        .querySelector('.ds-combat-hud__track')
        ?.getAttribute('aria-valuenow'),
    ).toBe('40');
    // Out-of-range values are clamped without changing authoritative state.
    bridge.update({
      aircraftCenterX: 100,
      aircraftBottomY: 200,
      aircraftWidth: 40,
      hullRatio: 1.5,
      viewportShortSide: 600,
    });
    expect(fill.style.width).toBe('100%');
  });

  it('disposes by removing the owned element', () => {
    const bridge = createCombatHudBridge();
    document.body.appendChild(bridge.element);
    bridge.dispose();
    expect(document.querySelector('.ds-combat-hud')).toBeNull();
  });
});
