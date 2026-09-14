import { afterEach, describe, expect, it } from 'vitest';
import { createCombatHudBridge } from './combat-hud-bridge';
import type { CombatHudValues } from './combat-hud-bridge';

afterEach(() => {
  document.body.innerHTML = '';
});

function values(overrides: Partial<CombatHudValues> = {}): CombatHudValues {
  return {
    aircraftCenterX: 640,
    aircraftBottomY: 516,
    aircraftWidth: 74.7,
    hullRatio: 1,
    hullDanger: false,
    viewportShortSide: 600,
    countdownText: '03:10',
    criticalHullVisible: false,
    ...overrides,
  };
}

describe('createCombatHudBridge', () => {
  it('creates the DS-structured Hull bar, Countdown, and CRITICAL HULL elements', () => {
    const bridge = createCombatHudBridge();
    document.body.appendChild(bridge.element);
    expect(bridge.element.className).toContain('ds-combat-hud');
    const track = bridge.element.querySelector('.ds-combat-hud__track');
    expect(track?.getAttribute('role')).toBe('progressbar');
    expect(track?.getAttribute('aria-valuemin')).toBe('0');
    expect(track?.getAttribute('aria-valuemax')).toBe('100');
    expect(track?.querySelector('.ds-combat-hud__fill')).not.toBeNull();
    expect(bridge.element.querySelector('.ds-combat-countdown')).not.toBeNull();
    const critical = bridge.element.querySelector(
      '.ds-combat-critical-hull',
    ) as HTMLElement;
    expect(critical.textContent).toBe('CRITICAL HULL');
    expect(critical.hidden).toBe(true);
  });

  it('positions the bar below the aircraft with the approved geometry and renders the Countdown', () => {
    const bridge = createCombatHudBridge();
    document.body.appendChild(bridge.element);
    bridge.update(values());
    const bar = bridge.element.querySelector(
      '.ds-combat-hud__bar',
    ) as HTMLElement;
    expect(bar.style.left).toBe(`${640 - (74.7 * 0.65) / 2}px`);
    expect(bar.style.top).toBe(`${516 + 600 * 0.01}px`);
    expect(bar.style.width).toBe(`${74.7 * 0.65}px`);
    const fill = bridge.element.querySelector(
      '.ds-combat-hud__fill',
    ) as HTMLElement;
    expect(fill.style.width).toBe('100%');
    expect(fill.style.backgroundColor).toBe('var(--color-accent)');
    expect(
      bridge.element
        .querySelector('.ds-combat-hud__track')
        ?.getAttribute('aria-valuenow'),
    ).toBe('100');
    const countdown = bridge.element.querySelector(
      '.ds-combat-countdown',
    ) as HTMLElement;
    expect(countdown.textContent).toBe('03:10');
  });

  it('keeps Countdown and CRITICAL HULL out of the aircraft-anchored bar and free of per-frame geometry (V02-WI-05 E04 C01)', () => {
    const bridge = createCombatHudBridge();
    document.body.appendChild(bridge.element);
    bridge.update(values({ criticalHullVisible: true }));
    const system = bridge.element.querySelector(
      '.ds-combat-hud__system',
    ) as HTMLElement;
    const countdown = bridge.element.querySelector(
      '.ds-combat-countdown',
    ) as HTMLElement;
    const critical = bridge.element.querySelector(
      '.ds-combat-critical-hull',
    ) as HTMLElement;
    // The defect this guard prevents: a Countdown nested inside the Hull bar
    // inherits the aircraft-following offset, the 65% bar width, and the
    // resulting wrapping (v0.2 §15.2–15.3, DS §8.26).
    expect(countdown.closest('.ds-combat-hud__bar')).toBeNull();
    expect(critical.closest('.ds-combat-hud__bar')).toBeNull();
    expect(system.contains(countdown)).toBe(true);
    expect(system.contains(critical)).toBe(true);
    // Neither the layer root nor the system column is repositioned per frame:
    // only the Hull bar carries inline geometry.
    expect(bridge.element.style.left).toBe('');
    expect(bridge.element.style.top).toBe('');
    expect(bridge.element.style.width).toBe('');
    expect(system.style.left).toBe('');
    expect(system.style.top).toBe('');
    expect(system.style.transform).toBe('');
    expect(countdown.style.left).toBe('');
    expect(countdown.style.top).toBe('');
    expect(countdown.style.width).toBe('');
    expect(critical.style.left).toBe('');
    expect(critical.style.top).toBe('');
  });

  it('uses the danger fill strictly below 25 Hull and toggles CRITICAL HULL visibility', () => {
    const bridge = createCombatHudBridge();
    document.body.appendChild(bridge.element);
    bridge.update(
      values({ hullRatio: 0.2, hullDanger: true, criticalHullVisible: true }),
    );
    const fill = bridge.element.querySelector(
      '.ds-combat-hud__fill',
    ) as HTMLElement;
    expect(fill.style.backgroundColor).toBe('var(--color-danger)');
    const critical = bridge.element.querySelector(
      '.ds-combat-critical-hull',
    ) as HTMLElement;
    expect(critical.hidden).toBe(false);
    // At exactly 25 the fill is accent, not danger (v0.2 §15.3).
    bridge.update(values({ hullRatio: 0.25, hullDanger: false }));
    expect(fill.style.backgroundColor).toBe('var(--color-accent)');
    expect(critical.hidden).toBe(true);
  });

  it('clamps the Hull ratio to the visible range and updates progress semantics', () => {
    const bridge = createCombatHudBridge();
    document.body.appendChild(bridge.element);
    bridge.update(values({ hullRatio: 0.4 }));
    const fill = bridge.element.querySelector(
      '.ds-combat-hud__fill',
    ) as HTMLElement;
    expect(fill.style.width).toBe('40%');
    expect(
      bridge.element
        .querySelector('.ds-combat-hud__track')
        ?.getAttribute('aria-valuenow'),
    ).toBe('40');
    bridge.update(values({ hullRatio: 1.5 }));
    expect(fill.style.width).toBe('100%');
  });

  it('disposes by removing the owned element', () => {
    const bridge = createCombatHudBridge();
    document.body.appendChild(bridge.element);
    bridge.dispose();
    expect(document.querySelector('.ds-combat-hud')).toBeNull();
  });
});
